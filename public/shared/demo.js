// The demo "director": keeps the office alive with no API key. It emits the same events a real
// agent fleet would — work, hand-offs ready for PR, decisions that need you, blockers, agents going
// dark, walk-ins — so the UI can't tell the difference. Also hosts the dispatched-task pipeline.

import { PIPELINE, byId, HAIR, HAIR_COLORS, DRESS, ACCENT } from './agents.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (a, b) => a + Math.random() * (b - a);

const TASKS = ['Refactor the auth module', 'Polish the onboarding flow', 'Write the billing migration', 'Fix a flaky test', 'Speed up search', 'Update the docs', 'Tidy the design tokens'];
const SLUGS = ['onboarding-polish', 'auth-refactor', 'search-speedup', 'billing-migration', 'docs-refresh', 'token-cleanup'];
const BLOCKERS = ['waiting on the API contract to merge', 'waiting on design review', 'the staging env is down', 'missing a sandbox API key'];
const DECISIONS = [
  { q: 'ship behind a flag or hold for review?', options: ['Ship behind a flag', 'Hold for review'] },
  { q: 'rename the public API field now or later?', options: ['Rename now', 'Later'] },
  { q: 'use the cheaper model for the nightly job?', options: ['Yes, cheaper', 'Keep current'] },
  { q: 'merge with one flaky test, or fix first?', options: ['Merge', 'Fix first'] },
];
const WALKINS = [['Bonnie', 'IC — Mobile'], ['Mimi', 'Designer'], ['Pippa', 'IC — Infra'], ['Coco', 'Support'], ['Nori', 'IC — ML'], ['Sage', 'Analyst'], ['Blossom', 'IC — Growth']];

export function startDemo(office, { speed = 1 } = {}) {
  const wait = new Map();       // agent id -> earliest next action (ms epoch)
  let dn = 10;
  let nextWalkin = Date.now() + 9000 / speed;
  const later = (ms, fn) => setTimeout(fn, ms / speed).unref?.();
  const delay = (id, lo, hi) => wait.set(id, Date.now() + between(lo, hi) * 1000 / speed);

  const work = (a) => {
    const task = a.task || pick(TASKS);
    office.emit({ type: 'status', agent: a.id, status: 'thinking', task });
    later(1200, () => {
      if (office.agents[a.id]?.status === 'thinking') office.emit({ type: 'tool', agent: a.id, tool: pick(byId[a.id]?.tools || ['read_file', 'edit_file', 'run_tests']), detail: task });
    });
  };

  const step = (a) => {
    const age = (Date.now() - a.since) * speed / 1000;
    switch (a.status) {
      case 'idle': {
        const r = Math.random();
        if (r < 0.6) { work(a); delay(a.id, 8, 16); }
        else if (r < 0.72) { office.emit({ type: 'status', agent: a.id, status: 'bench', note: 'taking a breather' }); delay(a.id, 14, 26); }
        else delay(a.id, 4, 9);
        break;
      }
      case 'thinking': delay(a.id, 3, 5); break;
      case 'working': {
        const tool = () => office.emit({ type: 'tool', agent: a.id, tool: pick(byId[a.id]?.tools || ['read_file', 'edit_file', 'run_tests']), detail: a.task });
        if (age < 9) { tool(); delay(a.id, 3, 5); break; }
        const r = Math.random();
        if (r < 0.26) {
          const ahead = 1 + Math.floor(Math.random() * 4);
          office.emit({ type: 'git', agent: a.id, ahead, branch: `${a.id}/${pick(SLUGS)}`, dirty: 0 });
          office.emit({ type: 'status', agent: a.id, status: 'ready', note: 'branch ready for PR' });
          delay(a.id, 16, 28);
        } else if (r < 0.42) {
          const d = pick(DECISIONS);
          office.emit({ type: 'status', agent: a.id, status: 'asking', decision: { id: `DN-${dn++}`, q: d.q, options: d.options } });
          delay(a.id, 60, 120);
        } else if (r < 0.56) {
          office.emit({ type: 'status', agent: a.id, status: 'blocked', blocker: pick(BLOCKERS) });
          delay(a.id, 12, 22);
        } else if (r < 0.64) {
          office.emit({ type: 'status', agent: a.id, status: 'dark', note: 'holding an unread directive' });
          delay(a.id, 16, 30);
        } else if (r < 0.84) {
          office.emit({ type: 'git', agent: a.id, ahead: (a.ahead || 0) + 1, dirty: 0 });
          office.emit({ type: 'status', agent: a.id, status: 'done', task: a.task });
          later(1500, () => office.agents[a.id] && office.emit({ type: 'status', agent: a.id, status: 'idle', task: null }));
          delay(a.id, 5, 10);
        } else { tool(); delay(a.id, 3, 6); }
        break;
      }
      case 'ready': office.act(a.id, 'collect'); delay(a.id, 8, 14); break;
      case 'asking': // nobody answered: the agent makes its own call
        office.emit({ type: 'say', agent: a.id, text: 'No reply — going with my best guess.' });
        office.emit({ type: 'status', agent: a.id, status: 'working' });
        delay(a.id, 6, 12); break;
      case 'blocked': office.emit({ type: 'status', agent: a.id, status: 'working', note: 'unblocked' }); delay(a.id, 8, 14); break;
      case 'dark': office.emit({ type: 'status', agent: a.id, status: 'working', note: 'back at the desk' }); delay(a.id, 8, 14); break;
      case 'bench': office.emit({ type: 'status', agent: a.id, status: 'idle' }); delay(a.id, 6, 12); break;
      default: office.emit({ type: 'status', agent: a.id, status: 'idle' });
    }
  };

  const tick = () => {
    const now = Date.now();
    for (const a of Object.values(office.agents)) {
      if (office.busy.has(a.id) || (wait.get(a.id) || 0) > now) continue;
      try { step(a); } catch (err) { console.error('demo step failed', err.message); }
    }
    if (now >= nextWalkin && office.walkins.size === 0 && office.freeSeat('bullpen') >= 0) {
      const used = new Set(Object.values(office.agents).map((x) => x.name));
      const [name, role] = pick(WALKINS.filter(([n]) => !used.has(n)).concat([[`Guest${Math.floor(Math.random() * 90 + 10)}`, 'Visitor']]));
      const id = Math.random().toString(36).slice(2, 8);
      const k = Math.floor(Math.random() * 8);
      office.emit({ type: 'walkin', id, name, role, color: DRESS[k], accent: ACCENT[k], hair: pick(HAIR), hairColor: pick(HAIR_COLORS) });
      later(50000, () => office.walkins.has(id) && office.resolveWalkin(id, false)); // nobody answered
      nextWalkin = now + between(70, 110) * 1000 / speed;
    }
  };

  // Stagger the opening state so the floor isn't a wall of identical idle agents.
  const agents = Object.values(office.agents);
  agents.forEach((a, i) => { wait.set(a.id, Date.now() + (i * 400 + between(0, 2500)) / speed); });
  return setInterval(tick, 1000 / Math.max(1, speed / 2)).unref?.() ?? undefined;
}

