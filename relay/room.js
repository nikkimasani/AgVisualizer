// One office "room": the same Office state + hook mapper the local server uses, behind a plain
// Request -> Response interface (Web standard APIs only). The Durable Object wraps this; the tests
// run it directly in Node.

import { Office } from '../public/shared/state.js';
import { handleHook, startDarkSweeper } from '../public/shared/hooks.js';

const enc = new TextEncoder();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const MAX_BODY = 16 * 1024;

export class RoomCore {
  constructor({ darkAfterMs = 120000 } = {}) {
    this.office = new Office({ empty: true });
    this.darkAfterMs = darkAfterMs;
    this.clients = new Set();
    this.sweeper = null;
    this.tokens = 80; this.refilled = Date.now();     // rate limit: 40 events/s, burst 80
    this.office.subscribe((ev) => this.broadcast('event', ev));
  }

  broadcast(name, data) {
    const chunk = enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const c of this.clients) c.write(chunk);
  }

  allow() {
    const now = Date.now();
    this.tokens = Math.min(80, this.tokens + (now - this.refilled) * 0.04); this.refilled = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1; return true;
  }

  stream(request) {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const client = { write: (chunk) => writer.write(chunk).catch(() => this.drop(client)) };
    client.ping = setInterval(() => client.write(enc.encode(': ping\n\n')), 15000);
    this.clients.add(client);
    if (!this.sweeper) this.sweeper = startDarkSweeper(this.office, this.darkAfterMs);
    request.signal?.addEventListener('abort', () => this.drop(client));
    client.write(enc.encode(`event: snapshot\ndata: ${JSON.stringify({ ...this.office.snapshot(), mode: 'hooks' })}\n\n`));
    return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
  }

  drop(client) {
    clearInterval(client.ping);
    this.clients.delete(client);
    if (!this.clients.size && this.sweeper) { clearInterval(this.sweeper); this.sweeper = null; }
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/api/state') return json({ ...this.office.snapshot(), mode: 'hooks' });
    if (request.method === 'GET' && pathname === '/api/stream') return this.stream(request);
    if (request.method === 'POST' && (pathname === '/api/actions' || pathname === '/api/walkins')) {
      return json({ error: 'view-only: answer this in your terminal / the real agent' }, 409);
    }
    if (request.method === 'POST' && pathname === '/api/hooks') {
      if (!this.allow()) return json({ error: 'slow down' }, 429);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'body too large' }, 413);
      try { return json(handleHook(this.office, JSON.parse(text))); }
      catch (err) { return json({ error: err.message }, 400); }
    }
    return json({ error: 'not found' }, 404);
  }
}
