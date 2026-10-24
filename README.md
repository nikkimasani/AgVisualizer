# AgVisualizer

A tiny pixel-art office where every AI agent is an NPC. Watch them sit at their desks, think, call
tools, get blocked, walk documents to each other, and wander to the lounge when idle.

Zero dependencies — Node 20+ only.

```bash
npm start            # http://localhost:3000
```

Type a task in the box and the team works it as a pipeline. Click an agent to filter the activity feed.

## Starter agents

| Agent  | Role       | Does                                      | Typical tools                    |
|--------|------------|-------------------------------------------|----------------------------------|
| Scout  | Researcher | Gathers facts, options, prior art         | web_search, read_url             |
| Archie | Planner    | Turns findings into a spec + steps        | draft_spec, break_into_steps     |
| Dev    | Engineer   | Implements the plan                       | read_file, write_file, run_shell |
| Tess   | QA Tester  | Tests, finds edge cases (can get blocked) | run_tests, lint, write_test      |
| Ava    | Reviewer   | Code + security review                    | review_diff, scan_security       |
| Penny  | Writer     | Release notes / docs for stakeholders     | write_doc, draft_changelog       |

Edit `src/agents.js` to rename, add or reorder them (`PIPELINE` sets the hand-off order). A new agent
needs a free desk slot in `public/app.js` (`deskPos`, currently a 3×2 grid).

## Modes

- **Simulated** (default): scripted work, no API key needed.
- **Live**: set `ANTHROPIC_API_KEY` and each agent becomes a real Claude call fed the previous agent's
  output (`ANTHROPIC_MODEL` overrides the model, `MODE=sim` forces simulation).
  *The live path has not been exercised against the real API yet.*

`SIM_SPEED=3 npm start` speeds up the simulation. `PORT` changes the port.

## Drive it from your own agents

The office is just an event stream. Anything can `POST /api/events`:

```bash
curl -XPOST localhost:3000/api/events -H 'content-type: application/json' \
  -d '{"type":"tool","agent":"dev","tool":"run_shell","detail":"npm test"}'
```

| type                  | fields                                                                  |
|-----------------------|-------------------------------------------------------------------------|
| `status`              | `agent`, `status` (idle/thinking/working/blocked/done), optional `task` |
| `tool`                | `agent`, `tool`, optional `detail`                                      |
| `say`                 | `agent`, `text`                                                         |
| `handoff`             | `from`, `to`, optional `note`                                           |
| `task`, `task_update` | `id`, `title` / `state`                                                 |

That makes it straightforward to wire up Claude Code hooks or another agent framework later.

## Layout

```
server.js         HTTP + SSE + API
src/agents.js     roster and pipeline
src/state.js      office state + event validation
src/simulator.js  scripted fake work
src/runner.js     real Claude-backed pipeline
public/           canvas renderer (app.js) and UI
```

Inspired by [officefloor](https://github.com/seanle24246/officefloor) and
[agent-flow](https://github.com/patoles/agent-flow).
