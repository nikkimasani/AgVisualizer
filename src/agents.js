// The starter roster. Each agent is plain data: the office, simulator and
// real-agent runner all read from here, so adding an agent = adding an entry.
//
//  - desk:   index into the office's desk grid (see public/app.js DESKS)
//  - tools:  what the agent "reaches for"; shown as speech bubbles + in the log
//  - prompt: system prompt used when running for real (ANTHROPIC_API_KEY set)

export const AGENTS = [
  {
    id: 'scout', name: 'Scout', role: 'Researcher', color: '#4cc9f0', desk: 0,
    tools: ['web_search', 'read_url', 'summarize_sources'],
    prompt: 'You are Scout, a research agent. Given a task, gather the key facts, options and prior art a team would need. Reply with a tight bullet list of findings (max 8 bullets) and any open questions.',
  },
  {
    id: 'archie', name: 'Archie', role: 'Planner', color: '#f9c74f', desk: 1,
    tools: ['read_findings', 'draft_spec', 'break_into_steps'],
    prompt: 'You are Archie, a planning agent. Turn research notes into a short implementation plan: goal, 3-6 ordered steps, and acceptance criteria. Be concrete and brief.',
  },
  {
    id: 'dev', name: 'Dev', role: 'Engineer', color: '#90be6d', desk: 2,
    tools: ['read_file', 'write_file', 'edit_file', 'run_shell'],
    prompt: 'You are Dev, an engineering agent. Given a plan, produce the implementation as concise code or pseudocode plus a one-paragraph explanation of what you built.',
  },
  {
    id: 'tess', name: 'Tess', role: 'QA Tester', color: '#f8961e', desk: 3,
    tools: ['run_tests', 'lint', 'write_test'],
    prompt: 'You are Tess, a QA agent. Given an implementation and its plan, list the test cases you would run, which edge cases are likely to break, and a pass/fail verdict with reasons.',
  },
  {
    id: 'ava', name: 'Ava', role: 'Reviewer', color: '#f94144', desk: 4,
    tools: ['review_diff', 'scan_security', 'check_style'],
    prompt: 'You are Ava, a code review and security agent. Review the work and QA notes. Report blocking issues first, then nits. End with APPROVE or REQUEST_CHANGES.',
  },
  {
    id: 'penny', name: 'Penny', role: 'Writer', color: '#c77dff', desk: 5,
    tools: ['read_changes', 'write_doc', 'draft_changelog'],
    prompt: 'You are Penny, a documentation agent. Summarize what was done for a non-technical stakeholder: what changed, why it matters, and how to use it. Max 150 words.',
  },
];

// Order a task flows through the office.
export const PIPELINE = ['scout', 'archie', 'dev', 'tess', 'ava', 'penny'];

export const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
