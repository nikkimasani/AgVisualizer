// The cast. Plain data shared by the demo director, pipeline simulator and real-agent runner.
//  - room:   where they sit (see public/layout.js)
//  - hair / hairColor / accent: how their NPC looks
//  - tools:  what they "reach for" in the demo
//  - prompt: system prompt when run for real (ANTHROPIC_API_KEY set); only the pipeline roles need one

export const AGENTS = [
  { id: 'poppy',   name: 'Poppy',   role: 'Researcher', room: 'bullpen',   color: '#ffb3d1', hair: 'pigtails', hairColor: '#6b3f2a', accent: '#ff6fa8',
    tools: ['web_search', 'read_url', 'summarize_sources'],
    prompt: 'You are Poppy, a research agent. Given a task, gather the key facts, options and prior art a team would need. Reply with a tight bullet list of findings (max 8 bullets) and any open questions.' },
  { id: 'hazel',   name: 'Hazel',   role: 'Planner', room: 'boardroom', color: '#d6c2ff', hair: 'bun', hairColor: '#2f2230', accent: '#9b7bea',
    tools: ['read_findings', 'draft_spec', 'break_into_steps'],
    prompt: 'You are Hazel, a planning agent. Turn research notes into a short implementation plan: goal, 3-6 ordered steps, and acceptance criteria. Be concrete and brief.' },
  { id: 'juniper', name: 'Juniper', role: 'Engineer', room: 'bullpen', color: '#b8e6c9', hair: 'long', hairColor: '#a8553a', accent: '#4fc08d',
    tools: ['read_file', 'write_file', 'edit_file', 'run_shell'],
    prompt: 'You are Juniper, an engineering agent. Given a plan, produce the implementation as concise code or pseudocode plus a one-paragraph explanation of what you built.' },
  { id: 'tess',    name: 'Tess',    role: 'QA Tester', room: 'review', color: '#ffd9a0', hair: 'bob', hairColor: '#e0b36a', accent: '#f4a636',
    tools: ['run_tests', 'lint', 'write_test'],
    prompt: 'You are Tess, a QA agent. Given an implementation and its plan, list the test cases you would run, which edge cases are likely to break, and a pass/fail verdict with reasons.' },
  { id: 'ava',     name: 'Ava',     role: 'Reviewer', room: 'review', color: '#ffc2c2', hair: 'pony', hairColor: '#241a24', accent: '#f0647a',
    tools: ['review_diff', 'scan_security', 'check_style'],
    prompt: 'You are Ava, a code review and security agent. Review the work and QA notes. Report blocking issues first, then nits. End with APPROVE or REQUEST_CHANGES.' },
  { id: 'penny',   name: 'Penny',   role: 'Writer', room: 'bullpen', color: '#c5dcff', hair: 'curly', hairColor: '#5a3a2e', accent: '#6a9ff5',
    tools: ['read_changes', 'write_doc', 'draft_changelog'],
    prompt: 'You are Penny, a documentation agent. Summarize what was done for a non-technical stakeholder: what changed, why it matters, and how to use it. Max 150 words.' },
  { id: 'clover',  name: 'Clover',  role: 'IC — API core', room: 'bullpen', color: '#c9efb5', hair: 'bob', hairColor: '#7a4a2a', accent: '#6cc24a', tools: ['read_file', 'edit_file', 'run_tests'] },
  { id: 'willow',  name: 'Willow',  role: 'IC — Frontend', room: 'bullpen', color: '#ffc9e3', hair: 'long', hairColor: '#cf8a5a', accent: '#ff6fa8', tools: ['edit_file', 'run_shell', 'screenshot'] },
  { id: 'rosie',   name: 'Rosie',   role: 'IC — Data', room: 'bullpen', color: '#ffd1c4', hair: 'bun', hairColor: '#3a2417', accent: '#f08a6a', tools: ['run_query', 'edit_file', 'plot'] },
  { id: 'luna',    name: 'Luna',    role: 'CTO — architecture', room: 'boardroom', color: '#e1c9ff', hair: 'long', hairColor: '#1f1a2e', accent: '#a56bf0', tools: ['read_file', 'draft_spec', 'review_diff'] },
  { id: 'daisy',   name: 'Daisy',   role: 'COO — air traffic control', room: 'boardroom', color: '#fff0a8', hair: 'pigtails', hairColor: '#e8c36a', accent: '#f4c10f', tools: ['read_inbox', 'draft_spec', 'send_directive'] },
  { id: 'pearl',   name: 'Pearl',   role: 'Security review', room: 'review', color: '#bfeee0', hair: 'pony', hairColor: '#4a2e22', accent: '#35b995', tools: ['scan_security', 'review_diff', 'check_deps'] },
];

// Order a dispatched task flows through the office.
export const PIPELINE = ['poppy', 'hazel', 'juniper', 'tess', 'ava', 'penny'];

export const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

// Looks handed to agents who aren't in the cast (Claude Code sessions, walk-ins).
export const HAIR = ['bob', 'long', 'bun', 'pigtails', 'pony', 'curly'];
export const HAIR_COLORS = ['#6b3f2a', '#2f2230', '#a8553a', '#e0b36a', '#241a24', '#5a3a2e', '#cf8a5a', '#c995e8'];
export const DRESS = ['#ffb3d1', '#d6c2ff', '#b8e6c9', '#ffd9a0', '#c5dcff', '#ffc2c2', '#bfeee0', '#fff0a8'];
export const ACCENT = ['#ff6fa8', '#9b7bea', '#4fc08d', '#f4a636', '#6a9ff5', '#f0647a', '#35b995', '#f4c10f'];
