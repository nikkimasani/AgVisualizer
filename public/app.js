// Office renderer. The server owns truth (agent status); this file owns motion:
// where each NPC stands, where it walks, and what bubble it shows.

const W = 960, H = 600, U = 3; // logical canvas size, sprite pixel unit
const DESK = { w: 150, h: 56 };
const deskPos = (i) => ({ x: 90 + (i % 3) * 300, y: 110 + Math.floor(i / 3) * 190, row: Math.floor(i / 3) });
const CORRIDOR = [225, 410];           // walkable bands in front of desk row 0 / row 1
const AISLES = [315, 615];             // vertical gaps between desk columns
const LOUNGE = [{ x: 90, y: 500 }, { x: 150, y: 520 }, { x: 230, y: 505 }, { x: 300, y: 520 }];
const STATUS_COLOR = { idle: '#6b7390', thinking: '#f9c74f', working: '#4cc9f0', blocked: '#f94144', done: '#90be6d' };

const canvas = document.getElementById('office');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const state = { agents: {}, order: [], selected: null, feed: [] };
const npcs = {}; // id -> { x, y, home, queue, trip, bubble, ... }

// ---------- state sync ----------
function homeOf(a) { const d = deskPos(a.desk); return { x: d.x + 100, y: d.y + 14, row: d.row, exitX: d.x - 22 }; }

function ensureNpc(a) {
  if (npcs[a.id]) return npcs[a.id];
  const h = homeOf(a);
  return (npcs[a.id] = { x: h.x, y: h.y, home: h, trip: null, wait: 0, wanderAt: 6 + Math.random() * 8, say: null, sayUntil: 0, phase: 0, carry: false });
}

function applySnapshot(snap) {
  state.agents = {}; state.order = [];
  for (const a of snap.agents) { state.agents[a.id] = a; state.order.push(a.id); ensureNpc(a); }
  renderCards();
}

function applyEvent(ev) {
  const a = state.agents[ev.agent];
  switch (ev.type) {
    case 'status':
      Object.assign(a, { status: ev.status, task: ev.task !== undefined ? ev.task : a.task });
      if (ev.status === 'idle' || ev.status === 'done') a.tool = null;
      if (ev.status === 'done') a.tasksDone++;
      pushFeed(a, ev.status, ev.task || '');
      break;
    case 'tool':
      a.status = 'working'; a.tool = ev.tool; a.toolCalls++;
      pushFeed(a, 'tool', ev.tool + (ev.detail ? ' — ' + ev.detail : ''));
      break;
    case 'say':
      npcs[a.id].say = ev.text; npcs[a.id].sayUntil = performance.now() + 4500;
      pushFeed(a, 'say', ev.text);
      break;
    case 'handoff': {
      const from = state.agents[ev.from], to = state.agents[ev.to];
      startTrip(ev.from, routeTo(from, { exit: homeOf(to) }), 0.9, true);
      pushFeed(from, 'handoff', `→ ${to.name}`);
      break;
    }
    case 'task': case 'task_update': break;
  }
  renderCards();
}

function pushFeed(a, kind, text) {
  state.feed.unshift({ a, kind, text, t: new Date() });
  state.feed.length = Math.min(state.feed.length, 60);
  renderFeed();
}

// ---------- routing ----------
// Desk -> side exit -> corridor -> (aisle if rows differ) -> destination. Returns outbound points;
// the trip walks them reversed to get home, so we never need the NPC's "current" node.
function routeTo(agent, dest) {
  const h = homeOf(agent);
  const pts = [{ x: h.exitX, y: h.y }];
  const cA = CORRIDOR[h.row];
  pts.push({ x: h.exitX, y: cA });
  if (dest.exit) {                            // another desk: stand beside it
    const t = dest.exit, cB = CORRIDOR[t.row];
    if (cA !== cB) {
      const mid = (h.exitX + t.exitX) / 2;
      const ax = AISLES.reduce((b, v) => (Math.abs(v - mid) < Math.abs(b - mid) ? v : b));
      pts.push({ x: ax, y: cA }, { x: ax, y: cB });
    }
    pts.push({ x: t.exitX, y: cB }, { x: t.exitX, y: t.y });
  } else {                                    // free spot below the desks
    if (cA !== CORRIDOR[1]) {
      const ax = AISLES.reduce((b, v) => (Math.abs(v - h.exitX) < Math.abs(b - h.exitX) ? v : b));
      pts.push({ x: ax, y: cA }, { x: ax, y: CORRIDOR[1] });
    }
    pts.push({ x: dest.x, y: CORRIDOR[1] }, { x: dest.x, y: dest.y });
  }
  return pts;
}

