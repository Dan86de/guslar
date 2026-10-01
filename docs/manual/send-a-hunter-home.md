# Send a hunter home

A user finished with a hunter that has come back sends it home from its journal, and it leaves the map for good.
The journal closes, the hunter's figure and name go and the village it stood at is left with none, its name comes back into use, and its `claude` session is let go rather than left standing with its stdin open.
Only a hunter that has come back can be sent home: one still out is shown the offer refused, because letting go of a permission request it may be holding would allow the very call you were about to deny.

## Entry points

- The journal's button `Send home`, on a hunter that has returned with a trophy or returned wounded.
- The same button on a hunter still out, where it is there and disabled.
- The world broadcast on `/ws` (and `/api/world`), which no longer carries the hunter.
- `hunters.json`, beside the `world.json` Guslar reads, which no longer holds it, so a restart does not bring it back.

## Steps

Preconditions: lay down two villages with ready contracts, have every claude replay a recorded session, load the map, send a hunter, and let it come back with a trophy.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'` and `verify write repos/bogwater/.scratch/specs/ward-the-well.md '# Ward the well'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run `verify write repos/bogwater/.scratch/slices/ward-the-well.json '{"spec":".scratch/specs/ward-the-well.md","branch":"main","slices":[{"id":"S1","title":"Draw the water","autonomy":"afk","blocked_by":[]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify replay test/fixtures/transcripts/implement-slice.jsonl`. It prints `it waits at: gates/hunt, gates/permission, gates/allow, gates/question, gates/answer, gates/end`.
- Run `verify open`, then `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Ask before every tool"` and `verify press Escape`.
- Run `verify write gates/hunt open`, then `verify wait-for "Wojmir , hunting on S3"`.
- Run `verify git repos/bogwater commit --allow-empty -m "Lay the plank road" -m "Slice: S3"`, then `verify wait-for "Wojmir , returned with a trophy on S3"`.
- Run `verify pause 2500`, then `verify screenshot ground-before --clip 545,135,215,145 --zoom 4`. The pause lets the ride home finish, so the figure is where it settles. This is the ground a later step compares against: `Wojmir` stands on the woodland path to the right of `Drain the bog`, facing back at it, with its name on a tag over its head.

The steps, in this order:

