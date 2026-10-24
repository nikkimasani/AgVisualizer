// Translates Claude Code hook payloads into office events.
//
// Every Claude Code session (and every subagent it spawns) becomes an NPC. Payload fields used:
// hook_event_name, session_id, cwd, tool_name, tool_input, message, prompt, plus agent_id /
// agent_type when the hook fires for a subagent. Missing fields are tolerated.

import { basename } from 'node:path';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const idFor = (raw) => 'c' + String(raw).replace(/[^a-z0-9]/gi, '').slice(0, 10);

function toolDetail(input = {}) {
  return clip(input.file_path || input.path || input.command || input.pattern || input.url
    || input.query || input.description || input.subagent_type, 80);
}

export function handleHook(office, p, { later = setTimeout } = {}) {
  const event = p?.hook_event_name;
  const raw = p?.agent_id || p?.session_id;
  if (!event || !raw) return { ignored: true };
  const id = idFor(raw);
  const isSub = Boolean(p.agent_id);

  const ensure = () => {
    if (office.agents[id]) return true;
    const info = {
      id,
      name: clip(isSub ? p.agent_type || 'subagent' : basename(p.cwd || '') || 'claude', 16),
      role: isSub ? 'Subagent' : 'Claude Code',
    };
    try { office.emit({ type: 'agent_join', info }); return true; } catch { /* full: try to evict */ }
    const idle = Object.values(office.agents).find((a) => a.status === 'idle');
    if (!idle) return false;
    office.emit({ type: 'agent_leave', id: idle.id });
    office.emit({ type: 'agent_join', info });
    return true;
  };
  const status = (s, task) => office.emit({ type: 'status', agent: id, status: s, ...(task !== undefined && { task }) });
  const settle = (ms, fn) => later(fn, ms).unref?.();

  switch (event) {
    case 'SessionStart':
      ensure(); break;
    case 'UserPromptSubmit':
      if (ensure()) status('thinking', clip(p.prompt, 80));
      break;
    case 'PreToolUse':
      if (ensure()) office.emit({ type: 'tool', agent: id, tool: clip(p.tool_name, 40) || 'tool', detail: toolDetail(p.tool_input) });
      break;
    case 'PostToolUse':
      if (office.agents[id]) status('thinking');
      break;
    case 'PostToolUseFailure':
      if (office.agents[id]) office.emit({ type: 'say', agent: id, text: `${clip(p.tool_name, 40)} failed` });
      break;
    case 'Notification':   // permission prompt or "waiting for input": the agent needs the human
      if (ensure()) status('blocked', clip(p.message, 80) || 'Needs your attention');
      break;
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
      settle(3000, () => {
        if (office.agents[id]?.status !== 'done') return;
        if (isSub || event === 'SubagentStop') office.emit({ type: 'agent_leave', id });
        else status('idle', null);
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
