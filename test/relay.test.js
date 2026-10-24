import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomCore } from '../relay/room.js';

const post = (core, path, body) => core.fetch(new Request(`http://x${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

async function readEvents(res, n) {
  const reader = res.body.getReader(), dec = new TextDecoder(), out = [];
  let buf = '';
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    for (const block of buf.split('\n\n').slice(0, -1)) {
      const m = block.match(/^event: (\w+)\ndata: (.*)$/s);
      if (m) out.push({ name: m[1], data: JSON.parse(m[2]) });
    }
    buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
    if (out.length >= n) break;
  }
  reader.cancel();
  return out;
}

test('hook events posted to the room stream out to viewers, snapshot first', async () => {
  const core = new RoomCore();
  const stream = await core.fetch(new Request('http://x/api/stream'));
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  assert.equal((await post(core, '/api/hooks', { hook_event_name: 'UserPromptSubmit', session_id: 's1', project: 'webapp', prompt: 'hi' })).status, 200);
  const got = await readEvents(stream, 3);
  assert.equal(got[0].name, 'snapshot');
  assert.equal(got[0].data.mode, 'hooks');
  const types = got.slice(1).map((e) => e.data.type);
  assert.deepEqual(types, ['agent_join', 'status']);
  assert.equal(got[1].data.info.name, 'webapp');
  core.clients.forEach((c) => core.drop(c));
});

test('state endpoint reflects posted events; actions are view-only', async () => {
  const core = new RoomCore();
  await post(core, '/api/hooks', { hook_event_name: 'Notification', session_id: 's9', project: 'api', message: 'needs permission' });
  const state = await (await core.fetch(new Request('http://x/api/state'))).json();
  assert.equal(state.agents[0].status, 'asking');
  assert.equal((await post(core, '/api/actions', { agent: 'x', action: 'answer' })).status, 409);
});

test('bad input is refused: junk JSON, oversize bodies, unknown paths, and floods', async () => {
  const core = new RoomCore();
  assert.equal((await post(core, '/api/hooks', 'not json')).status, 400);
  assert.equal((await post(core, '/api/hooks', 'x'.repeat(20000))).status, 413);
  assert.equal((await core.fetch(new Request('http://x/nope'))).status, 404);
  let limited = 0;
  for (let i = 0; i < 200; i++) if ((await post(core, '/api/hooks', { hook_event_name: 'SessionStart', session_id: 'f' })).status === 429) limited++;
  assert.ok(limited > 50, `expected rate limiting, got ${limited}`);
});
