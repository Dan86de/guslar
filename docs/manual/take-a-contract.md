# Take a contract

A user takes a ready contract from a village's notice board, chooses how far the hunter may go without asking, and Guslar sends a hunter: a headless `claude` running `/implement-slice` on that contract in the region's repo.
A village takes one hunter at a time, and says which hunter holds it when asked for a second; other villages take their own hunters meanwhile.

## Entry points

- The `Take` button on a ready contract of an opened notice board, then a permission mode in the chooser.
- The world broadcast on `/ws` (and `/api/world`), which carries every hunter out and the contract it is bound to.

## Steps

Preconditions: lay down two villages with ready contracts, then open the first board.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'` and `verify write repos/kettle/.scratch/specs/mend-the-bridge.md '# Mend the bridge'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]},{"id":"S4","title":"Drive out the utopiec","autonomy":"hitl","blocked_by":["S2","S3"]}]}'`.
- Run `verify write repos/kettle/.scratch/slices/mend-the-bridge.json '{"spec":".scratch/specs/mend-the-bridge.md","branch":"main","slices":[{"id":"S1","title":"Sink the piles","autonomy":"afk","blocked_by":[]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify open`, then `verify click "Drain the bog"`.

The steps, in this order:

- **Only ready contracts can be taken.** Run `verify snapshot`. The dialog `Notice board of Drain the bog` has the list `Contracts` with four items: `S1 afk Dig the first ditch Done`, then `S2 hitl Raise the dyke Ready` with a button `Take S2`, then `S3 afk Lay the plank road Ready` with a button `Take S3`, then `S4 hitl Drive out the utopiec Sealed by S2, S3`. Only `S2` and `S3` have a `Take` button.
- **Change your mind.** Run `verify click "Take S3"`, then `verify click "Cancel"`. `verify snapshot` shows the board still open and no dialog `Send a hunter on S3`, and `verify world` shows `"hunters": []`.
- **Choose how far the hunter may go.** Run `verify click "Take S3"`, then `verify snapshot`: inside the board, a dialog `Send a hunter on S3` with a heading `Send a hunter on S3`, the text `Lay the plank road` and `How far may the hunter go without asking you?`, a list `Permission modes` with four buttons in this order, `Ask before every tool It stops for you at each step. default`, `Edit files freely It asks before anything else. acceptEdits`, `Let Claude judge It asks only when a step looks risky. auto` and `Never ask It rides alone and asks nothing. bypassPermissions`, and a button `Cancel`.
- **The look of the choice.** Run `verify screenshot chooser` and open it. Over the dimmed board stands a parchment panel in the plaques' bone and ink, with a thin inner rule: `Send a hunter on S3` large, `Lay the plank road` in italics under it, the question, four framed rows each with its name, an italic line under the name and the mode's flag in small monospace at its right, and a dark `Cancel` button at its bottom right. No text overlaps or runs out of its row.
- **Send the hunter.** Run `verify click "Edit files freely"`, then `verify wait-for "Wojmir hunts it"`. It prints `"Wojmir hunts it" is visible after <n> ms`, with `<n>` under 3000. `verify snapshot` shows no dialog `Send a hunter on S3`, and the board's `S3` item reads `S3 afk Lay the plank road Ready Wojmir hunts it`, with no `Take S3` button. `S2` still has its `Take S2` button.
- **The hunter in the broadcast.** Run `verify world`. `"hunters"` has one: `"name": "Wojmir"`, `"slot": "forest"`, `"village": "drain-the-bog"`, `"contract": "S3"`, `"permissionMode": "acceptEdits"`, and an `"id"` of 36 characters.
- **A second hunter is refused.** Run `verify click "Take S2"`. `verify snapshot` shows no dialog `Send a hunter on S2`, and the board has an alert `Drain the bog refuses a second hunter: Wojmir is out on S3.` Run `verify world`: `"hunters"` still has only `Wojmir`.
- **The look of a held board.** Run `verify screenshot held` and `verify screenshot held-cards --clip 640,280,300,190 --zoom 3`, and open both. On `S2` a small dark `Take` button sits just above its underlined `READY`; on `S3` the same place reads `Wojmir hunts it` in rust italics, clear of the card's torn right edge and of its seal. The refusal hangs on a bone plaque with a rust frame across the board's bottom plank, inside the board's frame, its text centred and not cut.
- **Another village takes its own hunter.** Run `verify press Escape`, `verify click "Mend the bridge"`, `verify click "Take S1"` and `verify click "Ask before every tool"`, then `verify wait-for "Bogna hunts it"`. It prints `"Bogna hunts it" is visible after <n> ms`. `verify world` shows two `"hunters"`: `Wojmir` on `drain-the-bog` `S3` with `"permissionMode": "acceptEdits"`, then `Bogna` with `"slot": "river-town"`, `"village": "mend-the-bridge"`, `"contract": "S1"` and `"permissionMode": "default"`.

## Behind it

- **The claude Guslar started for each hunter.** `verify read claude.log` shows two claudes, each as lines `[pid <n>] …`. The first: `started in <run folder>/repos/bogwater`, `args: -p --input-format stream-json --output-format stream-json --verbose --permission-mode acceptEdits`, `GUSLAR_HUNTER_ID=` followed by `Wojmir`'s id from the broadcast, and `stdin: {"type":"user","message":{"role":"user","content":[{"type":"text","text":"/implement-slice .scratch/slices/drain-the-bog.json S3"}]}}`. The second: `started in <run folder>/repos/kettle`, `--permission-mode default`, `Bogna`'s id, and `/implement-slice .scratch/slices/mend-the-bridge.json S1`. There is no third: the cancelled and the refused takes started nothing.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and the same two hunters.

## Gotchas

- The run's Guslar starts `claude` as the verify skill's recorder, which writes `claude.log` and runs until Guslar ends its stdin; no real Claude Code session is started.
- Hunters are named in a fixed order, the first name no hunter out is using: `Wojmir`, then `Bogna`, then `Dobromir`.
- A hunter stays in the broadcast while its `claude` runs, and leaves it when that process exits.
- Only a `ready` contract can be taken; a done, pending or sealed one has no `Take` button, and the server refuses it.
- The refusal is per village: `Take` stays on every ready contract of a village with a hunter out, and pressing it says who holds the village.
