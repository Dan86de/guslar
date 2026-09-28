# See sessions started outside Guslar

A user who starts `claude` in a terminal, in a repo of their world, sees that session on the map as a hunter too, beside the hunters Guslar sent.
It stands by its region's plaque until its first reply names the contract `/implement-slice` took, then rides for that contract's village, and follows the same states as a hunter Guslar sent: riding out, hunting, awaiting you, returned with a trophy or returned wounded.
Its journal shows the session as it goes, but it has no line to type into: the session is written to in its own terminal.

## Entry points

- A `claude` session started in a registered repo, with Guslar's hooks installed there (`guslar hooks install`), while Guslar runs. Its hooks find Guslar through the file each running Guslar keeps in `~/.guslar/running/`.
- The session's hunter on the map, looked at, and the list `Hunters` in the accessibility tree.
- Its journal, opened from its figure.
- Its contract's card on the village's notice board.
- The world broadcast on `/ws` (and `/api/world`), where its hunter carries `"outside": true`.

## Steps

Preconditions: lay down a village with ready contracts, install Guslar's hooks, have every claude replay a recorded outside session, then load the map.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'` and `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch`, `verify git repos/bogwater commit -m "Add the spec"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`, `verify git repos/kettle init --initial-branch=main`. Each ends with `git exited: 0`.
- Run `verify guslar hooks install --world world.json`. It prints `guslar exited by itself: 0`.
- Run `verify replay test/fixtures/transcripts/outside.jsonl`. It prints `it waits at: gates/prompt, gates/permission, gates/allow, gates/stop, gates/end` and `it runs the repo's hooks for: SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, Stop, SessionEnd`.
- Run `verify open`.

The steps, in this order:

- **Guslar says where it listens.** Run `verify read home/.guslar/running`. It lists one file, `<pid>.json`, where `<pid>` is the pid `start` printed for Guslar. Run `verify read home/.guslar/running/<pid>.json`: it prints `{"url":"<url>"}`, with the URL `start` printed.
- **A session started outside Guslar rides out.** Run `verify claude repos/bogwater "/implement-slice .scratch/slices/drain-the-bog.json"`. It prints `outside claude pid <n> started in repos/bogwater, with no GUSLAR_URL or GUSLAR_HUNTER_ID`. Run `verify wait-for "Wojmir , riding out in Bogwater Reach, started outside Guslar"`: it prints `is visible after <n> ms`. `verify world` shows `Wojmir` with `"outside": true`, `"state": "riding-out"`, `"sessionId": "c3d9e0a4-7b2f-4e61-8d15-2a9f6b7c4e83"`, `"lastHook": {"event": "SessionStart"}` and `"journal": []`, and no `"rite"`, `"village"` or `"contract"`.
- **The look of an outside hunter.** Run `verify pause 2500`, then `verify screenshot outside-riding` and `verify screenshot outside-riding-close --clip 440,10,420,150 --zoom 3`, and open both. Left of the plaque `Bogwater Reach`, where a region's own hunter stands, a hooded rider on a horse faces left, away from the plaque, with a small dark tag `Wojmir` over its head and a clear gap between it and the plaque.
- **Its journal has no line to type into.** Run `verify click "Wojmir"`, then `verify snapshot`. A dialog `Journal of Wojmir` reads `A session started outside Guslar, Bogwater Reach` and `riding out`, has a list `Entries` with no items, and in place of the reply line the text `Started outside Guslar: write to Wojmir in its own terminal.` It has no text box `Reply to Wojmir`, no button `Send` and no button `Open in terminal`. Run `verify screenshot outside-journal` and open it: the note sits in italics at the journal's foot, where the reply line would be, inside the journal's frame.
- **Its first reply line binds it to its contract.** Run `verify write gates/prompt open`, then `verify wait-for "Wojmir , hunting on S3 of Drain the bog, started outside Guslar"`. `verify snapshot` shows the journal reading `S3 Lay the plank road, Drain the bog` and `hunting`, with the `Entries` `You: /implement-slice .scratch/slices/drain-the-bog.json`, `Wojmir: Slice S3: Lay the plank road (also ready: S2)` and `Bash:` over the code `git status --short`. `verify world` shows `Wojmir` with `"rite": "implement-slice"`, `"village": "drain-the-bog"`, `"contract": "S3"` and `"lastHook": {"event": "PreToolUse", "tool": "Bash"}`. Run `verify press Escape`.
- **It holds its village.** Run `verify click "Drain the bog"`, then `verify snapshot`. The `Contracts` item for `S3` reads `S3 afk Lay the plank road Ready Wojmir hunts it`, with no `Take S3` button, while `S2` keeps its `Take S2`. Run `verify press Escape`.
- **Awaiting you on a permission it asks in its terminal.** Run `verify write gates/permission open`, then `verify wait-for "Wojmir , awaiting you on S3"`. `verify world` shows `Wojmir` with `"state": "awaiting-you"`, `"lastHook": {"event": "PermissionRequest", "tool": "Bash"}` and no `"prompt"`. `verify snapshot` has no region `Requests`: the request is answered in the session's own terminal. Run `verify pause 2500` and `verify screenshot outside-awaiting-close --clip 540,120,420,150 --zoom 3`, and open it: right of `Drain the bog` the crouched figure has the rust-red pennant beside its head, and its tag `Wojmir` a rust frame.
- **Back to hunting once answered.** Run `verify write gates/allow open`, then `verify wait-for "Wojmir , hunting on S3"`. `verify world` shows `"state": "hunting"` and `"lastHook": {"event": "PostToolUse", "tool": "Bash"}`.
- **A trophy when the commit lands.** Run `verify git repos/bogwater commit --allow-empty -m "Lay the plank road" -m "Slice: S3"`, then `verify wait-for "Wojmir , returned with a trophy on S3 of Drain the bog, started outside Guslar"`. It prints `is visible after <n> ms`, with `<n>` under 3000.
- **The trophy stays when the turn ends.** Run `verify write gates/stop open`, then `verify pause 1500`. `verify world` still shows `Wojmir` with `"state": "returned-trophy"`, now with `"lastHook": {"event": "Stop"}` and a last journal entry `{"kind": "result", "text": "", "error": false}`.
- **It leaves when its session ends.** Run `verify write gates/end open`, then `verify wait-for "started outside Guslar" --gone`. `verify world` shows `"hunters": []`.
- **Wounded when its turn ends with no commit.** Run `verify replay test/fixtures/transcripts/outside-wounded.jsonl`: it prints `it waits at: gates/leave`. Run `verify claude repos/bogwater "/implement-slice"`, then `verify wait-for "Wojmir , returned wounded on S2 of Drain the bog, started outside Guslar"`: its first reply line, `Slice S2: Raise the dyke`, names the one `S2` in the region, though the prompt named no slices file. `verify world` shows `Wojmir` with `"state": "returned-wounded"` and `S2` of `drain-the-bog` still `"state": "ready"`.
- **A wounded outside hunter makes way.** Run `verify click "Drain the bog"` and `verify snapshot`: the `S2` item reads `S2 hitl Raise the dyke Ready Wojmir returned wounded` and still has its `Take S2` button. Run `verify click "Take S2"`, `verify click "Never ask"` and `verify press Escape`, then `verify world`: `"hunters"` has one, a `Wojmir` with no `"outside"`, Guslar's own.