function startTrip(id, out, wait, carry = false) {
  const n = npcs[id];
  n.trip = { out: out.slice(), back: [...out].reverse().slice(1).concat([{ x: n.home.x, y: n.home.y }]), wait, carry, stage: 'out' };
  n.carry = carry;
}

// ---------- simulation tick ----------
const SPEED = 110;
function step(dt, now) {
  for (const id of state.order) {
    const n = npcs[id], a = state.agents[id];
    n.phase += dt;
    const active = a.status !== 'idle';

    if (n.trip) {
      const t = n.trip;
      if (!t.carry && active && t.stage !== 'back') t.stage = 'back', t.out = [];   // got work: head home
      if (t.stage === 'out') {
        if (moveAlong(n, t.out, dt)) { t.stage = 'wait'; n.waitLeft = t.wait; }
      } else if (t.stage === 'wait') {
        n.waitLeft -= dt;
        if (n.waitLeft <= 0) { t.stage = 'back'; n.carry = false; }
      } else if (moveAlong(n, t.back, dt)) { n.trip = null; n.wanderAt = 8 + Math.random() * 10; }
      continue;
    }
    n.walking = false;
    if (!active) {
      n.wanderAt -= dt;
      if (n.wanderAt <= 0) {
        const spot = LOUNGE[Math.floor(Math.random() * LOUNGE.length)];
        startTrip(id, routeTo(a, spot), 5 + Math.random() * 4);
      }
    }
  }
}

function moveAlong(n, pts, dt) {
  n.walking = pts.length > 0;
  let budget = SPEED * dt;
  while (pts.length && budget > 0) {
    const p = pts[0], dx = p.x - n.x, dy = p.y - n.y, d = Math.hypot(dx, dy);
    if (d <= budget) { n.x = p.x; n.y = p.y; budget -= d; pts.shift(); }
    else { n.x += (dx / d) * budget; n.y += (dy / d) * budget; n.facing = dx < -0.1 ? -1 : dx > 0.1 ? 1 : n.facing; budget = 0; }
  }
  if (!pts.length) n.walking = false;
  return pts.length === 0;
}

// ---------- drawing ----------
const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };

function drawFloor() {
  for (let y = 0; y < H; y += 40) for (let x = 0; x < W; x += 40) rect(x, y, 40, 40, (x + y) / 40 % 2 ? '#262b41' : '#2b3048');
  rect(0, 0, W, 56, '#3a4062'); rect(0, 52, W, 6, '#1d2136');       // back wall
  rect(0, 440, W, 4, '#1d2136');                                      // lounge divider
  rect(0, 444, W, H - 444, '#30263a');                                // lounge carpet
  ctx.fillStyle = '#9aa3bd'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('WORKSPACE', 16, 24); ctx.fillText('LOUNGE', 16, 462); ctx.fillText('WAR ROOM', 560, 462);
  // coffee bar + couch
  rect(30, 470, 40, 26, '#6b4f3a'); rect(36, 462, 12, 10, '#d9d9e3'); rect(52, 464, 10, 8, '#f94144');
  rect(120, 540, 200, 30, '#7b5ea7'); rect(120, 530, 200, 14, '#8f73bd');
  // meeting table
  rect(580, 490, 260, 60, '#6b4f3a'); rect(584, 494, 252, 52, '#8a6a4f');
  for (let i = 0; i < 4; i++) { rect(600 + i * 62, 476, 28, 10, '#444b6b'); rect(600 + i * 62, 554, 28, 10, '#444b6b'); }
  // server rack
  rect(880, 70, 50, 90, '#1c1f2e'); for (let i = 0; i < 5; i++) { rect(886, 78 + i * 16, 38, 10, '#2f3550'); rect(890, 81 + i * 16, 4, 4, Math.sin(perfNow / 300 + i) > 0 ? '#90be6d' : '#2f6b3a'); }
}