// A dispatched task flows through the pipeline: each agent works it, then hands it to the next.
export async function simulateTask(office, task, { speed = 1 } = {}) {
  const wait = (ms) => sleep(ms / speed);
  office.emit({ type: 'task', id: task.id, title: task.title, state: 'running' });
  for (const id of PIPELINE) office.busy.add(id);
  try {
    let prev = null;
    for (const id of PIPELINE) {
      const agent = byId[id];
      if (!office.agents[id]) continue;
      if (prev) { office.emit({ type: 'handoff', from: prev, to: id, note: task.title }); await wait(2600); }
      office.emit({ type: 'status', agent: id, status: 'thinking', task: task.title });
      await wait(1200 + Math.random() * 800);
      for (const tool of agent.tools.slice(0, 2 + Math.floor(Math.random() * 2))) {
        office.emit({ type: 'tool', agent: id, tool, detail: task.title });
        await wait(1800 + Math.random() * 1800);
      }
      if (id === 'tess' && Math.random() < 0.35) {
        office.emit({ type: 'status', agent: id, status: 'blocked', blocker: 'flaky test — retrying' });
        await wait(2500);
        office.emit({ type: 'tool', agent: id, tool: 'run_tests', detail: 'retry' });
        await wait(1800);
      }
      office.emit({ type: 'say', agent: id, text: pick(['On it — done!', 'All wrapped up ✨', 'Passing it along.', 'Looks good to me!']) });
      office.emit({ type: 'status', agent: id, status: 'done', task: task.title });
      await wait(900);
      office.emit({ type: 'status', agent: id, status: 'idle', task: null });
      office.busy.delete(id);
      prev = id;
    }
    office.emit({ type: 'task_update', id: task.id, state: 'done' });
  } finally {
    for (const id of PIPELINE) office.busy.delete(id);
  }
}