- **The offer, in the journal of a hunter that has come back.** Run `verify world`: one hunter, `Wojmir`, with `"state": "returned-trophy"` and `"sessionId": "5e0920e1-2e63-4115-9bdd-15547dc23f10"`; keep its `"id"`, which no later hunter shares. Run `verify click "Wojmir"`, then `verify snapshot`. The dialog `Journal of Wojmir` has the state `returned with a trophy`, a button `Open in terminal`, not disabled, and a button `Send home`, not disabled.
- **The look of the offer.** Run `verify screenshot journal` and `verify screenshot journal-head --clip 545,10,880,145 --zoom 2`, and open both. In the journal's head, under the contract's line, the dark tag `returned with a trophy` sits at the left, and `Open in terminal` and `Send home` stand together at the right of the same line, each an outlined button in the journal's own ink and bone, of the same height and cut as the other. The two buttons sit closer to each other than either does to the tag, so they read as one pair rather than one bolted on; `Send home` ends at the head's right edge, under `Close` and in line with `Send` at the foot, and nothing overlaps, crowds the tag, or runs out of the journal.
- **Its terminal, open on the session that is about to be let go.** Run `verify click "Open in terminal"`, then `verify wait-for "Recorder claude resumed 5e0920e1-2e63-4115-9bdd-15547dc23f10"`. It prints that it is visible. `verify snapshot` shows a dialog `Terminal of Wojmir` with the text `running`, and the dialog `Journal of Wojmir` still open.
- **Send it home.** Run `verify click "Send home"`. It prints `clicked button "Send home"`. Run `verify wait-for "Wojmir" --gone`: it prints `"Wojmir" is gone after <n> ms`. `verify snapshot` shows no dialog `Journal of Wojmir`, no dialog `Terminal of Wojmir` and no list `Hunters`, with the same six `Regions` items as before: the journal closes, and the hunter and the terminal open on it go with it.
- **The ground it stood on is left clean.** Run `verify pause 500`, then `verify screenshot map` and `verify screenshot ground --clip 545,135,215,145 --zoom 4`, and open both against `ground-before`. Where `Wojmir` stood there is woodland floor and nothing else: no figure, no name tag over it, no flare, and no gap, hole or smear in the art it was painted on. `Drain the bog` and `Ward the well` are painted as they were, and the map still shows its two claimed regions and fog over the other four.
- **Its village is left with none.** Run `verify click "Drain the bog"`, then `verify snapshot`. The dialog `Notice board of Drain the bog` lists `S1 afk Dig the first ditch Done` and `S3 afk Lay the plank road Done`, neither line naming a hunter, where [Follow a hunter](./follow-a-hunter.md) has `S3` read `Done Wojmir returned with a trophy` while the hunter stands at the village. Run `verify press Escape`.
- **The world holds no hunters.** Run `verify world`. Its `"hunters"` is empty, and `Drain the bog` still reads `"stage": "cleared"` with both contracts `"done"`.
- **Its session is let go.** Run `verify read claude.log`. The hunter's claude has `stdin ended, exiting`, and the claude its terminal resumed has `the terminal hung up, exiting`.
- **A restart does not bring it back.** Run `verify server-stop`, then `verify wait-for "Reconnecting"`; then `verify server-start` and `verify wait-for "Reconnecting" --gone`. Run `verify snapshot`: still no list `Hunters`. `verify world` still has an empty `"hunters"`.
- **A hunter still out is offered nothing but the refusal.** Run `verify click "Ward the well"`, `verify click "Take S1"`, `verify click "Never ask"` and `verify press Escape`, then `verify wait-for "Wojmir , hunting on S1 of Ward the well"`: the name came back into use with the hunter that had it, so the new hunter is `Wojmir` too. Run `verify click "Wojmir"`, then `verify snapshot`. The dialog `Journal of Wojmir` has the state `hunting`, a button `Send home` `[disabled]`, and after it the paragraph `Wojmir is still out: it can only be sent home once it is back.`, which is the button's description.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and one hunter, the `Wojmir` still out, with `"state": "hunting"` and `"contract": "S1"`.
- **The roll no longer holds the hunter that went home.** Run `verify pause 500`, then `verify read hunters.json`. It holds one hunter, the `Wojmir` still out on `S1`, whose `"id"` is not the one the first `Wojmir` had.

## Gotchas

- Only a hunter that has come back can be sent home. A hunter still out may be holding a permission request, and letting go of an unanswered request is read by its hook as Guslar being unreachable, whose fallback is to allow: sending home a hunter awaiting you would grant the call you were about to deny.
- The reason a hunter still out cannot go is the button's `title` for a pointer, and the button's description in the page for everything else, so it is those words in the accessibility tree that a check reads. A screenshot shows neither.
- The journal closes first, and then the hunter goes, so focus returns to the name on the map that opened it.
- A village's button keeps the page's focus ring once the chooser over it is dismissed, so `Drain the bog` is outlined in `ground-before` and not in `ground`, whose click landed in the journal. That outline is focus, not anything the hunter left.
- A terminal open on the hunter is hung up with it, and says nothing of its own: it stands along the map's foot, away from the button in the journal.
- The name is free the moment the hunter goes, so the next hunter sent out takes it. Two hunters in one run can both be `Wojmir`; tell them apart by their `"id"`.
- Guslar cannot reopen that session afterwards: the session id went with the hunter. Claude Code still has the session, and `claude --resume <session id>` still reaches it.
- A session started outside Guslar goes home the same way, but one that is still running comes back at its next hook event, which can look as though the button did nothing.
- The roll is written a couple of hundred milliseconds after the map changes, so pause before reading `hunters.json`.
