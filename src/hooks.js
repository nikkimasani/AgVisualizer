// Translates Claude Code hook payloads into office events.
//
// Every Claude Code session (and every subagent it spawns) becomes an NPC. Payload fields used:
// hook_event_name, session_id, cwd, tool_name, tool_input, message, prompt, plus agent_id /
// agent_type when the hook fires for a subagent. Missing fields are tolerated.
//
// Facts come from real evidence only: git state is read from the session's cwd, "dark" means the
// session stopped reporting, and "asking" is a Claude Code notification (permission / waiting).

import { basename, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const idFor = (raw) => 'c' + String(raw).replace(/[^a-z0-9]/gi, '').slice(0, 10);

function toolDetail(input = {}) {
  return clip(input.file_path || input.path || input.command || input.pattern || input.url
    || input.query || input.description || input.subagent_type, 80);
}

const run = (cwd, args) => new Promise((res) => {
  execFile('git', ['-C', cwd, ...args], { timeout: 2000 }, (err, out) => res(err ? null : out.trim()));
});

// Branch, uncommitted file count and commits ahead of upstream. Null when cwd isn't a git checkout.
export async function gitFacts(cwd) {
  if (!cwd || !isAbsolute(cwd)) return null;
  const branch = await run(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) return null;
  const status = await run(cwd, ['status', '--porcelain']);
  const ahead = await run(cwd, ['rev-list', '--count', '@{u}..HEAD']);
  return { branch, dirty: status ? status.split('\n').length : 0, ahead: Number(ahead) || 0 };
}

const roomFor = (type = '') => (/review|secur/i.test(type) ? 'review' : /plan|architect/i.test(type) ? 'boardroom' : 'bullpen');

export function handleHook(office, p, { later = setTimeout, git = gitFacts } = {}) {
  const event = p?.hook_event_name;
  const raw = p?.agent_id || p?.session_id;
  if (!event || !raw) return { ignored: true };
  const id = idFor(raw);
  const isSub = Boolean(p.agent_id);
  office.lastSeen ??= new Map();
  office.lastSeen.set(id, Date.now());

  const ensure = () => {
    if (office.agents[id]) return true;
    const info = {
      id,
      name: clip(isSub ? p.agent_type || 'subagent' : basename(p.cwd || '') || 'claude', 16),
      role: isSub ? 'Subagent' : 'Claude Code',
      room: isSub ? roomFor(p.agent_type) : 'bullpen',
    };
    try { office.emit({ type: 'agent_join', info }); return true; } catch { /* full: try to evict */ }
    const idle = Object.values(office.agents).find((a) => a.status === 'idle');
    if (!idle) return false;
    office.emit({ type: 'agent_leave', id: idle.id });
    office.emit({ type: 'agent_join', info });
    return true;
  };
  const status = (s, extra = {}) => office.emit({ type: 'status', agent: id, status: s, ...extra });
  const settle = (ms, fn) => later(fn, ms).unref?.();
  const refreshGit = async () => {
    const facts = isSub ? null : await git(p.cwd);
    if (facts && office.agents[id]) office.emit({ type: 'git', agent: id, ...facts });
  };

  switch (event) {
    case 'SessionStart':
      if (ensure()) refreshGit();
      break;
    case 'UserPromptSubmit':
      if (ensure()) { status('thinking', { task: clip(p.prompt, 80) }); refreshGit(); }
      break;
    case 'PreToolUse':
      if (ensure()) office.emit({ type: 'tool', agent: id, tool: clip(p.tool_name, 40) || 'tool', detail: toolDetail(p.tool_input) });
      break;
    case 'PostToolUse':
      if (office.agents[id]) {
        status('thinking');
        if (/git\s+(commit|merge|rebase|reset|checkout|switch)/.test(p.tool_input?.command || '')) refreshGit();
      }
      break;
    case 'PostToolUseFailure':
      if (office.agents[id]) office.emit({ type: 'say', agent: id, text: `${clip(p.tool_name, 40)} failed` });
      break;
    case 'Notification': {   // permission prompt or "waiting for input": the agent needs the human
      if (!ensure()) break;
      const q = clip(p.message, 120) || 'Needs your attention';
      status('asking', { decision: { id: 'ASK', q, options: [] } });
      break;
    }
    case 'SubagentStart':
      if (ensure()) {
        const parent = idFor(p.session_id);
        if (office.agents[parent] && parent !== id) office.emit({ type: 'handoff', from: parent, to: id, note: clip(p.agent_type, 40) });
      }
      break;
    case 'Stop':
    case 'SubagentStop':
      if (!ensure()) break;
      if (typeof p.last_assistant_message === 'string') office.emit({ type: 'say', agent: id, text: clip(p.last_assistant_message, 120) });
      status('done');
      settle(3000, async () => {
        if (office.agents[id]?.status !== 'done') return;
        if (isSub || event === 'SubagentStop') { office.emit({ type: 'agent_leave', id }); return; }
        await refreshGit();
        const a = office.agents[id];
        if (!a || a.status !== 'done') return;
        // A clean checkout with commits not yet pushed is a branch waiting for a PR.
        if (a.ahead > 0 && a.dirty === 0) status('ready', { note: `${a.ahead} commit${a.ahead > 1 ? 's' : ''} ahead on ${a.branch}` });
        else status('idle', { task: null });
      });
      break;
    case 'SessionEnd':
      if (office.agents[id]) office.emit({ type: 'agent_leave', id });
      break;
    default:
      return { ignored: true };
  }
  return { ok: true };
}

// Agents that claim to be working but stopped reporting go dark (they keep their desk so you notice).
export function startDarkSweeper(office, afterMs = 120000, everyMs = 10000) {
  return setInterval(() => {
    const now = Date.now();
    for (const a of Object.values(office.agents)) {
      const seen = office.lastSeen?.get(a.id);
      if (seen && (a.status === 'working' || a.status === 'thinking') && now - seen > afterMs) {
        office.emit({ type: 'status', agent: a.id, status: 'dark', note: 'stopped reporting' });
      }
    }
  }, everyMs).unref();
}
