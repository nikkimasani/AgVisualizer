// Where the office's events come from. The UI never cares which:
//   local  – the whole demo runs in the browser (static hosting: Cloudflare Pages, Vercel, anything)
//   remote – an AgVisualizer server (same origin, or ?server=https://host) streams events over SSE
// Both expose the same small surface: { mode, act, walkin, dispatch }.

import { Office } from './shared/state.js';
import { startDemo, simulateTask } from './shared/demo.js';

const params = new URLSearchParams(location.search);

function local(h) {
  const office = new Office();
  h.onSnapshot({ ...office.snapshot(), mode: 'demo' });
  office.subscribe((ev) => h.onEvent(ev));
  startDemo(office, { speed: Number(params.get('speed')) || 1 });
  const wrap = (fn) => async (...a) => { try { fn(...a); return {}; } catch (e) { return { error: e.message }; } };
  return {
    mode: 'demo',
    act: wrap((agent, action, choice) => office.act(agent, action, choice)),
    walkin: wrap((id, accepted) => office.resolveWalkin(id, accepted)),
    dispatch: wrap((title) => { simulateTask(office, { id: Math.random().toString(36).slice(2, 8), title }, { speed: Number(params.get('speed')) || 1 }); }),
  };
}

function remote(base, h) {
  const es = new EventSource(base + '/api/stream');
  es.addEventListener('snapshot', (e) => { const s = JSON.parse(e.data); src.mode = s.mode; h.onSnapshot(s); });
  es.addEventListener('event', (e) => h.onEvent(JSON.parse(e.data)));
  es.onerror = () => h.onStatus?.('reconnecting…');
  const post = async (path, body) => {
    try {
      const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      return r.ok ? {} : { error: j.error || `HTTP ${r.status}` };
    } catch (e) { return { error: e.message }; }
  };
  const src = {
    mode: 'live',
    act: (agent, action, choice) => post('/api/actions', { agent, action, choice }),
    walkin: (id, accepted) => post('/api/walkins', { id, accepted }),
    dispatch: (title) => post('/api/tasks', { title }),
  };
  return src;
}

// Only localhost can have our own server behind it; static hosts would just 404 (or serve index.html).
async function probeSameOrigin() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false;
  try {
    const r = await fetch('/api/state', { signal: AbortSignal.timeout(900) });
    return r.ok && (r.headers.get('content-type') || '').includes('json');
  } catch { return false; }
}

export async function connect(h) {
  const server = params.get('server');
  if (server) return remote(server.replace(/\/$/, ''), h);
  if (!params.has('demo') && await probeSameOrigin()) return remote('', h);
  return local(h);
}
