# Follow a hunter

A user sees each hunter on the map, beside the village it rides for, in the pose of what its session is doing: riding out, hunting, awaiting you, returned with a trophy or returned wounded.
The state comes from the session's own stream-json, and the return from the repo: a hunter comes back with a trophy once its contract's commit lands, and wounded when its turn ends without one.
A hunter that has come back no longer holds its village, so its contract can be taken again.

## Entry points

- A hunter on the map, looked at: its figure beside its village, and its name over its head.
- The list `Hunters` in the accessibility tree, which says each hunter's state and contract.
- The contract's card on its village's notice board, which says how its hunter came back.
- The world broadcast on `/ws` (and `/api/world`), which carries every hunter's `"state"`.

## Steps

Preconditions: lay down two villages with ready contracts, have every claude replay a recorded session, then load the map.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'` and `verify write repos/bogwater/.scratch/specs/ward-the-well.md '# Ward the well'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run `verify write repos/bogwater/.scratch/slices/ward-the-well.json '{"spec":".scratch/specs/ward-the-well.md","branch":"main","slices":[{"id":"S1","title":"Draw the water","autonomy":"afk","blocked_by":[]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify replay test/fixtures/transcripts/implement-slice.jsonl`. It prints `it waits at: gates/hunt, gates/permission, gates/allow, gates/question, gates/answer, gates/end`.
- Run `verify open`.

The steps, in this order:

- **Riding out.** Run `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Ask before every tool"` and `verify press Escape`, then `verify wait-for "Wojmir , riding out on S3 of Drain the bog"`. It prints `"Wojmir , riding out on S3 of Drain the bog" is visible after <n> ms`. `verify snapshot` shows a list `Hunters` after `Villages`, with that one item. `verify world` shows `Wojmir` with `"state": "riding-out"`.
- **The look of riding out.** Run `verify pause 2500`, then `verify screenshot riding` and `verify screenshot riding-close --clip 540,120,420,150 --zoom 3`, and open both. Just right of `Drain the bog`, clear of `Ward the well`, stands a hooded rider in a grey cloak on a horse, facing right, away from the village, with a small dark tag `Wojmir` over its head. It stands whole on the map, with no box, pale rim or black edge around it, and no fog over it.
- **Hunting.** Run `verify write gates/hunt open`, then `verify wait-for "Wojmir , hunting on S3"`. It prints `"Wojmir , hunting on S3" is visible after <n> ms`. `verify world` shows `Wojmir` with `"state": "hunting"`.
- **The look of hunting.** Run `verify pause 2500`, then `verify screenshot hunting-close --clip 540,120,420,150 --zoom 3`, and open it. In the rider's place the same hooded figure is on foot, crouched with a drawn sword, mist at its boots, and no pennant beside it.
- **Awaiting you on a permission.** Run `verify write gates/permission open`, then `verify wait-for "Wojmir , awaiting you on S3"`. It prints `"Wojmir , awaiting you on S3" is visible after <n> ms`. `verify world` shows `Wojmir` with `"state": "awaiting-you"`.
- **The look of awaiting you.** Run `verify screenshot awaiting` and `verify screenshot awaiting-close --clip 540,120,420,150 --zoom 3`, and open both. The crouched figure has a rust-red pennant planted just behind it, flying beside its head, the one strong red on the map, and its tag `Wojmir` has a rust frame.
- **Back to hunting.** Run `verify write gates/allow open`, then `verify wait-for "Wojmir , hunting on S3"`. `verify world` shows `"state": "hunting"`.
- **Awaiting you on a question.** Run `verify write gates/question open`, then `verify wait-for "Wojmir , awaiting you on S3"`. `verify world` shows `"state": "awaiting-you"`.
- **Hunting once answered.** Run `verify write gates/answer open`, then `verify wait-for "Wojmir , hunting on S3"`. `verify world` shows `"state": "hunting"`.
- **A trophy when the commit lands.** Run `verify git repos/bogwater commit --allow-empty -m "Lay the plank road" -m "Slice: S3"`, then `verify wait-for "Wojmir , returned with a trophy on S3"`. It prints `"Wojmir , returned with a trophy on S3" is visible after <n> ms`, with `<n>` under 3000. `verify world` shows `Wojmir` with `"state": "returned-trophy"` and `S3` of `drain-the-bog` with `"state": "done"`.
- **The trophy stays when the turn ends.** Run `verify write gates/end open`, then `verify pause 1500`. `verify world` still shows `Wojmir` with `"state": "returned-trophy"`.
- **The look of the trophy.** Run `verify screenshot trophy-close --clip 540,120,420,150 --zoom 3`, and open it. The figure is mounted again, a roped sack behind its saddle and one hand raised, standing at the right edge of `Drain the bog` and facing it, clear of the village's own name.
- **The trophy on the board.** Run `verify click "Drain the bog"`, then `verify snapshot`. The `Contracts` item for `S3` reads `S3 afk Lay the plank road Done Wojmir returned with a trophy`, with no `Take S3` button. Run `verify screenshot board-trophy` and open it: the line sits in rust italics on the `S3` card, above its `DONE`, inside the card. Run `verify press Escape`.
- **Wounded when the turn ends with no commit.** Every gate is open now, so the next claude replays its whole session. Run `verify click "Ward the well"`, `verify click "Take S1"`, `verify click "Never ask"` and `verify press Escape`, then `verify wait-for "Bogna , returned wounded on S1 of Ward the well"`. It prints `"Bogna , returned wounded on S1 of Ward the well" is visible after <n> ms`. `verify world` shows `Bogna` with `"state": "returned-wounded"` and `S1` of `ward-the-well` still `"state": "ready"`.
- **The look of the wound.** Run `verify pause 2500`, then `verify screenshot wounded-close --clip 540,120,420,150 --zoom 3` and open it. Right of `Ward the well` a hooded figure on foot leads its horse by the reins, a rust-red sling on one arm, facing the village. It stands clear of the fog to its right, not hazed by it.
- **A wounded hunter makes way.** Run `verify click "Ward the well"` and `verify snapshot`: the `S1` item reads `S1 afk Draw the water Ready Bogna returned wounded` and still has its `Take S1` button. Run `verify screenshot board-wounded` and open it: the line and the `Take` button sit on the card above its `READY`, not overlapping. Run `verify click "Take S1"`: a dialog `Send a hunter on S1` opens, and no refusal. Run `verify click "Edit files freely"`, then `verify world`: `"hunters"` has two, `Wojmir` and one `Bogna`, and that `Bogna`'s `"id"` is not the wounded one's.

