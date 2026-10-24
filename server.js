// AgVisualizer server: static files + SSE stream + tiny JSON API. Zero dependencies.
//
//   GET  /api/state    current snapshot
//   GET  /api/stream   Server-Sent Events (snapshot, then every event)
//   POST /api/events   push an event from any agent/hook  (see src/state.js)
//   POST /api/hooks    Claude Code hook payload (see hooks/agvis-hook.js)
//   POST /api/tasks    {"title": "..."} run a task through the team

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Office } from './src/state.js';
import { simulateTask } from './src/simulator.js';
import { runTask } from './src/runner.js';
import { handleHook } from './src/hooks.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // endpoints are unauthenticated: stay on loopback by default
const HOOKS = process.env.OFFICE_MODE === 'hooks';
const SPEED = Number(process.env.SIM_SPEED) || 1;
const REAL = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.MODE !== 'sim';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

export const office = new Office({ empty: HOOKS });

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new Error('body too large');
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

async function serveStatic(req, res) {
  const path = req.url.split('?')[0];
  const file = resolve(join(ROOT, normalize(path === '/' ? '/index.html' : path)));
  if (file !== resolve(ROOT) && !file.startsWith(resolve(ROOT) + sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/state') return json(res, 200, office.snapshot());

    if (req.method === 'GET' && req.url === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const send = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      send('snapshot', { ...office.snapshot(), mode: HOOKS ? 'hooks' : REAL ? 'live' : 'sim' });
      const off = office.subscribe((ev) => send('event', ev));
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { off(); clearInterval(ping); });
      return;
    }

    // Block cross-site POSTs from web pages; curl, hooks and our own page send no foreign Origin.
    if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      return json(res, 403, { error: 'cross-origin request refused' });
    }

    if (req.method === 'POST' && req.url === '/api/hooks') {
      try { return json(res, 200, handleHook(office, await readBody(req))); }
      catch (err) { return json(res, 400, { error: err.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/events') {
      try { return json(res, 200, office.emit(await readBody(req))); }
      catch (err) { return json(res, 400, { error: err.message }); }
    }

    if (req.method === 'POST' && req.url === '/api/tasks') {
      const { title } = await readBody(req);
      if (typeof title !== 'string' || !title.trim()) return json(res, 400, { error: 'title required' });
      const task = { id: randomUUID().slice(0, 8), title: title.trim().slice(0, 140) };
      (REAL ? runTask(office, task) : simulateTask(office, task, { speed: SPEED }))
        .catch((err) => console.error('task failed', err));
      return json(res, 202, task);
    }

    if (req.method === 'GET') return serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (err) {
    json(res, 400, { error: err.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => console.log(`AgVisualizer → http://localhost:${PORT}  (${HOOKS ? 'watching Claude Code hooks' : REAL ? 'live Claude agents' : 'simulated agents'})`));
}