## Behind it

- **What each outside claude ran.** `verify read claude.log`. Each claude started by `verify claude` logs `GUSLAR_HUNTER_ID=(not set)` and `GUSLAR_URL=(not set)`, then `outside Guslar, prompt: ` and its prompt. The first has `ran SessionStart hook: node '<checkout>/dist/server/guslar-hook.js': exit 0`, and the same for `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop` and `SessionEnd`, in that order, each with nothing after `exit 0`, then `session over, exiting`: the hook printed nothing into the session, not even a permission decision, so the session asked in its own terminal.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and the same one hunter.
- **Guslar takes its file away when it stops.** After `verify stop`, `verify read home` prints `(empty)`.

## Gotchas

- The hooks find a Guslar through `~/.guslar/running/<pid>.json`, which it keeps only while it runs. A session outside Guslar in a repo with Guslar's hooks goes on as if they were not there when no Guslar runs.
- A session is shown only from a repo of the world, or a folder inside one, and only once one of its hooks fires: one started before Guslar appears at its next prompt or tool call.
- The contract comes from the first line of the session's reply to a prompt, read from its transcript, as `/implement-slice` writes it: `Slice <id>: <title>`. When several villages have that id, the title and then the prompt's slices file pick one; when it is still unclear, the hunter stays by the plaque.
- A new prompt after the hunter has returned sends it out again from the plaque, bound to nothing until its reply names a contract.
- A returned outside hunter makes way for a hunter Guslar sends on its contract. If its session carries on, its next prompt brings it back to the map as a new hunter.
- A session Guslar sent and resumed in a terminal (`Open in terminal`) stays that hunter's, and is not shown twice.
- `verify claude` starts the recorder claude in a repo of the run with the run's `HOME` and nothing of Guslar's in its environment, as a user starting `claude` in a terminal does. It replays the run's `verify replay` transcript with nothing on stdout, writing each line to its session transcript under `sessions/`, and exits once the replay is done.
