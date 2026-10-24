import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Office } from '../src/state.js';

test('status and tool events update the agent and log', () => {
  const o = new Office();
  o.emit({ type: 'status', agent: 'dev', status: 'thinking', task: 'x' });
  o.emit({ type: 'tool', agent: 'dev', tool: 'write_file' });
  const dev = o.agents.dev;
  assert.equal(dev.status, 'working');
  assert.equal(dev.tool, 'write_file');
  assert.equal(dev.toolCalls, 1);
  assert.equal(dev.log.length, 2);
});

test('done increments tasksDone and clears the tool', () => {
  const o = new Office();
  o.emit({ type: 'tool', agent: 'tess', tool: 'run_tests' });
  o.emit({ type: 'status', agent: 'tess', status: 'done' });
  assert.equal(o.agents.tess.tasksDone, 1);
  assert.equal(o.agents.tess.tool, null);
});

test('invalid events are rejected without consuming a sequence number', () => {
  const o = new Office();
  assert.throws(() => o.emit({ type: 'status', agent: 'nobody', status: 'idle' }));
  assert.throws(() => o.emit({ type: 'status', agent: 'dev', status: 'napping' }));
  assert.throws(() => o.emit({ type: 'bogus' }));
  assert.equal(o.seq, 0);
});

test('subscribers receive applied events', () => {
  const o = new Office();
  const seen = [];
  o.subscribe((e) => seen.push(e.type));
  o.emit({ type: 'handoff', from: 'scout', to: 'archie' });
  assert.deepEqual(seen, ['handoff']);
});
