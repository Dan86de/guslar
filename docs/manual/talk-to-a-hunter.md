# Talk to a hunter

A user opens a hunter's journal from its figure on the map and reads its session as it happens: what Guslar sent it, what it says, and each tool it calls.
The journal stands beside the map, so the hunter can still be watched, and takes a typed reply, which goes to the session as your next message.

## Entry points

- A hunter on the map: its name over its head, or its figure, which opens its journal.
- The journal's reply box, sent with `Send` or with Enter.
- The world broadcast on `/ws` (and `/api/world`), which carries every hunter's `"journal"`.

## Steps

Preconditions: lay down a village with a ready contract, have every claude replay a recorded session that asks you something, load the map, and send a hunter.

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'`.
- Run `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S2","title":"Raise the dyke","autonomy":"hitl","blocked_by":["S1"]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch/specs`, `verify git repos/bogwater commit -m "Add the specs"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`. Each ends with `git exited: 0`.
- Run `verify replay test/fixtures/transcripts/journal.jsonl`. It prints `it waits at: gates/read` and `it waits for its next message: once`.
- Run `verify open`, then `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Ask before every tool"` and `verify press Escape`, then `verify wait-for "Wojmir , hunting on S3"`.

The steps, in this order:

- **Open the journal from the map.** Run `verify click "Wojmir"`. It prints `clicked button "Wojmir"`. `verify snapshot` shows a dialog `Journal of Wojmir` with a heading `Journal of Wojmir`, the text `S3 Lay the plank road, Drain the bog` and `hunting`, a button `Close the journal`, a list `Entries`, a text box `Reply to Wojmir`, and a button `Send`, disabled while the box is empty.
- **The conversation so far.** Run `verify wait-for "git status --short"`, then `verify snapshot`. `Entries` has three items: `You: /implement-slice .scratch/slices/drain-the-bog.json S3`, then `Wojmir: Slice S3: Lay the plank road (also ready: S2)`, then `Bash:` with the code `git status --short`. There is nothing after them: the session is holding before its next step. `verify world` shows `Wojmir` with a `"journal"` of those three, `"kind": "you"`, `"said"` and `"tool"`.
- **Entries arrive as the session goes.** Run `verify write gates/read open`, then `verify wait-for "The turn ends."`. It prints `"The turn ends." is visible after <n> ms`. `verify snapshot` shows the same dialog, still open, with three more items in `Entries`: `Read:` with the code `/repo/.scratch/specs/drain-the-bog.md`, then `Wojmir: The spec does not say what the planks are made of. Oak or pine?`, then `The turn ends.`. The turn ended with no commit, so the journal's state now reads `returned wounded`. `verify world` shows six entries in `Wojmir`'s `"journal"`, the last with `"kind": "result"` and `"error": false`.
- **The look of the journal.** Run `verify screenshot journal` and `verify screenshot journal-close --clip 1000,0,440,520 --zoom 2`, and open both. A parchment leaf in the plaques' bone and ink stands along the right edge, over the map, with a thin inner rule: `JOURNAL OF` in small capitals over `Wojmir` large, the contract in italics under it, and `returned wounded` on a small dark tag. Your message sits on a darker band with a rust rule at its left and `YOU` in rust small capitals; the hunter's words are in ink under `WOJMIR` in small capitals; each tool call is an indented margin note with a thin rule, the tool's name in small capitals and its input in monospace; the turn's end is `The turn ends.` in italics between two rules. The reply box and `Send` sit at the foot. No text overlaps or runs out of the leaf, and no rule crosses the inner rule. The hunter's figure and name still show on the map left of the leaf.
- **Write back.** Run `verify fill "Reply to Wojmir" "Oak, from the old grove."`, which prints `filled text box "Reply to Wojmir" with: Oak, from the old grove.`, then `verify click "Send" --exact` and `verify wait-for "The plank road is laid in oak."`. `verify snapshot` shows five more items in `Entries`: `You: Oak, from the old grove.`, `Wojmir: Oak it is.`, `Edit:` with the code `/repo/src/road.ts`, `Wojmir: The plank road is laid in oak.` and `The turn ends.`, and the box `Reply to Wojmir` empty again.
- **The reply in the broadcast.** Run `verify world`. `Wojmir`'s `"journal"` has eleven entries; the seventh is `"kind": "you"` with `"text": "Oak, from the old grove."`, and the last is `"kind": "result"` with `"text": "The plank road is laid in oak."`.
- **Enter sends.** Run `verify fill "Reply to Wojmir" "Pine next time."`, then `verify press Enter`. `verify snapshot` shows a last item `You: Pine next time.` in `Entries`, and the box empty again.
- **Close the journal.** Run `verify click "Close the journal"`, then `verify snapshot`: no dialog `Journal of Wojmir`, and the list `Hunters` still has `Wojmir`. Run `verify click "Wojmir"` and `verify snapshot`: the dialog `Journal of Wojmir` is open again. Run `verify press Escape` and `verify snapshot`: it is gone.
- **It opens at its last entry.** Run `verify screenshot journal-short --size 1440x420`, which makes the window too short for the conversation, then `verify click "Wojmir"`, `verify pause 500` and `verify screenshot journal-end`, and open it. The journal opens scrolled to the foot, not the head: the last of the twelve items in `Entries`, `You: Pine next time.`, stands just above the reply box, the first one is out of sight above, and the scrollbar's thumb sits at the bottom of its track. Run `verify press Escape`, then `verify screenshot journal-tall --size 1440x900` to put the window back.

## Behind it

- **What the claude was sent.** `verify read claude.log`. After its start lines, the claude has `stdin: {"type":"user","message":{"role":"user","content":[{"type":"text","text":"/implement-slice .scratch/slices/drain-the-bog.json S3"}]}}`, then `sent result success` and `waiting for the next message`, then `stdin: {"type":"user","message":{"role":"user","content":[{"type":"text","text":"Oak, from the old grove."}]}}` and `replaying on`, then `sent assistant Edit`, `sent result success` and `replay done`, and last `stdin: {"type":"user","message":{"role":"user","content":[{"type":"text","text":"Pine next time."}]}}`.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and `Wojmir`'s same `"journal"`, now ending with `"text": "Pine next time."`.

## Gotchas

- The journal starts with the command Guslar sent the hunter when it rode out.
- A tool call shows the gist of its input: the command, path, pattern or question it names. Tool results and the session's thinking are not written.
- A reply goes to the session at once, whatever the hunter is doing. Its answer moves the hunter as [Follow a hunter](./follow-a-hunter.md) says, so a returned-wounded hunter written to hunts again until that turn ends.
- The journal lives as long as the hunter's claude does, and closes when the hunter leaves the map.
- `Send` is disabled while the reply box holds no words, and a reply of only spaces is refused.
- The journal opens at its last entry, however far the conversation has got. Scrolling back to read holds your place: entries arriving while you are turned back do not pull you down to the foot again, and reaching the foot yourself starts it following along once more.
