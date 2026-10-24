// Translates Claude Code hook payloads into office events. Pure (no Node APIs), so the same code runs
// in the local server and in the Cloudflare relay.
//
// Every Claude Code session (and every subagent it spawns) becomes a character. It reads either a raw
// Claude Code hook payload (hook_event_name, session_id, cwd, tool_name, tool_input, message, prompt,
// agent_id / agent_type for subagents) or the slim payload hooks/agvis-hook.js sends, which adds:
//   project   folder name only (no full path)        detail / prompt / last_assistant_message  (omitted when sharing is "minimal")
//   agvis_git { branch, dirty, ahead }  read on the user's machine — a hosted relay can't run git
// Facts come from real evidence only: git state from the checkout, "dark" = stopped reporting,
// "asking" = a Claude Code notification (permission prompt / waiting for input).

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const idFor = (raw) => 'c' + String(raw).replace(/[^a-z0-9]/gi, '').slice(0, 10);
const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';

function toolDetail(input = {}) {
  return clip(input.file_path || input.path || input.command || input.pattern || input.url
    || input.query || input.description || input.subagent_type, 80);
}

const roomFor = (type = '') => (/review|secur/i.test(type) ? 'review' : /plan|architect/i.test(type) ? 'boardroom' : 'bullpen');

export function handleHook(office, p, { later = setTimeout } = {}) {
  const event = p?.hook_event_name;
  const raw = p?.agent_id || p?.session_id;
  if (!event || typeof event !== 'string' || !raw) return { ignored: true };
  const id = idFor(raw);
  const isSub = Boolean(p.agent_id);
  office.lastSeen ??= new Map();
  office.lastSeen.set(id, Date.now());

  const ensure = () => {
    if (office.agents[id]) return true;
    const info = {
      id,
      name: clip(isSub ? p.agent_type || 'subagent' : p.project || baseName(p.cwd) || 'claude', 16),
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
  const settle = (ms, fn) => later(fn, ms);
  const applyGit = () => {
    const g = p.agvis_git;
    if (isSub || !g || typeof g.branch !== 'string' || !office.agents[id]) return;
    office.emit({ type: 'git', agent: id, branch: clip(g.branch, 60), dirty: Math.max(0, Math.min(9999, Number(g.dirty) || 0)), ahead: Math.max(0, Math.min(9999, Number(g.ahead) || 0)) });
  };

  switch (event) {
    case 'SessionStart':
      if (ensure()) applyGit();
      break;
    case 'UserPromptSubmit':
      if (ensure()) { status('thinking', { task: clip(p.prompt, 80) || 'working on a prompt' }); applyGit(); }
      break;
    case 'PreToolUse':
      if (ensure()) office.emit({ type: 'tool', agent: id, tool: clip(p.tool_name, 40) || 'tool', detail: p.detail !== undefined ? clip(p.detail, 80) : toolDetail(p.tool_input) });
      break;
    case 'PostToolUse':
      if (office.agents[id]) { status('thinking'); applyGit(); }
      break;
    case 'PostToolUseFailure':
      if (office.agents[id]) office.emit({ type: 'say', agent: id, text: `${clip(p.tool_name, 40)} failed` });
      break;
    case 'Notification': {   // permission prompt or "waiting for input": the agent needs the human
      if (!ensure()) break;
      status('asking', { decision: { id: 'ASK', q: clip(p.message, 120) || 'Needs your attention', options: [] } });
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
      applyGit();
      if (typeof p.last_assistant_message === 'string' && p.last_assistant_message) office.emit({ type: 'say', agent: id, text: clip(p.last_assistant_message, 120) });
      status('done');
      settle(3000, () => {
        const a = office.agents[id];
        if (!a || a.status !== 'done') return;
        if (isSub) { office.emit({ type: 'agent_leave', id }); return; }
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
  const t = setInterval(() => {
    const now = Date.now();
    for (const a of Object.values(office.agents)) {
      const seen = office.lastSeen?.get(a.id);
      if (seen && (a.status === 'working' || a.status === 'thinking') && now - seen > afterMs) {
        office.emit({ type: 'status', agent: a.id, status: 'dark', note: 'stopped reporting' });
      }
    }
  }, everyMs);
  t.unref?.();
  return t;
}
