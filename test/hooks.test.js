import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Office } from '../src/state.js';
import { handleHook } from '../src/hooks.js';

const mk = () => {
  const office = new Office({ empty: true });
  const timers = [];
  const later = (fn) => { timers.push(fn); return { unref() {} }; };
  const hook = (p) => handleHook(office, { session_id: 's1', cwd: '/work/myapp', ...p }, { later });
  return { office, hook, timers };
};

test('first hook makes a Claude Code NPC named after the project folder', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'UserPromptSubmit', prompt: 'fix the bug' });
  const [a] = Object.values(office.agents);
  assert.equal(a.name, 'myapp');
  assert.equal(a.role, 'Claude Code');
  assert.equal(a.status, 'thinking');
  assert.equal(a.task, 'fix the bug');
});

test('tool use shows the tool and a detail; post-tool returns to thinking', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/a.js' } });
  const a = Object.values(office.agents)[0];
  assert.equal(a.tool, 'Edit');
  assert.match(a.log.at(-1).text, /src\/a\.js/);
  hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit' });
  assert.equal(a.status, 'thinking');
});

test('Notification marks the agent blocked', () => {
  const { office, hook } = mk();
  hook({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
  assert.equal(Object.values(office.agents)[0].status, 'blocked');
});

test('Stop => done, then idle once the timer fires', () => {
  const { office, hook, timers } = mk();
  hook({ hook_event_name: 'Stop' });
  const a = Object.values(office.agents)[0];
  assert.equal(a.status, 'done');
  timers.forEach((f) => f());
  assert.equal(a.status, 'idle');
});

test('subagents get their own NPC, a handoff, and leave when stopped', () => {
  const { office, hook, timers } = mk();
  hook({ hook_event_name: 'SessionStart' });
  const events = [];
  office.subscribe((e) => events.push(e.type));
  hook({ hook_event_name: 'SubagentStart', agent_id: 'sub-123', agent_type: 'Explore' });
  assert.equal(Object.keys(office.agents).length, 2);
  assert.ok(events.includes('handoff'));
  hook({ hook_event_name: 'SubagentStop', agent_id: 'sub-123' });
  timers.forEach((f) => f());
  assert.equal(Object.keys(office.agents).length, 1);
});

test('a full office evicts an idle agent, and ignores events when nobody is idle', () => {
  const { office, hook } = mk();
  for (let i = 0; i < 6; i++) hook({ hook_event_name: 'UserPromptSubmit', session_id: `s${i}`, prompt: 'x' });
  assert.equal(Object.keys(office.agents).length, 6);
  hook({ hook_event_name: 'UserPromptSubmit', session_id: 'extra', prompt: 'x' });
  assert.equal(Object.keys(office.agents).length, 6);
  assert.ok(!Object.values(office.agents).some((a) => a.id === 'cextra'));
});

test('unknown or malformed payloads are ignored', () => {
  const { hook } = mk();
  assert.deepEqual(hook({ hook_event_name: 'Whatever' }), { ignored: true });
  assert.deepEqual(handleHook(new Office({ empty: true }), {}), { ignored: true });
});
