// Scripted "fake work" so the office is alive with no API key. It emits the same
// events a real agent would, so the UI can't tell the difference.

import { PIPELINE, byId } from './agents.js';

const SAY = {
  scout: ['Found 3 relevant approaches.', 'Sources look solid — passing notes on.'],
  archie: ['Plan is 4 steps, small blast radius.', 'Spec drafted, acceptance criteria listed.'],
  dev: ['Implementation compiles. Over to QA.', 'Wired it up; added a small helper.'],
  tess: ['12 tests pass, 1 flaky edge case.', 'Edge cases covered. Looks green.'],
  ava: ['No security issues. Two style nits.', 'Approved with minor comments.'],
  penny: ['Release notes written.', 'Docs updated and summarized.'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export async function simulateTask(office, task, { speed = 1 } = {}) {
  const wait = (ms) => sleep(ms / speed);
  office.emit({ type: 'task', id: task.id, title: task.title, state: 'running' });

  let prev = null;
  for (const id of PIPELINE) {
    const agent = byId[id];
    if (prev) {
      office.emit({ type: 'handoff', from: prev, to: id, note: task.title });
      await wait(2200); // time for the courier NPC to walk over
    }
    office.emit({ type: 'status', agent: id, status: 'thinking', task: task.title });
    await wait(1200 + Math.random() * 800);

    const tools = agent.tools.slice(0, 2 + Math.floor(Math.random() * 2));
    for (const tool of tools) {
      office.emit({ type: 'tool', agent: id, tool, detail: task.title });
      await wait(1800 + Math.random() * 1800);
    }

    // Tess occasionally hits a snag so "blocked" gets exercised.
    if (id === 'tess' && Math.random() < 0.35) {
      office.emit({ type: 'status', agent: id, status: 'blocked', task: 'Flaky test — retrying' });
      await wait(2500);
      office.emit({ type: 'tool', agent: id, tool: 'run_tests', detail: 'retry' });
      await wait(1800);
    }

    office.emit({ type: 'say', agent: id, text: pick(SAY[id]) });
    office.emit({ type: 'status', agent: id, status: 'done' });
    await wait(900);
    office.emit({ type: 'status', agent: id, status: 'idle', task: null });
    prev = id;
  }
  office.emit({ type: 'task_update', id: task.id, state: 'done' });
}
