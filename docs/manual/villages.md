# Read a village's notice board

A user sees every spec in a repo as a village of its region, and opening a village shows its notice board: every contract of the spec with its title, its autonomy and its true state, read from the trailers on `slices/<slug>`, so they never read git logs by hand to know what is done, pending, ready or sealed.

## Entry points

- A village on the map, clicked.
- A village reached with Tab and opened with Enter.
- The world broadcast on `/ws` (and `/api/world`), which carries every village and contract.

## Steps

Preconditions: lay down a region the way the skills leave one, then load the map.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`, `verify write repos/bogwater/.scratch/specs/ward-the-well.md '# Ward the well'` and `verify write repos/kettle/.scratch/specs/mend-the-bridge.md '# Mend the bridge'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]},{"id":"S4","title":"Drive out the utopiec","autonomy":"hitl","blocked_by":["S2","S3"]},{"id":"S5","title":"Build the sluice","autonomy":"afk","blocked_by":["S2"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`, `verify git repos/bogwater commit --allow-empty -m "Raise the dyke" -m "Slice-Pending: S2"`. Each ends with `git exited: 0`.
- Run `verify open`.

The steps, in this order:

- **Every spec is a village.** Run `verify world`. The `forest` region has `"villages"` with two, in this order: `"slug": "drain-the-bog"` with `"title": "Drain the bog"` and `"spec": ".scratch/specs/drain-the-bog.md"`, then `"slug": "ward-the-well"` with `"title": "Ward the well"`. `river-town` has one, `"slug": "mend-the-bridge"` with `"title": "Mend the bridge"`.
- **The villages on the map.** Run `verify snapshot`. After the six `Regions` items there is a list `Villages` with three items, each a button, in this order: `Drain the bog , village in Bogwater Reach`, `Ward the well , village in Bogwater Reach`, `Mend the bridge , village in kettle`.
- **The look of the villages.** Run `verify screenshot villages` and open `villages.png`. Below the `Bogwater Reach` plaque, in the dark forest, stand two painted villages side by side, each three thatched log huts inside a wattle fence on an earthen plate, with a small parchment plaque under it: `Drain the bog` on the left, `Ward the well` on the right. The walled river town has one, plaqued `Mend the bridge`. Each village sits straight on the map: no parchment square, box or pale rim around its plate, and its ink lines are not broken into pixels (take a close-up with `--clip` and `--zoom 3` to judge).
- **The contracts in the broadcast.** Run `verify world`. `drain-the-bog` has `"slices": ".scratch/slices/drain-the-bog.json"` and `"contracts"` in this order: `S1` `"Dig the first ditch"` `"afk"` `"state": "done"`; `S2` `"Raise the dyke"` `"hitl"` `"state": "pending"`; `S3` `"Lay the plank road"` `"afk"` `"state": "ready"`; `S4` `"Drive out the utopiec"` `"hitl"` `"state": "sealed"` with `"sealedBy": ["S2", "S3"]`; `S5` `"Build the sluice"` `"afk"` `"state": "sealed"` with `"sealedBy": ["S2"]`. Only sealed contracts have `sealedBy`. `ward-the-well` has `"contracts": []` and no `slices`.
- **Open the notice board.** Run `verify click "Drain the bog"`. It prints `clicked button "Drain the bog , village in Bogwater Reach"`. Run `verify snapshot`: a dialog `Notice board of Drain the bog`, with a heading `Notice board of Drain the bog`, a button `Close the notice board`, and a list `Contracts` with five items, in this order: `S1 afk Dig the first ditch Done`, `S2 hitl Raise the dyke Pending`, `S3 afk Lay the plank road Ready`, `S4 hitl Drive out the utopiec Sealed by S2, S3`, `S5 afk Build the sluice Sealed by S2`.
- **The look of the board.** Run `verify screenshot board` and open `board.png`. The map lies dimmed behind a weathered plank notice board under a thatched roof, with a parchment plaque `Drain the bog` on its top plank and a `Close` button off its top right. Five torn parchment cards hang between its side battens, three in the top row and two below, each with its id and `afk` or `hitl` at the top, its title under them, and its state at its foot, left of the printed wax seal. Each state reads at a glance: `S1` is greyed, with a rust `DONE` stamp; `S2` is bright, with `Pending` in rust and a small rust pennant at its top right; `S3` is bright, with an underlined `READY`; `S4` and `S5` sit in shadow, each with a second wax seal over its nail and `Sealed by …` in italics. No text runs off a card or over a seal, and no card overlaps another.
- **A new trailer lands.** Run `verify git repos/bogwater commit --allow-empty -m "Sign off S2: Raise the dyke" -m "Slice: S2"`, then `verify wait-for "Sealed by S3"`. It prints `"Sealed by S3" is visible after <n> ms`, with `<n>` under 3000. Run `verify snapshot`: the board is still open, and its items now read `S2 hitl Raise the dyke Done`, `S4 hitl Drive out the utopiec Sealed by S3` and `S5 afk Build the sluice Ready`.
- **Close it with Escape.** Run `verify press Escape`, then `verify snapshot`: no dialog, and the same three `Villages` buttons.
- **Close it with its button.** Run `verify click "Drain the bog"`, then `verify click "Close the notice board"`. It prints `clicked button "Close the notice board"`, and `verify snapshot` shows no dialog.
- **A village with no contracts yet.** Run `verify click "Ward the well"`, then `verify snapshot`: a dialog `Notice board of Ward the well` that says `No contracts are posted yet.` and has no `Contracts` list. Run `verify press Escape`.
- **A slices file that cannot be read.** Run `verify write repos/kettle/.scratch/slices/mend-the-bridge.json '{ not json'`, then `verify click "Mend the bridge"` and `verify wait-for "cannot be read"`. `verify snapshot` shows a dialog `Notice board of Mend the bridge` that says `The contracts cannot be read. .scratch/slices/mend-the-bridge.json:` followed by the JSON error. Run `verify press Escape`.
- **From the keyboard.** Run `verify open`, then `verify press Tab` and `verify press Enter`. `verify snapshot` shows the dialog `Notice board of Drain the bog`. Run `verify press Escape`.

## Behind it

- **The broadcast after the new trailer.** `verify world` shows `drain-the-bog` with `S2` `"state": "done"`, `S4` `"sealedBy": ["S3"]` and `S5` `"state": "ready"`, and `mend-the-bridge` with a `"problem"` starting `.scratch/slices/mend-the-bridge.json:` and `"contracts": []`.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and the same villages and contracts.
- **Guslar leaves the repo as it was.** `verify git repos/bogwater status --porcelain` prints only `?? .scratch/slices/`, the slices file the preconditions wrote and never committed, then `git exited: 0`.

## Gotchas

- Guslar reads the repos once a second, so a change on disk shows up within about a second: wait for it with `wait-for`, never a fixed sleep.
- A village's title is its spec's first `# ` heading; a spec with none is titled by its slug.
- A contract's state comes only from `slices/<slug>`: `Slice: <id>` is done, `Slice-Pending: <id>` is pending, and a pending contract seals what it blocks just as an undone one does.
- A slices file with a `commit` reads only the branch's commits after it; one without, like the fixture's, reads the whole branch.
- A trailer must be in the commit message's last paragraph, which is why the fixture passes it as its own `-m`.
- `verify click` matches a button whose name contains the text, and refuses when more than one does.
- A board with more contracts than fit between its battens scrolls inside the board.
