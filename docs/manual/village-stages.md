# See each village's stage

A user sees at a glance how far each spec has come, without opening its board: a village whose spec has no slices file yet is a bounty drafted, one with a slices file has its contracts posted, and one whose every contract is done is cleared.
Each stage has its own painting of the same village, and the page says the stage in words beside the village's button.

## Entry points

- A village on the map, looked at.
- The `Villages` list in the accessibility tree, which says each village's stage.
- The world broadcast on `/ws` (and `/api/world`), which carries every village's `"stage"`.

## Steps

Preconditions: lay down one village at each stage, then load the map.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`, `verify write repos/bogwater/.scratch/specs/ward-the-well.md '# Ward the well'` and `verify write repos/kettle/.scratch/specs/mend-the-bridge.md '# Mend the bridge'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run `verify write repos/kettle/.scratch/slices/mend-the-bridge.json '{"spec":".scratch/specs/mend-the-bridge.md","branch":"main","slices":[{"id":"S1","title":"Sink the piles","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Lay the deck","autonomy":"hitl","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`, `verify git repos/bogwater commit --allow-empty -m "Raise the dyke" -m "Slice-Pending: S2"`. Each ends with `git exited: 0`.
- Run, in this order: `verify git repos/kettle init --initial-branch=main`, `verify git repos/kettle add .scratch/specs`, `verify git repos/kettle commit -m "Add the spec"`, `verify git repos/kettle switch --create slices/mend-the-bridge`, `verify git repos/kettle commit --allow-empty -m "Sink the piles" -m "Slice: S1"`, `verify git repos/kettle commit --allow-empty -m "Lay the deck" -m "Slice: S2"`. Each ends with `git exited: 0`.
- Run `verify open`.

The steps, in this order:

- **Each stage in the broadcast.** Run `verify world`. `drain-the-bog` has `"stage": "contracts-posted"`, its slices file and an undone contract. `ward-the-well` has `"stage": "bounty-drafted"`, no `slices` and `"contracts": []`. `mend-the-bridge` has `"stage": "cleared"`, and both its contracts have `"state": "done"`.
- **Each stage on the page.** Run `verify snapshot`. The list `Villages` has three items, in this order: the button `Drain the bog , village in Bogwater Reach` with the text `Contracts posted`, the button `Ward the well , village in Bogwater Reach` with the text `Bounty drafted`, and the button `Mend the bridge , village in kettle` with the text `Cleared`.
- **The look of the stages.** Run `verify screenshot stages` and open `stages.png`. The three villages are the same three thatched log huts inside a wattle fence on an earthen plate, the same size, each standing where its plaque names it, with no parchment square, box or pale rim around its plate. Take a close-up of each with `--clip` around the village and its plaque and `--zoom 4`. At this size the stages differ in a few marks: `Ward the well`, the bounty drafted, has one thin chimney smoke and a single pale parchment by the gate; `Drain the bog`, contracts posted, has two chimney smokes and several pale parchments on the post by the gate; `Mend the bridge`, cleared, has an orange fire glowing in the middle of its square with smoke rising from it. Then run `verify screenshot stages-large --size 2560x1440` and take the same close-ups with `--zoom 3`: there `Drain the bog` also shows its lanterns at the gate and a dark saddled horse by the fence at the front right, and `Mend the bridge` a pale beast skull on its gate and logs around the fire. Run `verify screenshot back --size 1440x900` to put back the default viewport.
- **A village clears.** Run `verify git repos/bogwater commit --allow-empty -m "Sign off S2: Raise the dyke" -m "Slice: S2"` and `verify git repos/bogwater commit --allow-empty -m "Lay the plank road" -m "Slice: S3"`, then `verify wait-for "Contracts posted" --gone`. It prints `"Contracts posted" is gone after <n> ms`, with `<n>` under 3000. `verify snapshot` shows `Drain the bog , village in Bogwater Reach` with the text `Cleared`, and `verify world` shows `drain-the-bog` with `"stage": "cleared"`. Run `verify screenshot cleared` and `verify screenshot cleared-drain --clip 545,160,135,105 --zoom 4`, and open both: `Drain the bog` is now painted as the cleared village, an orange fire glowing in its square, on the same plate in exactly the same place as before.
- **A bounty gets contracts posted.** Run `verify write repos/bogwater/.scratch/slices/ward-the-well.json '{"spec":".scratch/specs/ward-the-well.md","branch":"main","slices":[{"id":"S1","title":"Draw the water","autonomy":"afk","blocked_by":[]}]}'`, then `verify wait-for "Contracts posted"`. It prints `"Contracts posted" is visible after <n> ms`, with `<n>` under 3000. `verify snapshot` shows `Ward the well , village in Bogwater Reach` with the text `Contracts posted`, and `verify world` shows `ward-the-well` with `"stage": "contracts-posted"` and `S1` `"state": "ready"`.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and the same three villages, with `drain-the-bog` and `mend-the-bridge` at `"stage": "cleared"` and `ward-the-well` at `"stage": "contracts-posted"`.

## Gotchas

- A village is cleared only when its slices file lists at least one contract and every one of them carries a `Slice:` trailer on `slices/<slug>`; a pending contract (`Slice-Pending:`) keeps it at contracts posted.
- A slices file that is empty or cannot be read still counts as contracts posted: the file is there.
- The stage text sits beside the button, not in its name, so `verify click` names stay `<village title> , village in <region name>`.
- At 1440x900 a village is about a hundred pixels wide: its horse, lanterns and skull are too small to make out there, so judge those at 2560x1440, and always from a zoomed close-up, not the full screenshot.