function drawDesk(a) {
  const d = deskPos(a.desk), n = npcs[a.id], c = STATUS_COLOR[a.status];
  rect(d.x, d.y, DESK.w, DESK.h, '#7a5a40'); rect(d.x, d.y, DESK.w, 6, '#9b7556'); rect(d.x, d.y + DESK.h, DESK.w, 4, '#4a3626');
  // laptop on the left end of the desk, screen glows with agent state
  rect(d.x + 14, d.y + 8, 44, 28, '#171a26');
  const lit = a.status === 'working' || a.status === 'thinking';
  rect(d.x + 17, d.y + 11, 38, 22, lit ? '#12323d' : a.status === 'blocked' ? '#3d1214' : '#1d2133');
  if (lit) for (let i = 0; i < 4; i++) rect(d.x + 20, d.y + 14 + i * 5, 10 + ((Math.floor(perfNow / 200) + i * 7) % 4) * 6, 2, c);
  rect(d.x + 10, d.y + 38, 52, 6, '#2a2f45');
  // nameplate
  ctx.fillStyle = '#f3e9d7'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(a.name, d.x + DESK.w / 2, d.y + DESK.h - 6);
  if (state.selected === a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(d.x - 4, d.y - 4, DESK.w + 8, DESK.h + 12); ctx.setLineDash([]); }
}

function drawNpc(a) {
  const n = npcs[a.id], x = Math.round(n.x), y = Math.round(n.y);
  const stride = n.walking ? Math.floor(n.phase * 8) % 2 : 0;
  const bob = n.walking ? (stride ? -1 : 0) : 0;
  rect(x - 9, y - 2, 18, 5, 'rgba(0,0,0,.25)');                       // shadow
  rect(x - 2 * U, y - 4 * U + (stride ? 0 : 0), U * 2, U * 4 - (stride ? 3 : 0), '#2a2f45'); // legs
  rect(x, y - 4 * U, U * 2, U * 4 - (stride ? 0 : 3), '#2a2f45');
  rect(x - 3 * U, y - 9 * U + bob, U * 6, U * 5, a.color);            // torso
  const typing = !n.walking && (a.status === 'working');
  const armY = y - 8 * U + bob + (typing ? Math.floor(perfNow / 120) % 2 * 2 : 0);
  rect(x - 4 * U, armY, U, U * 3, a.color); rect(x + 3 * U, armY, U, U * 3, a.color); // arms
  rect(x - 2.5 * U, y - 14 * U + bob, U * 5, U * 5, '#f1c27d');       // head
  rect(x - 2.5 * U, y - 14 * U + bob, U * 5, U * 2, '#3b2a20');       // hair
  rect(x - 1.5 * U, y - 11.5 * U + bob, U, U, '#222'); rect(x + 0.5 * U, y - 11.5 * U + bob, U, U, '#222'); // eyes
  if (n.carry) { rect(x - 7, y - 17 * U, 14, 10, '#fff'); ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(x - 7, y - 17 * U); ctx.lineTo(x, y - 17 * U + 6); ctx.lineTo(x + 7, y - 17 * U); ctx.stroke(); }
  if (state.selected === a.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 1, 16, 7, 0, 0, 7); ctx.stroke(); }
}

