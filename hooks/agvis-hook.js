#!/usr/bin/env node
// Claude Code hook -> AgVisualizer bridge. Reads the hook payload from stdin and forwards it to the
// local server. It never blocks or fails Claude Code: short timeout, all errors swallowed, no output.

const url = `http://127.0.0.1:${process.env.AGVIS_PORT || 3000}/api/hooks`;
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', async () => {
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input, signal: AbortSignal.timeout(800) });
  } catch { /* server not running — that's fine */ }
  process.exit(0);
});
