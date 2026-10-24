#!/usr/bin/env node
// Claude Code hook -> AgVisualizer bridge. Reads the hook payload from stdin, adds real git facts from
// the session's checkout, strips it down, and hands it to a detached sender — so Claude Code is never
// slowed or broken (the hook itself exits in a few ms; every error is swallowed; no output).
//
//   AGVIS_URL    where to send: http://127.0.0.1:3000 (default) or your relay, https://<worker>/r/<secret>
//   AGVIS_SHARE  "minimal" (default for non-local URLs): only tool NAMES, project folder, branch facts.
//                "full"    (default for localhost): also prompt text, file paths / commands, last message.

import { spawn, execFile } from 'node:child_process';
import { basename, isAbsolute } from 'node:path';

const URL_BASE = (process.env.AGVIS_URL || `http://127.0.0.1:${process.env.AGVIS_PORT || 3000}`).replace(/\/$/, '');
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(URL_BASE);
const FULL = (process.env.AGVIS_SHARE || (LOCAL ? 'full' : 'minimal')) === 'full';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const git = (cwd, args) => new Promise((res) => execFile('git', ['-C', cwd, ...args], { timeout: 1500 }, (e, out) => res(e ? null : out.trim())));

async function gitFacts(cwd) {
  if (!cwd || !isAbsolute(cwd)) return null;
  const [branch, status, ahead] = await Promise.all([
    git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']), git(cwd, ['status', '--porcelain']), git(cwd, ['rev-list', '--count', '@{u}..HEAD']),
  ]);
  return branch ? { branch, dirty: status ? status.split('\n').length : 0, ahead: Number(ahead) || 0 } : null;
}

function detail(input = {}) {
  return clip(input.file_path || input.path || input.command || input.pattern || input.url || input.query || input.description || input.subagent_type, 80);
}

async function main(raw) {
  const p = JSON.parse(raw);
  const ev = p.hook_event_name;
  const slim = {
    hook_event_name: ev, session_id: p.session_id, agent_id: p.agent_id, agent_type: p.agent_type,
    tool_name: p.tool_name, project: basename(p.cwd || ''), message: clip(p.message, 120),
  };
  if (FULL) {
    slim.detail = detail(p.tool_input);
    slim.prompt = clip(p.prompt, 80);
    slim.last_assistant_message = clip(p.last_assistant_message, 120);
  }
  const wantsGit = ['SessionStart', 'UserPromptSubmit', 'Stop'].includes(ev)
    || (ev === 'PostToolUse' && /\bgit\s+(commit|merge|rebase|reset|checkout|switch|push|pull)\b/.test(p.tool_input?.command || ''));
  if (wantsGit && !p.agent_id) slim.agvis_git = await gitFacts(p.cwd);
  // Detached sender: the hook returns immediately instead of waiting on the network.
  const child = spawn(process.execPath, [new URL(import.meta.url).pathname, '--send'], { detached: true, stdio: ['pipe', 'ignore', 'ignore'], env: { ...process.env, AGVIS_URL: URL_BASE } });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(slim));
  child.unref();
}

if (process.argv.includes('--send')) {
  let body = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { body += c; });
  process.stdin.on('end', async () => {
    try { await fetch(`${URL_BASE}/api/hooks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(5000) }); } catch { /* relay/server not up */ }
    process.exit(0);
  });
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', async () => { try { await main(input); } catch { /* never block Claude Code */ } process.exit(0); });
}
