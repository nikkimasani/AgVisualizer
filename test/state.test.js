import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Office } from '../public/shared/state.js';
import { SEATS } from '../public/shared/layout.js';

test('the cast starts seated, one agent per seat, in their own rooms', () => {
  const o = new Office();
  const seats = Object.values(o.agents).map((a) => a.seat);
  assert.equal(new Set(seats).size, seats.length);
  assert.ok(seats.every((s) => s >= 0));
  assert.equal(SEATS[o.agents.hazel.seat].room, 'boardroom');
  assert.equal(SEATS[o.agents.tess.seat].room, 'review');
});

test('status and tool events update the agent, its log, and carry a state snapshot', () => {
  const o = new Office();
  o.emit({ type: 'status', agent: 'juniper', status: 'thinking', task: 'x' });
  const ev = o.emit({ type: 'tool', agent: 'juniper', tool: 'write_file' });
  const a = o.agents.juniper;
  assert.equal(a.status, 'working');
  assert.equal(a.tool, 'write_file');
  assert.equal(a.log.length, 2);
  assert.equal(ev.state.tool, 'write_file');
  assert.equal('log' in ev.state, false);
});

test('asking carries a decision, blocked carries a blocker, and both clear on work', () => {
  const o = new Office();
  o.emit({ type: 'status', agent: 'ava', status: 'asking', decision: { id: 'DN-1', q: 'ship it?', options: ['yes', 'no'] } });
  assert.equal(o.agents.ava.decision.id, 'DN-1');
  o.emit({ type: 'status', agent: 'ava', status: 'blocked', blocker: 'waiting on API' });
  assert.equal(o.agents.ava.decision, null);
  assert.equal(o.agents.ava.blocker, 'waiting on API');
  o.emit({ type: 'tool', agent: 'ava', tool: 'review_diff' });
  assert.equal(o.agents.ava.blocker, null);
});

test('git facts and done are tracked', () => {
  const o = new Office();
  o.emit({ type: 'git', agent: 'tess', branch: 'tess/x', ahead: 3, dirty: 0 });
  assert.equal(o.agents.tess.ahead, 3);
  o.emit({ type: 'status', agent: 'tess', status: 'done' });
  assert.equal(o.agents.tess.tasksDone, 1);
  assert.equal(o.agents.tess.tool, null);
});

test('invalid events are rejected without consuming a sequence number', () => {
  const o = new Office();
  assert.throws(() => o.emit({ type: 'status', agent: 'nobody', status: 'idle' }));
  assert.throws(() => o.emit({ type: 'status', agent: 'ava', status: 'napping' }));
  assert.throws(() => o.emit({ type: 'bogus' }));
  assert.equal(o.seq, 0);
});

test('inbox actions: answer, collect, nudge, unblock only apply to the right state', () => {
  const o = new Office();
  assert.throws(() => o.act('ava', 'answer', 'x'));
  o.emit({ type: 'status', agent: 'ava', status: 'asking', decision: { id: 'DN-1', q: '?', options: ['a'] } });
  o.act('ava', 'answer', 'a');
  assert.equal(o.agents.ava.status, 'working');
  o.emit({ type: 'status', agent: 'tess', status: 'ready', branch: 'b', ahead: 2 });
  o.act('tess', 'collect');
  assert.equal(o.agents.tess.status, 'idle');
  assert.equal(o.agents.tess.tasksDone, 1);
  o.emit({ type: 'status', agent: 'pearl', status: 'dark' });
  o.act('pearl', 'nudge');
  assert.equal(o.agents.pearl.status, 'working');
  o.emit({ type: 'status', agent: 'luna', status: 'blocked', blocker: 'x' });
  o.act('luna', 'unblock');
  assert.equal(o.agents.luna.status, 'working');
});

test('walk-ins become agents only when accepted, and take a free seat', () => {
  const o = new Office();
  o.emit({ type: 'walkin', id: 'w1', name: 'Coco', role: 'Support', hair: 'bob', color: '#ffb3d1', accent: '#ff6fa8', hairColor: '#333333' });
  assert.equal(o.walkins.size, 1);
  o.resolveWalkin('w1', true);
  assert.equal(o.walkins.size, 0);
  assert.equal(o.agents['w-w1'].name, 'Coco');
  assert.ok(o.agents['w-w1'].seat >= 0);
  o.emit({ type: 'walkin', id: 'w2', name: 'Mimi' });
  o.resolveWalkin('w2', false);
  assert.equal(o.agents['w-w2'], undefined);
});

test('subscribers receive applied events', () => {
  const o = new Office();
  const seen = [];
  o.subscribe((e) => seen.push(e.type));
  o.emit({ type: 'handoff', from: 'poppy', to: 'hazel' });
  assert.deepEqual(seen, ['handoff']);
});
