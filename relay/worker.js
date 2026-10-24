// Cloudflare Worker + Durable Object relay for AgVisualizer.
//
//   hooks (your machine) --POST /r/<secret>/api/hooks-->  Worker  -->  OfficeRoom (one Durable Object per <secret>)
//   hosted UI            <--SSE  /r/<secret>/api/stream--                holds the Office state, fans out events
//
// The <secret> in the URL is the only credential (a capability URL): anyone who has it can watch and post.
// Set ALLOWED_ROOMS (comma-separated) so strangers can't mint rooms on your account.

import { RoomCore } from './room.js';

export class OfficeRoom {
  constructor(state, env) {
    this.core = new RoomCore({ darkAfterMs: Number(env.DARK_AFTER_SECONDS || 120) * 1000 });
  }
  fetch(request) { return this.core.fetch(request); }
}

const ROOM = /^[A-Za-z0-9_-]{16,64}$/;

function cors(env, request, res) {
  const allow = (env.ALLOW_ORIGIN || '*').split(',').map((s) => s.trim());
  const origin = request.headers.get('origin');
  const h = new Headers(res.headers);
  if (allow.includes('*')) h.set('access-control-allow-origin', '*');
  else if (origin && allow.includes(origin)) { h.set('access-control-allow-origin', origin); h.set('vary', 'origin'); }
  h.set('access-control-allow-headers', 'content-type');
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(env, request, new Response(null, { status: 204 }));
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/r\/([^/]+)(\/api\/.*)$/);
    if (!m) return cors(env, request, new Response('AgVisualizer relay ok\n', { status: url.pathname === '/' ? 200 : 404 }));
    const [, room, rest] = m;
    const allowed = (env.ALLOWED_ROOMS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!ROOM.test(room) || (allowed.length && !allowed.includes(room))) return cors(env, request, new Response('not found', { status: 404 }));
    const stub = env.ROOM.get(env.ROOM.idFromName(room));
    const inner = new Request(new URL(rest + url.search, url.origin), request);
    return cors(env, request, await stub.fetch(inner));
  },
};
