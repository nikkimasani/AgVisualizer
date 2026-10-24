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

## Make it yours (the fun stuff)

Tap **☰ Toolbox**. Everything here is saved in your browser only and never changes what real agents are doing.

- **🛋️ Edit Office** — pick a card (ping-pong, pool, foosball, arcade, pinball, jukebox, dance floor, cozy console, bean bag,
  sofa, boba cart, photo booth, rug, plants, lamps, flower arch, balloons, cat tower), tap the floor to place it. Tap a piece
  to rotate / move / remove; ↩ undoes. Items can't go on desks, walkways or across walls.
- **Agents use what you place** — idle agents walk to the furniture: two of them rally at the ping-pong table, someone
  dances at the jukebox, naps on a bean bag, sips boba. Real work always interrupts instantly.
- **✨ Agent Manager** — rename, restyle (hair, hair colour, dress, shoes, accessory), see mood / energy / friendship, and
  hang out: head pats, cake, boba, dance party, high five, compliments, their favourite snack. Friendship levels up
  Stranger → Friend → Bestie → Soulmate.
- **🎨 Themes** — Blossom, Mint Garden, Lavender Dream, Peach Café, Midnight Candy.
- **🎉 Party planner** — birthday cake (Fri 3pm), boba o'clock (daily 2pm), dance party (Fri 5pm), or start any now.
  A friendly pink 🛸 UFO can borrow an agent on a break and bring her back.
- **🎀 Visitors** — Santa, a Fairy Godmother, a Witchy Pumpkin and friends drop by, chat about how your agents are doing
  (cheering a ready branch, comforting a blocked one) and wander the floor. Turn them off in the toolbox.
- Tap the **office cat** in the garden to pet her.

## Deploying (Cloudflare Pages / Vercel)

The UI is static, so both work with **no build step**:

- **Cloudflare Pages**: connect the repo, build command *(none)*, build output directory `public`.
- **Vercel**: import the repo; `vercel.json` already sets `outputDirectory: public`.

A hosted copy runs the **demo inside the visitor's browser** (the same state + director code the server uses,
shared from `public/shared/`). Nothing is sent anywhere.

To show **your real Claude Code sessions** on a hosted page, deploy the relay (below) and paste its URL into the
page's menu (☰ → *Show my real Claude Code sessions*). The URL is stored only in that browser.

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

### Claude Code on the web (cloud sessions)

This repo ships `.claude/settings.json`, so any Claude Code session opened **on this repo** (cloud or local) reports to
the office. Set `AGVIS_URL` (your relay URL, secret included) as an environment variable in the cloud environment's
settings; with it unset the hooks quietly do nothing. Other repos need the same file and variable.

### Hosted UI + relay (Cloudflare Worker)

Your hooks run on your machine; a hosted page can't see it. `relay/` is a Cloudflare Worker + Durable Object that
receives the hook events and streams them to any page you open. Deploy it once:

```bash
cd relay
npx wrangler deploy                                   # prints https://agvisualizer-relay.<you>.workers.dev
openssl rand -hex 16                                  # your room secret, e.g. 3f9c…
npx wrangler secret put ALLOWED_ROOMS                 # paste the secret (only listed rooms are accepted)
```

Then on each machine that runs Claude Code, set (shell profile or the `env` block of `settings.json`):

```bash
export AGVIS_URL=https://agvisualizer-relay.<you>.workers.dev/r/<secret>
```

…and open your hosted UI, ☰ → paste the same URL. Or use `?server=<that URL>` once.

- **The URL is the password** (a capability URL): anyone with it can watch and post. Rotate by changing the secret.
- **Privacy:** to a non-local `AGVIS_URL` the hook sends *minimal* data — tool **names**, project folder name,
  branch / ahead / uncommitted counts, and Claude's notification text. No prompts, file paths, commands or replies
  (`AGVIS_SHARE=full` opts in). Git facts are read on your machine, never by the relay.
- Room state lives in memory in the Durable Object: if it's evicted, agents re-appear on their next event.
- Limits: 16 KB bodies, 40 events/s per room. Actions that need the real agent stay view-only.

The local server binds `127.0.0.1` (`HOST` to change) and refuses cross-origin POSTs unless listed in `ALLOW_ORIGIN`.

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
  index.html style.css app.js render.js furniture.js source.js
  edit.js fun.js looks.js toolbox.js theme.js store.js   (Edit Office, fun layer, Agent Manager, toolbox, themes, saving)
  shared/              pure ES modules used by BOTH browser and server
    agents.js state.js demo.js layout.js hooks.js   (hooks.js = Claude Code payload -> events)
    catalog.js placement.js life.js                 (furniture, where it may go, moods / friendship / calendar)
relay/                 Cloudflare Worker + Durable Object relay (wrangler.toml, worker.js, room.js)
server.js              optional Node server: SSE + API + hooks endpoint
src/runner.js          real Claude-backed pipeline
hooks/                 hook script + example settings
```

`npm test` runs the state, inbox-action, hook-mapping, relay, placement, friendship and calendar tests.
