# Open a hunter in a terminal

A user resumes a hunter's session in a real terminal, from its journal, when the journal is not enough.
The terminal runs `claude --resume` on the hunter's own session, in the hunter's repo, and stands along the map's foot, where it is read and typed into like any terminal.
Closing it only hides it: the session in it runs on until it exits, the hunter leaves the map, or Guslar stops.

## Entry points

- The journal's button `Open in terminal`.
- The terminal itself: typing into it, its `Close the terminal` button, and `Resume again` once its session has ended.
- The world broadcast on `/ws` (and `/api/world`), which carries each hunter's `"sessionId"` and `"terminal"`.

## Steps

Preconditions: lay down a village with a ready contract, have every claude replay a recorded session, load the map, send a hunter, and open its journal.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch`, `verify git repos/bogwater commit -m "Add the spec"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify replay test/fixtures/transcripts/journal.jsonl`. It prints `it waits at: gates/read`.
- Run `verify open`, then `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Ask before every tool"` and `verify press Escape`, then `verify wait-for "Wojmir , hunting on S3"` and `verify click "Wojmir"`.

The steps, in this order:

- **The session to resume.** Run `verify world`. `Wojmir` has `"sessionId": "8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"` and no `"terminal"`. `verify snapshot` shows the dialog `Journal of Wojmir` with a button `Open in terminal`, not disabled.
- **Open in terminal.** Run `verify click "Open in terminal"`, then `verify wait-for "Recorder claude resumed 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"`. It prints that it is visible. Run `verify pause 1500`, then `verify snapshot`: it shows a dialog `Terminal of Wojmir` with a heading `Terminal of Wojmir`, the code `claude --resume 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33`, the text `running`, a button `Close the terminal`, a text box `Terminal input`, and the line `Recorder claude resumed 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33. Type a line and it answers.`. The dialog `Journal of Wojmir` is still open.
- **The terminal in the broadcast.** Run `verify world`. There is still one hunter, `Wojmir`, with `"state": "hunting"`, the same `"sessionId"`, and `"terminal": {"state": "open"}`.
- **What the terminal runs.** Run `verify read claude.log`. A second claude, with a pid of its own, has `started in <run folder>/repos/bogwater`, `args: --resume 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33 --permission-mode default`, `GUSLAR_HUNTER_ID=(not set)`, `GUSLAR_URL=http://127.0.0.1:<port>/` and `stdin is a terminal (TERM=xterm-256color)`.
- **Type into it.** Run `verify fill "Terminal input" "Oak, from the old grove."`, then `verify press Enter` and `verify wait-for "Recorder claude heard: Oak, from the old grove."`. It prints that it is visible. `verify read claude.log` has `typed: Oak, from the old grove.` from the second claude's pid. `verify snapshot` shows the journal's `Entries` unchanged, with three items: what the terminal is sent is not the journal's.
- **The look of the terminal.** Run `verify screenshot terminal` and `verify screenshot terminal-close --clip 0,440,1000,460 --zoom 2`, and open both. Along the map's foot, from the left edge to just short of the journal's leaf, stands a frame in the journal's bone with a thin inner rule: `TERMINAL OF` in small capitals beside `Wojmir`, the `claude --resume` command in small monospace, `running` on a small dark tag, and `Close` at the right. Under it, a night-dark screen fills the frame, with the recorder's lines in bone monospace and a cursor after them. No text overlaps or runs out of the frame, the terminal does not run under the journal, and the map shows above it.
- **Close and show it again.** Run `verify click "Close the terminal"`, then `verify snapshot`: no dialog `Terminal of Wojmir`, and the journal still open. `verify world` still shows `"terminal": {"state": "open"}`. Run `verify click "Open in terminal"`, then `verify wait-for "Recorder claude heard: Oak, from the old grove."`, `verify pause 1500` and `verify snapshot`: the dialog `Terminal of Wojmir` is back with every line it showed before. `verify read claude.log` has no third claude started.
- **The session ends.** Run `verify press Control+D`, then `verify wait-for "ended, exit 0"`. It prints that it is visible, and `verify snapshot` shows a button `Resume again` in the dialog `Terminal of Wojmir`. `verify read claude.log` has `stdin ended, exiting` from the second claude. `verify world` shows `Wojmir` with `"terminal": {"state": "ended", "exitCode": 0}`, still `"hunting"`.
- **Resume again.** Run `verify click "Resume again"`, then `verify wait-for "running"`. `verify read claude.log` has a third claude started in `<run folder>/repos/bogwater` with `args: --resume 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33 --permission-mode default`. `verify world` shows `"terminal": {"state": "open"}` again.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and `Wojmir` with `"sessionId":"8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"` and `"terminal":{"state":"open"}`.
- **Guslar hangs up its terminals.** Run `verify server-stop`, then `verify read claude.log`: the third claude has `the terminal hung up, exiting`.

## Gotchas

- `Open in terminal` is disabled until the session has said which session it is, in the first line it streams.
- The terminal's session is yours, not the hunter's: it runs without `GUSLAR_HUNTER_ID`, so its permission requests are asked in the terminal rather than pinned to the map, and nothing typed there reaches the journal.
- The journal and the terminal speak to the same conversation from two processes; neither hears what was said in the other until it resumes again. Write in one at a time.
- Escape goes to the terminal, as Claude Code uses it to interrupt; close the terminal with its button.
- The terminal is hung up when its hunter leaves the map or Guslar stops.
- The terminal's lines are in the accessibility tree, so `wait-for` finds them. Its rows there trail what it shows by up to a second, so pause before a snapshot reads them. The recorder claude stands in for Claude Code there too: it says `Recorder claude resumed <session id>. Type a line and it answers.`, answers each line typed with `Recorder claude heard: <line>`, and exits on Control+D.
