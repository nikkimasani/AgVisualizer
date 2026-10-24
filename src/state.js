// Authoritative office state. Every change is an event; events are applied here
// and then broadcast to browsers over SSE. Anything that can POST an event
// (the simulator, the real-agent runner, a Claude Code hook) drives the office.

import { AGENTS } from './agents.js';

const STATUSES = new Set(['idle', 'thinking', 'working', 'blocked', 'done']);
const LOG_LIMIT = 40;

export class Office {
  constructor() {
    this.listeners = new Set();
    this.seq = 0;
    this.tasks = [];
    this.agents = Object.fromEntries(
      AGENTS.map((a) => [a.id, {
        id: a.id, name: a.name, role: a.role, color: a.color, desk: a.desk,
        status: 'idle', task: null, tool: null, toolCalls: 0, tasksDone: 0, log: [],
      }]),
    );
  }

  snapshot() {
    return { agents: Object.values(this.agents), tasks: this.tasks.slice(-8), seq: this.seq };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Validates + applies an event. Returns the stored event or throws.
  emit(input) {
    const ev = { ...input, ts: Date.now(), seq: ++this.seq };
    const a = this.agents[ev.agent];
    const need = (cond, msg) => { if (!cond) { this.seq--; throw new Error(msg); } };

    switch (ev.type) {
      case 'status':
        need(a, `unknown agent "${ev.agent}"`);
        need(STATUSES.has(ev.status), `bad status "${ev.status}"`);
        a.status = ev.status;
        if (ev.task !== undefined) a.task = ev.task;
        if (ev.status === 'idle' || ev.status === 'done') a.tool = null;
        if (ev.status === 'done') a.tasksDone++;
        this.#log(a, ev.status, ev.task || '');
        break;
      case 'tool':
        need(a, `unknown agent "${ev.agent}"`);
        need(typeof ev.tool === 'string' && ev.tool, 'tool name required');
        a.status = 'working';
        a.tool = ev.tool;
        a.toolCalls++;
        this.#log(a, 'tool', `${ev.tool}${ev.detail ? ' — ' + ev.detail : ''}`);
        break;
      case 'say':
        need(a, `unknown agent "${ev.agent}"`);
        need(typeof ev.text === 'string', 'text required');
        this.#log(a, 'say', ev.text);
        break;
      case 'handoff':
        need(this.agents[ev.from] && this.agents[ev.to], 'handoff needs valid from/to');
        this.#log(this.agents[ev.from], 'handoff', `→ ${this.agents[ev.to].name}${ev.note ? ': ' + ev.note : ''}`);
        break;
      case 'task':
        need(typeof ev.title === 'string' && ev.title, 'title required');
        this.tasks.push({ id: ev.id, title: ev.title, state: ev.state || 'running' });
        if (this.tasks.length > 20) this.tasks.shift();
        break;
      case 'task_update': {
        const t = this.tasks.find((x) => x.id === ev.id);
        if (t) t.state = ev.state;
        break;
      }
      default:
        this.seq--;
        throw new Error(`unknown event type "${ev.type}"`);
    }
    for (const fn of this.listeners) fn(ev);
    return ev;
  }

  #log(agent, kind, text) {
    agent.log.push({ ts: Date.now(), kind, text: String(text).slice(0, 400) });
    if (agent.log.length > LOG_LIMIT) agent.log.shift();
  }
}