## Behind it

- **What each claude was sent and sent back.** `verify read claude.log`. The first claude, `Wojmir`'s, has `waiting at gates/hunt` and `passed gates/hunt`, then `sent assistant`, `sent assistant Bash`, and later `sent control_request can_use_tool` before `waiting at gates/allow`, `sent assistant AskUserQuestion` before `waiting at gates/answer`, and last `sent result success` and `replay done`. The second claude, the wounded `Bogna`'s, has `replay done` and then `stdin ended, exiting`: taking its contract again let it go. The third, the new `Bogna`'s, was started with `--permission-mode acceptEdits` and `/implement-slice .scratch/slices/ward-the-well.json S1`.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and the same hunters, `Wojmir` at `"state": "returned-trophy"`.

## Gotchas

- `verify replay` makes every claude started afterwards replay the transcript after its first message, about one line every 150 ms; a line `{"replay":"wait","for":"<name>"}` holds it until the run has a file `gates/<name>`, which `verify write gates/<name> open` makes. A gate once open stays open for every later claude.
- A hunter rides between its village and its hunting ground for 2 s, and its tag follows it: pause before a screenshot of its look, or it is caught mid-ride.
- A returned hunter stays on the map while its claude runs, which a stream-json claude does after its turn, until its village's contract is taken again or Guslar stops.
- A contract pending sign-off (`Slice-Pending:`) is a trophy too: its commit has landed, and the user inspects it.
- A hunter whose claude exits leaves the map, as [Take a contract](./take-a-contract.md) says, whatever state it was in.
- The trophy is judged from the repo twice: by the map's regular read of the repos, and once more the moment the turn ends, so a commit made just before the end is never taken for a wound.
