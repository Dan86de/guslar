# Answer a hunter's request

A user sees a hunter's permission request as a petition pinned to the map: which tool it wants and what it would run.
Allowing or denying it answers the hunter's session at once, and a denial can carry a reason the session reads.
While the petition is up, the hunter awaits you; once it is answered, the hunter goes back to its hunt.

## Entry points

- A hunter's session asking for a tool, through Guslar's `PermissionRequest` hook, which [Install the hooks](./install-hooks.md) puts in the repo.
- The petition on the map: its `Allow` and `Deny` buttons, and its reason box.
- The world broadcast on `/ws` (and `/api/world`), which carries the request as the hunter's `"prompt"`.

## Steps

Preconditions: lay down a village with a ready contract, install Guslar's hooks in its repo, have every claude replay a recorded session that asks twice, load the map, and send a hunter.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch`, `verify git repos/bogwater commit -m "Add the spec"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`, `verify git repos/kettle init --initial-branch=main`. Each ends with `git exited: 0`.
- Run `verify guslar hooks install --world world.json`. It ends with `guslar exited by itself: 0`.
- Run `verify replay test/fixtures/transcripts/permission.jsonl`. It prints `it waits at: gates/push` and `it runs the repo's hooks for: SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, Stop`.
- Run `verify open`, then `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Ask before every tool"` and `verify press Escape`.

The steps, in this order:

- **A request awaits you.** Run `verify wait-for "Wojmir asks to use Bash"`. It prints `"Wojmir asks to use Bash" is visible after <n> ms`. `verify snapshot` shows a region `Requests` holding a dialog `Wojmir asks to use Bash`, with a heading `Wojmir asks to use Bash`, the text `S3 Lay the plank road, Drain the bog`, the text `Run the project checks`, a term `command` with the code `npm run check`, a text box `Reason to give Wojmir`, and buttons `Allow Wojmir` and `Deny Wojmir`. The list `Hunters` reads `Wojmir , awaiting you on S3 of Drain the bog`.
- **The request in the broadcast.** Run `verify world`. `Wojmir` has `"state": "awaiting-you"`, `"lastHook": {"event": "PermissionRequest", "tool": "Bash"}`, and a `"prompt"` with an `"id"`, `"tool": "Bash"` and `"input"` of `"command": "npm run check"` and `"description": "Run the project checks"`.
- **The look of a request.** Run `verify screenshot request` and `verify screenshot request-close --clip 0,0,440,380 --zoom 2`, and open both. A parchment petition in the plaques' bone stands at the map's top left, framed in rust with a thin inner rule, and the hunter's rust-red pennant planted at its top right corner. `Wojmir` is large, `asks to use` in italics, `Bash` in rust; the contract is in italics under it, then `Run the project checks`, then a darker band with a rust rule at its left holding `COMMAND` in small capitals over `npm run check` in monospace. At its foot, the reason box, `Allow` in ink and `Deny` outlined in rust, in one row. No text overlaps or runs out of the petition, and the hunter's figure on the map flies its red pennant.
- **Allow.** Run `verify click "Allow Wojmir"`, then `verify wait-for "Wojmir asks to use Bash" --gone` and `verify wait-for "Wojmir , hunting on S3"`. Each prints that it happened. `verify snapshot` shows no region `Requests`. `verify world` shows `Wojmir` with `"state": "hunting"` and no `"prompt"`.
- **A second request.** Run `verify write gates/push open`, then `verify wait-for "git push --force origin main"`. `verify snapshot` shows the dialog `Wojmir asks to use Bash` again, with the text `Push the plank road` and the code `git push --force origin main`, and `Wojmir , awaiting you on S3 of Drain the bog` in `Hunters`.
- **Deny with a reason.** Run `verify fill "Reason to give Wojmir" "Push to the slices branch, never to main."`, which prints `filled text box "Reason to give Wojmir" with: Push to the slices branch, never to main.`, then `verify click "Deny Wojmir"` and `verify wait-for "Wojmir asks to use Bash" --gone`. The session reads the denial and ends its turn with no commit: `verify wait-for "Wojmir , returned wounded on S3"` prints that it is visible. `verify world` shows `Wojmir` with `"state": "returned-wounded"` and no `"prompt"`.

## Behind it

- **What the hook answered.** `verify read claude.log`. After `ran PreToolUse hook: node '<checkout>/dist/server/guslar-hook.js': exit 0` for `npm run check`, it has `ran PermissionRequest hook: node '<checkout>/dist/server/guslar-hook.js': exit 0: {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`, then `waiting at gates/push` and `passed gates/push`, and later `ran PermissionRequest hook: node '<checkout>/dist/server/guslar-hook.js': exit 0: {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Push to the slices branch, never to main."}}}`, then `ran Stop hook`, `sent result success` and `replay done`. Every other Guslar hook ran with nothing after `exit 0`.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and `Wojmir` with `"state":"returned-wounded"` and no `"prompt"`.

## Gotchas

- A request reaches the map only through Guslar's hooks: install them first, or the session answers its own requests as its permission mode says.
- The hook waits up to 300 s for your answer. Past that, Claude Code gives up on it and the hunter has to ask again; the petition goes with it.
- The map answers each hunter's oldest request first; the next one shows when that one is answered.
- `Deny` with an empty reason box denies with no reason. Enter in the reason box denies too.
- When a hunter's Guslar cannot be reached, its hook allows the request unasked, so no hunter is stranded by a Guslar that is gone. A session Guslar did not start gets no answer from Guslar, and asks as it would without it.
- `verify replay` runs a `PermissionRequest` hook as Claude Code does and waits on it, so the recorder claude holds until you answer, and logs what the hook printed.