function bubble(x, y, text, fill, fg = '#12141c') {
  ctx.font = '12px system-ui'; ctx.textAlign = 'center';
  const w = Math.min(Math.ceil(ctx.measureText(text).width) + 14, 230);
  const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
  rect(bx, y - 22, w, 20, fill); rect(x - 3, y - 2, 6, 5, fill);
  ctx.fillStyle = fg; ctx.fillText(fit(text, w - 12), bx + w / 2, y - 8);
}
const fit = (t, w) => { if (ctx.measureText(t).width <= w) return t; while (t.length > 3 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };

function drawBubbles(a) {
  const n = npcs[a.id], x = n.x, y = n.y - 14 * U - 8;
  if (n.say && performance.now() < n.sayUntil) return bubble(x, y, n.say.slice(0, 70), '#fff');
  if (n.walking && n.carry) return;
  const dots = '.'.repeat(1 + Math.floor(perfNow / 300) % 3);
  if (a.status === 'thinking') bubble(x, y, dots, '#f9c74f');
  else if (a.status === 'working') bubble(x, y, a.tool || 'working', '#4cc9f0');
  else if (a.status === 'blocked') bubble(x, y, '! blocked', '#f94144', '#fff');
  else if (a.status === 'done') bubble(x, y, '✓ done', '#90be6d');
}

let perfNow = 0, last = 0;
function frame(t) {
  perfNow = t; const dt = Math.min(0.1, (t - last) / 1000); last = t;
  step(dt, t);
  drawFloor();
  // y-sort desks and NPCs so seated agents sit behind their desk and walkers pass in front
  const items = [];
  for (const id of state.order) {
    const a = state.agents[id], d = deskPos(a.desk);
    items.push({ k: d.y + DESK.h, f: () => drawDesk(a) }, { k: npcs[id].y, f: () => drawNpc(a) });
  }
  items.sort((p, q) => p.k - q.k).forEach((i) => i.f());
  for (const id of state.order) drawBubbles(state.agents[id]);
  requestAnimationFrame(frame);
}

// ---------- DOM panels ----------
const $agents = document.getElementById('agents'), $feed = document.getElementById('feed');

function renderCards() {
  $agents.innerHTML = '';
  for (const id of state.order) {
    const a = state.agents[id], li = document.createElement('li');
    if (state.selected === id) li.className = 'sel';
    li.innerHTML = `<span class="dot ${a.status}"></span><span class="name"></span><span class="stat"></span><span class="sub"></span>`;
    li.querySelector('.name').innerHTML = `${esc(a.name)}<small>${esc(a.role)}</small>`;
    li.querySelector('.stat').textContent = `${a.status} · ${a.toolCalls} calls · ${a.tasksDone} done`;
    li.querySelector('.sub').textContent = a.tool ? `using ${a.tool}` : a.task || 'Waiting for work';
    li.onclick = () => select(state.selected === id ? null : id);
    $agents.append(li);
  }
}

function renderFeed() {
  const rows = state.selected ? state.feed.filter((f) => f.a.id === state.selected) : state.feed;
  document.getElementById('detailTitle').textContent = state.selected ? `${state.agents[state.selected].name}'s activity` : 'Activity';
  $feed.innerHTML = '';
  for (const f of rows.slice(0, 40)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="who" style="color:${f.a.color}"></span><span class="k"></span> <span class="t"></span>`;
    li.querySelector('.who').textContent = f.a.name;
    li.querySelector('.k').textContent = f.kind;
    li.querySelector('.t').textContent = f.text;
    $feed.append(li);
  }
}

function select(id) { state.selected = id; renderCards(); renderFeed(); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width, my = (e.clientY - r.top) * H / r.height;
  const hit = state.order.find((id) => { const n = npcs[id]; return Math.abs(mx - n.x) < 22 && my > n.y - 14 * U - 6 && my < n.y + 6; });
  select(hit && hit !== state.selected ? hit : null);
});

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('taskInput');
  const title = input.value.trim(); if (!title) return;
  input.value = '';
  await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
});

// ---------- connection ----------
const $mode = document.getElementById('mode');
const es = new EventSource('/api/stream');
es.addEventListener('snapshot', (e) => {
  const snap = JSON.parse(e.data); applySnapshot(snap);
  $mode.textContent = snap.mode === 'live' ? 'live Claude agents' : 'simulated agents';
  $mode.className = 'badge ' + snap.mode;
});
es.addEventListener('event', (e) => { const ev = JSON.parse(e.data); if (ev.agent ? state.agents[ev.agent] : ev.from || ev.type.startsWith('task')) applyEvent(ev); });
es.onerror = () => { $mode.textContent = 'reconnecting…'; $mode.className = 'badge'; };

requestAnimationFrame(frame);
