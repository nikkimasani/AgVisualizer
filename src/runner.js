// Real agents: each pipeline stage is one Claude call, fed the previous stage's
// output. Used automatically when ANTHROPIC_API_KEY is set (MODE=sim forces the
// simulator). Emits the same events as the simulator.

import { PIPELINE, byId } from './agents.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

async function callClaude(system, user) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

export async function runTask(office, task) {
  office.emit({ type: 'task', id: task.id, title: task.title, state: 'running' });
  let prev = null;
  let context = '';
  for (const id of PIPELINE) {
    const agent = byId[id];
    if (prev) {
      office.emit({ type: 'handoff', from: prev, to: id, note: task.title });
      await new Promise((r) => setTimeout(r, 2200));
    }
    office.emit({ type: 'status', agent: id, status: 'thinking', task: task.title });
    try {
      office.emit({ type: 'tool', agent: id, tool: 'claude_call', detail: MODEL });
      const user = `Task: ${task.title}\n\n${context ? `Work so far:\n${context}` : 'You are first in the pipeline.'}`;
      const out = await callClaude(agent.prompt, user);
      context += `\n[${agent.name}]\n${out}\n`;
      office.emit({ type: 'say', agent: id, text: out.replace(/\s+/g, ' ').slice(0, 300) });
      office.emit({ type: 'status', agent: id, status: 'done' });
    } catch (err) {
      office.emit({ type: 'say', agent: id, text: String(err.message) });
      office.emit({ type: 'status', agent: id, status: 'blocked', task: 'API error' });
      office.emit({ type: 'task_update', id: task.id, state: 'failed' });
      return;
    }
    await new Promise((r) => setTimeout(r, 800));
    office.emit({ type: 'status', agent: id, status: 'idle', task: null });
    prev = id;
  }
  office.emit({ type: 'task_update', id: task.id, state: 'done' });
}
