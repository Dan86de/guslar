# Keep hunters across a restart

A user whose Guslar stops, crashes or has its terminal closed while hunters are out finds them on the map again when it starts, each with its journal and session, and picks up where it left off by writing to it.
Guslar keeps its own hunters in `hunters.json`, beside the `world.json` it reads.
A hunter that was out when Guslar stopped comes back wounded, its turn cut short, and writing to it resumes its session with `claude --resume`.

## Entry points

- Guslar is stopped with Ctrl-C, its terminal is closed, or it crashes, while a hunter is out.
- It starts again with the same `world.json`.
- The journal of a hunter brought back: its reply line, and `Open in terminal`.

## Steps

Preconditions: lay down a village with a ready contract, have every claude replay a recorded session, load the map, and send a hunter that is held mid-turn.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch`, `verify git repos/bogwater commit -m "Add the spec"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify replay test/fixtures/transcripts/journal.jsonl`. It prints `it waits at: gates/read`.
- Run `verify open`, then `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Edit files freely"` and `verify press Escape`, then `verify wait-for "Wojmir , hunting on S3"`.

The steps, in this order:

- **The hunter is kept.** Run `verify pause 500`, then `verify read hunters.json`. It holds one hunter, `"name":"Wojmir"`, with `"contract":"S3"`, `"permissionMode":"acceptEdits"`, `"state":"hunting"`, `"sessionId":"8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"` and `"repo":"<run folder>/repos/bogwater"`.
- **Guslar's terminal is closed.** Run `verify server-stop --signal HUP`, then `verify wait-for "Reconnecting"`. It prints `with SIGHUP`, then `"Reconnecting" is visible after <n> ms`. `verify read claude.log` has `stdin ended, exiting` from the hunter's claude: Guslar let it go rather than kill it.
- **It comes back wounded.** Run `verify server-start`, then `verify wait-for "Wojmir , returned wounded on S3"`. It prints that it is visible. `verify snapshot` shows the list `Hunters` with one item, `Wojmir , returned wounded on S3 of Drain the bog`. `verify world` shows `Wojmir` with the same `"id"` as in `hunters.json`, `"state": "returned-wounded"` and `"sessionId": "8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"`. `verify read claude.log` has no second claude started: nothing runs for Wojmir until you write to him.
- **Its journal.** Run `verify click "Wojmir"`, then `verify snapshot`: the dialog `Journal of Wojmir` has the state `returned wounded`, a button `Open in terminal`, not disabled, and its `Entries` are `You: /implement-slice .scratch/slices/drain-the-bog.json S3`, `Wojmir: Slice S3: Lay the plank road (also ready: S2)`, `Bash:` with `git status --short`, and `The turn ends in failure: Guslar stopped during this turn. Write to resume the session.`
- **The look of the journal.** Run `verify screenshot journal` and open it. The journal's leaf shows the entries as any journal does, the last one the failed turn's line, and the reply line and `Send` under them. No text overlaps or runs out of the leaf.
- **Write to resume it.** Run `verify fill "Reply to Wojmir" "Carry on."`, then `verify press Enter` and `verify wait-for "Wojmir , hunting on S3"`. It prints that it is visible. `verify read claude.log` has a second claude `started in <run folder>/repos/bogwater`, with `args: -p --input-format stream-json --output-format stream-json --verbose --permission-mode acceptEdits --resume 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33`, `GUSLAR_HUNTER_ID=` the id Wojmir had before the restart, and a first `stdin:` whose text is `Carry on.`. `verify snapshot` shows the journal's `Entries` going on with `You: Carry on.` after the failed turn.
- **Ctrl-C, and its terminal.** Run `verify pause 500`, `verify server-stop --signal INT` and `verify server-start`, then `verify wait-for "Wojmir , returned wounded on S3"`. It prints that it is visible. Run `verify click "Wojmir"`, `verify click "Open in terminal"` and `verify wait-for "Recorder claude resumed 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"`. It prints that it is visible, and `verify read claude.log` has a claude with `stdin is a terminal` and `args: --resume 8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33 --permission-mode acceptEdits`. Run `verify click "Close the terminal"` and `verify press Escape`.
- **It crashes.** Run `verify pause 500`, `verify server-stop --signal KILL` and `verify server-start`, then `verify wait-for "Wojmir , returned wounded on S3"`. It prints that it is visible, and `verify world` shows `Wojmir` with the same `"id"` and `"sessionId"` as before.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and one hunter, `Wojmir`, with `"sessionId":"8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"`.
- **The roll follows the map.** `verify read hunters.json` holds Wojmir with `"state":"hunting"` and the journal the map shows.

## Gotchas

- `hunters.json` is written a moment after each change, so read it after a short `pause`, not straight after an action.
- Only Guslar's own hunters are kept. A session started outside Guslar is seen again at its next hook event, as in [See sessions started outside Guslar](./outside-sessions.md).
- A hunter comes back only while its region stands in the same slot on the same repo, and only once its session has begun; one whose region moved or went is forgotten.
- A hunter that had returned comes back as it returned, with a trophy or wounded, and no line is added to its journal.
- The hunter's claude finishes the turn it was on after Guslar lets it go. What it did after Guslar stopped is in its session, not in the journal: `Open in terminal` shows it.
- A crash (`--signal KILL`) keeps the hunters as the roll had them a moment before; nothing is written as it dies.
- The recorder claude replays the whole recorded session on its first message, a resumed one too, so the journal repeats the first turn's lines after `You: Carry on.`; a real resumed session goes on from where it was.
