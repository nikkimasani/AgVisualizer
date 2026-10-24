import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Office } from '../public/shared/state.js';
import { SEATS } from '../public/shared/layout.js';
import { handleHook, startDarkSweeper } from '../public/shared/hooks.js';

const mk = (facts) => {
  const office = new Office({ empty: true });
  const timers = [];
  const later = (fn) => { timers.push(fn); return 0; };
  // like the real hook script: git facts ride along on the payload
  const hook = (p) => handleHook(office, { session_id: 's1', cwd: '/work/myapp', ...(facts && { agvis_git: facts }), ...p }, { later });
  return { office, hook, timers };
};
const first = (o) => Object.values(o.agents)[0];

test('first hook makes a Claude Code NPC named after the project folder', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' });
  const a = first(office);
  assert.equal(a.name, 'myapp');
  assert.equal(a.role, 'Claude Code');
  assert.equal(a.status, 'thinking');
  assert.equal(a.task, 'fix the bug');
});

test('tool use shows the tool and detail; post-tool returns to thinking', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } });
  const a = first(office);
  assert.equal(a.tool, 'Edit');
  assert.match(a.log.at(-1).text, /src\/a\.js/);
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit' });
  assert.equal(a.status, 'thinking');
});

test('Notification makes the agent ask for you, with the message as the question', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
  const a = first(office);
  assert.equal(a.status, 'asking');
  assert.match(a.decision.q, /permission/);
  hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' });
  assert.equal(a.decision, null);
});

test('git facts sent with the payload are attached to the agent (and sanitised)', () => {
  const { office, hook } = mk({ branch: 'feat/x', dirty: 0, ahead: 2 });
  hook({ hook_event_name: 'SessionStart' });
  assert.equal(first(office).branch, 'feat/x');
  assert.equal(first(office).ahead, 2);
});

test('Stop: clean checkout with unpushed commits is ready; otherwise idle', () => {
  const ready = mk({ branch: 'feat/x', dirty: 0, ahead: 2 });
  ready.hook({ hook_event_name: 'Stop' });
  assert.equal(first(ready.office).status, 'done');
  ready.timers.forEach((f) => f());
  assert.equal(first(ready.office).status, 'ready');

  const idle = mk({ branch: 'main', dirty: 3, ahead: 1 });
  idle.hook({ hook_event_name: 'Stop' });
  idle.timers.forEach((f) => f());
  assert.equal(first(idle.office).status, 'idle');
});

test('subagents get their own NPC (routed by type), a handoff, and leave when stopped', () => {
  const { office, hook, timers } = mk();
  hook({ hook_event_name: 'SessionStart' });
  const events = [];
  office.subscribe((e) => events.push(e.type));
  hook({ hook_event_name: 'SubagentStart', agent_id: 'sub-123', agent_type: 'security-reviewer' });
  assert.equal(Object.keys(office.agents).length, 2);
  assert.ok(events.includes('handoff'));
  const sub = office.agents.csub123;
  assert.equal(SEATS[sub.seat].room, 'review');
  hook({ hook_event_name: 'SubagentStop', agent_id: 'sub-123' });
  timers.forEach((f) => f());
  assert.equal(Object.keys(office.agents).length, 1);
});

test('a full office evicts an idle agent, and ignores events when nobody is idle', () => {
  const { office, hook } = mk();
  for (let i = 0; i < SEATS.length; i++) hook({ hook_event_name: 'UserPromptSubmit', session_id: `s${i}`, prompt: 'x' });
  assert.equal(Object.keys(office.agents).length, SEATS.length);
  hook({ hook_event_name: 'UserPromptSubmit', session_id: 'extra', prompt: 'x' });
  assert.equal(office.agents.cextra, undefined);
});

test('agents that stop reporting go dark', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' });
  office.lastSeen.set(first(office).id, Date.now() - 500);
  const t = startDarkSweeper(office, 100, 20);
  return new Promise((resolve) => setTimeout(() => {
    clearInterval(t);
    assert.equal(first(office).status, 'dark');
    resolve();
  }, 80));
});

test('unknown or malformed payloads are ignored', () => {
  const { hook } = mk();
  assert.deepEqual(hook({ hook_event_name: 'Whatever' }), { ignored: true });
  assert.deepEqual(handleHook(new Office({ empty: true }), {}), { ignored: true });
});

test('the slim payload is understood: project name, detail, no cwd needed', () => {
  const office = new Office({ empty: true });
  handleHook(office, { hook_event_name: 'PreToolUse', session_id: 'q', project: 'secret-app', tool_name: 'Bash', detail: 'npm test' });
  const a = Object.values(office.agents)[0];
  assert.equal(a.name, 'secret-app');
  assert.match(a.log.at(-1).text, /npm test/);
});

test('minimal sharing still works: no prompt, detail or message needed', () => {
  const office = new Office({ empty: true });
  handleHook(office, { hook_event_name: 'UserPromptSubmit', session_id: 'q', project: 'app' });
  handleHook(office, { hook_event_name: 'PreToolUse', session_id: 'q', project: 'app', tool_name: 'Edit' });
  const a = Object.values(office.agents)[0];
  assert.equal(a.status, 'working');
  assert.equal(a.tool, 'Edit');
});
