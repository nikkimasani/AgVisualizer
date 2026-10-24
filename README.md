# AgVisualizer 🌸

A cute isometric office where every AI agent is a little character. See who's working, who has a branch
ready for a PR, who needs your call, who's blocked, and who went dark — then click through to deal with it.
Inspired by [officefloor](https://github.com/seanle24246/officefloor) and
[agent-flow](https://github.com/patoles/agent-flow).

Zero dependencies. The UI is plain static files in `public/`.

## Try it

```bash
npm start                       # simulated office (server)           → http://localhost:3000
npm run start:hooks             # empty office that fills with your real Claude Code sessions
python3 -m http.server -d public   # or any static server: the demo runs entirely in the browser
```

Drag to pan, wheel / pinch to zoom, **N** = needs-me inbox, **C** = recenter, click a character to inspect.

## What's on the floor

| You see | Meaning |
|---|---|
| 💻 / 💭 | working (bubble shows the tool) / thinking |
| ❓ | **needs your call** — a decision is waiting (permission prompt in hooks mode) |
| 📦 | a clean branch with commits ahead is **ready for a PR** |
| 🚧 | blocked, with the reason |
| 🥀 | **went dark** — said it was working but stopped reporting |
| 💤 | on a break (hanging out in the kitchen, rec room, lounge or garden) |

- **🙋 needs me** — everything waiting on you, oldest first. Answer a decision, mark a branch collected, poke a dark agent.
- **Floor activity** — filterable feed: All · Ready · Decisions · Dark · Funny.
- **Office events** — walk-ins knock at the door; let them stay (**Y**) or send them away (**N**).
- **Office time** — the light follows your clock (tap to cycle day / dusk / night).
- Rooms: Pink Boardroom (planners / C-suite), Bullpen, Review + Security, Café Kitchen, Rec Room, Lounge, Garden (with a cat).
- The 🌷 "funny" lines (ping-pong, tea, petting the cat) are decoration only; they never change real state.

## Deploying (Cloudflare Pages / Vercel)

The UI is static, so both work with **no build step**:

- **Cloudflare Pages**: connect the repo, build command *(none)*, build output directory `public`.
- **Vercel**: import the repo; `vercel.json` already sets `outputDirectory: public`.

A hosted copy runs the **demo inside the visitor's browser** (the same state + director code the server uses,
shared from `public/shared/`). Nothing is sent anywhere.

To point a hosted UI at a live backend, add `?server=https://your-backend` to the URL. The backend must allow the
page's origin: `ALLOW_ORIGIN=https://your-site.pages.dev npm run start:hooks`. A hosted page reaching a server on
your own machine (`?server=http://127.0.0.1:3000`) works in Chrome/Firefox but not Safari (mixed content), and has
not been tested end to end. For Claude Code sessions on a different machine than the browser you'd want a small
relay (e.g. a Cloudflare Worker + Durable Object that accepts the hook POSTs and fans out SSE) — not built yet.

## Real Claude Code sessions (hooks)

```bash
npm run start:hooks
```

Add the hooks from `hooks/settings.example.json` to `~/.claude/settings.json` (replace the path), then run `claude`:

- each session is a character named after its project folder; each subagent walks in, gets a hand-off from its
  parent, and leaves when done (security / review agents sit in Review + Security, planners in the boardroom)
- prompt → thinking, tool call → working, permission prompt / waiting for input → ❓ asking, stop → done → idle
- **real git facts** read from the session's checkout: branch, uncommitted files, commits ahead; a finished
  session with a clean checkout and unpushed commits shows 📦 ready
- no events for 2 minutes while "working" → 🥀 dark (`DARK_AFTER_SECONDS`)
- the hook script has an 800 ms timeout and swallows errors, so it never slows or breaks Claude Code
- actions that need the real agent (answering a permission prompt) are view-only: do them in the terminal

The server binds `127.0.0.1` (`HOST` to change) and refuses cross-origin POSTs unless listed in `ALLOW_ORIGIN`.

## Live Claude agents

Set `ANTHROPIC_API_KEY` and dispatching a task runs the six pipeline agents (Poppy → Hazel → Juniper → Tess → Ava →
Penny) as real Claude calls. `MODE=sim` forces the simulation. *Not yet exercised against the real API.*

## Drive it from anything

`POST /api/events` takes the same events the UI consumes:

| type | fields |
|---|---|
| `status` | `agent`, `status` (idle/thinking/working/blocked/asking/ready/dark/bench/done), optional `task`, `note`, `blocker`, `decision {id,q,options}`, `branch`, `ahead`, `dirty` |
| `tool` | `agent`, `tool`, optional `detail` |
| `git` | `agent`, `branch`, `ahead`, `dirty` |
| `say` | `agent`, `text` |
| `handoff` | `from`, `to`, optional `note` |
| `agent_join` / `agent_leave` | `info {id,name,role,room}` / `id` |

## Layout

```
public/                static site (this is what you deploy)
  index.html style.css app.js render.js source.js
  shared/              pure ES modules used by BOTH browser and server
    agents.js state.js demo.js layout.js
server.js              optional Node server: SSE + API + hooks endpoint
src/hooks.js           Claude Code hook payload -> events (+ git facts, dark sweeper)
src/runner.js          real Claude-backed pipeline
hooks/                 hook script + example settings
```

`npm test` runs the state, inbox-action and hook-mapping tests.
