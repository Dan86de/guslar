# Talk to a hunter

Every hunter on the map stands a leaf in a margin down the map's right edge, saying who it is, how long ago it spoke, and its latest words in two lines, so what everyone is up to is read at a glance with nothing opened.
A leaf opens under the pointer, and from the keyboard, to the whole of those words and an offer to read that hunter's journal, with the hunter itself marked on the map for as long as it stands open.
Choosing that offer opens the journal: one surface for reading the hunter's whole session, a reading page wide enough for a table, a diff and a fenced block, with the tool calls of each turn standing on a rail beside the words that called them.
An index of every hunter on the map stands at its head, and turns it from one to another without closing it, holding on to what you had begun writing to each and the place you had turned back to in its session.
At the head of that index stands everyone: every hunter's turns in one stream, in the order this map heard them, read and not written to, since there is nobody in particular in it to write to.
What the hunter says is set as type in the journal's own hand - headings, lists, tables and code take their shape - so the longer and more structured an answer is, the more readable it gets.
A line at the journal's foot writes back to that hunter by name, and what you type goes to the session as its next message.

## Entry points

- The margin down the map's right edge: one leaf per hunter on the map, saying its latest words.
- An open leaf's `Read the journal of <hunter name>`, which opens that hunter's journal.
- The index at the journal's head: `Everyone`, then one name per hunter on the map, which turns the journal to that hunter.
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
- **The look of the journal.** Run `verify screenshot journal`, `verify screenshot journal-head --clip 545,10,880,145 --zoom 2` and `verify screenshot journal-rail --clip 560,160,860,220 --zoom 2`, and open all three.
A broad parchment surface in the plaques' bone and ink stands over the map's right, from the top of the window to its foot, with a thin inner rule.
In its head, `JOURNAL OF` in small capitals over `Wojmir` large, the contract in italics under it, `returned wounded` on a small dark tag at the left, and `Open in terminal`, `Send home` and `Close` at the right.
Under the head the session runs down a reading page with a rail at its right: your message sits on a darker band with a rust rule at its left and `YOU` in rust small capitals; the hunter's words are in ink under `WOJMIR` in small capitals; the turn's end is `The turn ends.` in italics between two rules that cross the page and stop short of the rail.
On the rail, `BASH` stands beside the words it followed and `READ` beside the next, each the tool's name in small capitals over its input in monospace, behind a hairline that runs the height of the words it belongs to.
The reply box and `Send` sit at the foot, across the page and the rail together.
No text overlaps, runs out of the surface or crosses the inner rule, nothing of the page strays onto the rail, and the painted world shows uncropped left of the journal, with the margin of leaves covered behind it.
- **Write back.** Run `verify fill "Reply to Wojmir" "Oak, from the old grove."`, which prints `filled text box "Reply to Wojmir" with: Oak, from the old grove.`, then `verify click "Send" --exact` and `verify wait-for "The plank road is laid in oak."`. `verify snapshot` shows five more items in `Entries`: `You: Oak, from the old grove.`, `Wojmir: Oak it is.`, `Edit:` with the code `/repo/src/road.ts`, `Wojmir: The plank road is laid in oak.` and `The turn ends.`, and the box `Reply to Wojmir` empty again.
- **The reply in the broadcast.** Run `verify world`. `Wojmir`'s `"journal"` has eleven entries; the seventh is `"kind": "you"` with `"text": "Oak, from the old grove."`, and the last is `"kind": "result"` with `"text": "The plank road is laid in oak."`.
- **Enter sends.** Run `verify fill "Reply to Wojmir" "Pine next time."`, then `verify press Enter`. `verify snapshot` shows a last item `You: Pine next time.` in `Entries`, and the box empty again.
- **Close the journal.** Run `verify click "Close the journal"`, then `verify snapshot`: no dialog `Journal of Wojmir`, and the list `Hunters` still has `Wojmir`. Run `verify click "Wojmir"` and `verify snapshot`: the dialog `Journal of Wojmir` is open again. Run `verify press Escape` and `verify snapshot`: it is gone.
- **It opens at its last entry.** Run `verify screenshot journal-short --size 1440x420`, which makes the window too short for the conversation, then `verify click "Wojmir"`, `verify pause 500` and `verify screenshot journal-end`, and open it. The journal opens scrolled to the foot, not the head: the last of the twelve items in `Entries`, `You: Pine next time.`, stands just above the reply box, and the first one is out of sight above. Run `verify press Escape`, then `verify screenshot journal-tall --size 1440x900` to put the window back.
- **A hunter's words are set as type.** Send a second hunter, into a village of its own, whose recorded session answers in markdown. Run `verify write repos/bogwater/.scratch/specs/ward-the-well.md '# Ward the well'` and `verify write repos/bogwater/.scratch/slices/ward-the-well.json '{"spec":".scratch/specs/ward-the-well.md","branch":"main","slices":[{"id":"S1","title":"Sink the shaft","autonomy":"afk","blocked_by":[]}]}'`, then `verify replay test/fixtures/transcripts/markdown.jsonl`, which prints `it waits for its next message: once`. Run `verify wait-for "Ward the well"`, `verify click "Ward the well"`, `verify click "Take S1"`, `verify click "Never ask"` and `verify press Escape`, then `verify wait-for "Bogna , returned wounded on S1 of Ward the well"` and `verify click "Bogna"`. `verify snapshot` shows the dialog `Journal of Bogna`, whose second entry is `Bogna:` followed by the shape of what it wrote rather than the marks it wrote them with: a heading `Plan for S1`; a paragraph of the text `I will`, a strong `raise the sill`, the text `first, then run`, the code `npm run check`, the text `. The gate is`, an emphasis `not` and the text `in this slice.`; a list of `Measure the old sill.` and `Cut the oak to length.`; a table whose columnheaders are `Step`, `File` and `State` over the rows `Lay the sill src/weir.ts done` and `Hang the gate src/gate.ts open`; a separator; the code `weir.sill = "oak" weir.gate = "iron"`; and a blockquote `The old weir was never measured.`. Nowhere on the page does a `#`, a `*` or a backtick stand.
- **A link is said, and what you wrote keeps its marks.** Run ``verify fill "Reply to Bogna" '**Oak**, from the `old grove`.'``, then `verify press Enter` and `verify wait-for "The weir is mended."`. It prints that it is visible. `verify snapshot` shows three more items in `Entries`: ``You: **Oak**, from the `old grove`.``, with every mark as you typed it; `Bash:` with the code `grep -n "**oak**" src/weir.ts`, as the session wrote it; and `Bogna:` with the paragraph `The weir is mended. See the measurements for the rest.`. The link's words stand in that paragraph and there is no `link` anywhere in the tree: it is said, and there is nothing to follow.
- **The look of the set markdown.** Run `verify screenshot said`, `verify screenshot said-plan --clip 560,225,620,325 --zoom 2` and `verify screenshot said-reply --clip 560,570,860,130 --zoom 2`, and open all three.
Under `BOGNA` in small capitals the plan is set in the journal's own hand: `PLAN FOR S1` in larger small capitals over a hairline; the paragraph in ink, with `raise the sill` on a low rust wash instead of in a second weight, `npm run check` in monospace on a grey wash, and `not` in a true italic rather than a slanted upright; two numbered items with rust figures; a three-column table whose heads are small capitals, each row ruled off by a hairline, its three columns spread across the page rather than crowded; a short centred rule; the fenced lines in monospace on a darker patch behind a thick rule; and the quotation in italics behind a thin one.
Beside the whole of it, on the rail, stands `BASH` over `npm run check`, and nothing of the plan strays onto the rail.
Lower down, in the reply crop, `the measurements` carries a dotted underline and no colour, so it reads as named and not as somewhere to go, while your own `**Oak**` and the tool's `**oak**` keep their asterisks, the tool's on the rail beside the message that led to it.
No text overlaps, runs out of the surface or crosses the inner rule, and the painted world shows uncropped left of it.

- **Code is set in a monospace face.** Send a third hunter, into a village of its own, whose recorded session puts figures in its code.
Run `verify write repos/bogwater/.scratch/specs/gauge-the-sluice.md '# Gauge the sluice'` and `verify write repos/bogwater/.scratch/slices/gauge-the-sluice.json '{"spec":".scratch/specs/gauge-the-sluice.md","branch":"main","slices":[{"id":"S1","title":"Set the gauge","autonomy":"afk","blocked_by":[]}]}'`, then `verify replay test/fixtures/transcripts/code.jsonl`, which prints `3 lines` and `it waits at: (nowhere)`.
Run `verify wait-for "Gauge the sluice"`, `verify click "Gauge the sluice"`, `verify click "Take S1"`, `verify click "Never ask"` and `verify press Escape`, then `verify wait-for "Dobromir , returned wounded on S1 of Gauge the sluice"` and `verify click "Dobromir"`.
`verify snapshot` shows the dialog `Journal of Dobromir`, whose second entry is `Dobromir:` with a paragraph of the text `The gauge reads`, the code `depth = 2.4`, the text `and the sill is cut from`, the code `timber = "oak"` and the text `.`, and under it the code `weir.gauge = 2.4 weir.readings = [0.5, 1.25, 2.4, 3.75, 4.0, 5.5, 6.25, 7.0, 8.125, 9.5, 10.75, 11.0]`.
Run `verify screenshot code` and `verify screenshot code-set --clip 560,248,600,92 --zoom 3`, and open both.
Inline and fenced alike, the code is in one monospace face: every figure of `depth = 2.4` and of the fenced lines stands at a full height on the baseline, none of them dropping below it or shrinking to the height of an x as the `1` of `S1` does in your own line above, which is the book face's own; and the straight quotes of `timber = "oak"` stay straight instead of curling.
- **A long line scrolls inside its block.** Run `verify screenshot code-fence --clip 575,275,580,70 --zoom 4` and open it.
The second fenced line is cut off at the block's right edge, with a shadow down that edge saying there is more that way, and the journal stands exactly where it stood for the hunter before, no wider for the long line it holds.
Run `verify fill "Reply to Dobromir" "Set it to 2.4."`, then `verify press Shift+Tab`, which reaches the block itself, and `verify screenshot code-reached --clip 575,275,580,70 --zoom 4`: the block is ringed in rust, since a block with more than it can show takes the keyboard.
Run `verify press ArrowRight` twelve times, then `verify screenshot code-scrolled --clip 575,275,580,70 --zoom 4` and `verify screenshot code-whole`, and open both.
The block alone has moved: it is scrolled to the end of its longest line, `10.75, 11.0]` now standing at its right edge with the shadow gone from it and fallen on the left edge instead, the short first line carried far enough out of sight that only `= 2.4` of it is left, and the journal, the entries above it and the painted world all exactly as they were.
`verify snapshot` shows the text box `Reply to Dobromir` still holding `Set it to 2.4.`.

- **A leaf for each hunter in the margin.** Run `verify press Escape` to put `Dobromir`'s journal away, then `verify snapshot`.
A region `Leaves` holds three articles, in the order their hunters stand down the map: `Wojmir`, then `Dobromir`, then `Bogna`, the three villages' hunters in the order they stand across the forest.
Each leaf reads its hunter's name, then how long ago that hunter spoke, `just now` under a minute and `<n> min ago` once one has passed, so which of the two a leaf says depends on how long the run has taken to reach here, then its latest words with none of the marks it wrote them with: `The plank road is laid in oak.` for `Wojmir`; `The gauge reads depth = 2.4 and the sill is cut from timber = "oak". weir.gauge = 2.4 weir.readings = [0.5, 1.25, 2.4, 3.75, 4.0, 5.5, 6.25, 7.0, 8.125, 9.5, 10.75, 11.0]` for `Dobromir`; and `The weir is mended. See the measurements for the rest.` for `Bogna`.
`Dobromir` spoke last of the three, and its leaf alone reads `Dobromir , spoke last`.
- **The look of the margin.** Run `verify screenshot margin` and `verify screenshot margin-close --clip 1130,0,310,290 --zoom 3`, and open both.
Down the map's right edge, clear of its top and its right, stand three small parchment leaves in the plaques' bone and ink, one under the other with a gap between them: each has its hunter's name in small capitals at the left and the time since it spoke in small italics at the right, and its words in ink under them, cut off at the end of the second line however much more it said.
`Dobromir`'s leaf, the one heard last, stands on a lighter parchment framed in rust, with a rust bar down its left edge; the other two are framed in ink.
No leaf's words overlap, run out of their leaf or reach a third line, no leaf covers another, and the painted world is whole left of them.
- **The mark moves to the hunter that speaks next.** Send a fourth hunter, to a rite of the region itself, which stands higher up the map than any of its villages.
Run `verify click "Rites of Bogwater Reach"`, `verify click "Set the proof of kill"`, `verify click "Never ask"` and `verify press Escape`, then `verify wait-for "Jaromila , returned with a trophy, sent to set the proof of kill in Bogwater Reach"`.
`verify snapshot`: the region `Leaves` holds four articles now, `Jaromila` the first of them, since it stands by the plaque above the villages, and its leaf alone reads `Jaromila , spoke last`; `Dobromir`'s no longer does.
Run `verify pause 2500`, then `verify screenshot margin-moved` and `verify screenshot margin-moved-close --clip 1130,0,310,380 --zoom 3`, and open both: the rust mark is on the top leaf now and gone from `Dobromir`'s, and the four leaves still stand clear of one another.
- **A leaf opens from the keyboard.** Run `verify click "Rites of kettle"`, then `verify press Escape`, which puts the rites away and the keyboard back on the plaque's button, the last thing on the map before the margin.
Run `verify press Tab`: it reaches the first leaf, which is the leaf itself and not something inside it.
`verify snapshot` shows `Jaromila`'s leaf, the first of the four, saying the whole of what it said, `The gauge reads depth = 2.4 and the sill is cut from timber = "oak". weir.gauge = 2.4 weir.readings = [0.5, 1.25, 2.4, 3.75, 4.0, 5.5, 6.25, 7.0, 8.125, 9.5, 10.75, 11.0]`, and holding a button `Read the journal of Jaromila` under it.
The other three leaves hold no such button: one leaf is open at a time.
Run `verify screenshot leaf-keyed` and `verify screenshot leaf-keyed-close --clip 1130,0,310,400 --zoom 3`, and open both.
The leaf stands on a deeper shadow than the rest, lifted off the map, with a rust hairline just inside its edge where the keyboard is, its words running to as many lines as they take instead of two, and the offer at its foot.
On the map, `Jaromila` by the plaque of `Bogwater Reach` is written in bone on rust instead of in bone on the night, which no other hunter's name is: the leaf says which figure it is about.
- **A leaf opens under the pointer.** Run `verify point "Dobromir"`. It prints `pointing at leaf "Dobromir"`.
`verify snapshot` shows `Dobromir`'s leaf open the same way, with its whole words and a button `Read the journal of Dobromir`, and `Jaromila`'s closed again with no button.
Run `verify screenshot leaf-pointed` and `verify screenshot leaf-pointed-close --clip 1130,0,310,400 --zoom 3`, and open both: `Dobromir`'s leaf is the lifted one now, with no rust hairline inside it since the keyboard is elsewhere, and on the map `Dobromir`'s name is the one on rust while `Jaromila`'s is back on the night.
- **The journal opens from a leaf.** Run `verify point "The weir is mended"`, which prints `pointing at leaf "Bogna"`, then `verify click "Read the journal of Bogna"` and `verify snapshot`.
The dialog `Journal of Bogna` is open over the margin, named for the hunter whose leaf it was, and the leaf the pointer has left is closed behind it.
Its `Entries` hold that hunter's session and nobody else's: `You: /implement-slice .scratch/slices/ward-the-well.json S1`, `Bogna:` with the plan it set out, `Bash:` with the code `npm run check`, `The turn ends.`, then ``You: **Oak**, from the `old grove`.``, `Bash:` with the code `grep -n "**oak**" src/weir.ts`, `Bogna:` with `The weir is mended. See the measurements for the rest.` and `The turn ends.`
At its foot stands the text box `Reply to Bogna`, addressed to that hunter by name, and a button `Send`, disabled while the box is empty.
Run `verify screenshot leaf-read` and `verify screenshot leaf-read-rail --clip 560,160,860,480 --zoom 2`, and open both.
Both of `Bogna`'s turns run down the reading page, and the two `BASH` calls stand on the rail at its right, each beside the words of the turn that made it: the first beside the plan, the second beside the message you sent.
Run `verify press Escape` to put the journal away.

- **The journal turns from one hunter to another.** Run `verify point "Dobromir"`, which prints `pointing at leaf "Dobromir"`, then `verify click "Read the journal of Dobromir"` and `verify snapshot`.
At the head of the dialog `Journal of Dobromir` stands a navigation `Journals`, holding one button per hunter on the map, in the order they stand down it: `Turn to Jaromila`, `Turn to Wojmir`, `Turn to Dobromir` and `Turn to Bogna`, each standing as that hunter's name alone.
Run `verify fill "Reply to Dobromir" "Hold it at 2.4."`, then `verify click "Turn to Wojmir"`, which prints `clicked button "Turn to Wojmir"`, and `verify snapshot`.
The dialog is `Journal of Wojmir` now, with the same four names in its index: `Wojmir`'s entries run down the reading page with `BASH` and `READ` on the rail beside them, the text box at its foot is `Reply to Wojmir` and holds nothing, and `Send` is disabled.
Nothing else has moved: the four leaves still stand in the margin behind it, and no second journal is open.
- **What you were writing is still there.** Run `verify click "Turn to Dobromir"` and `verify snapshot`.
The dialog is `Journal of Dobromir` again, holding that hunter's entries, and the text box `Reply to Dobromir` still holds `Hold it at 2.4.`, with `Send` enabled: turning away and back is not opening it anew.
- **The page comes back where you left it.** Run `verify screenshot turn-short --size 1440x420`, which makes the window too short for the conversation.
Run `verify fill "Reply to Dobromir" "Set it to 2.4."` and `verify press Enter`, then the same two for `And log the readings.` and for `Then close the sluice.`: that session has replayed to its end, so each stands alone as a `You:` entry with nothing answering it, and the page follows them down to the foot, where the fenced block is out of sight above.
Run `verify press Shift+Tab`, which reaches the fenced block and turns the page back to it, then `verify screenshot turn-place`, `verify click "Turn to Bogna"`, `verify screenshot turn-away`, `verify click "Turn to Dobromir"` and `verify screenshot turn-kept`, and open all three.
`turn-place` and `turn-kept` are the same page, turned back to the same place: `DOBROMIR` over `The gauge reads depth = 2.4 and the sill is cut from timber = "oak".`, the fenced block under it, `The turn ends.` under that and the first of the three `YOU` lines cut off at the foot, with the rest out of sight below.
The one difference between them is the rust ring the keyboard left around the block, which is gone in `turn-kept` because the index holds the keyboard instead.
In `turn-away`, `Bogna`'s own page stands at the foot of its session, where that hunter was left.
Run `verify screenshot turn-tall --size 1440x900` to put the window back.
- **Everyone in one stream.** Run `verify click "Everyone"` and `verify snapshot`.
The dialog is `Journal of Everyone` now, with `Everyone` the page of the index and no hunter's name marked on it.
It has no contract line, no state, no `Open in terminal`, no `Send home`, and no text box or `Send` at its foot: the stream is nobody's, so there is nobody in it to write to.
`Entries` holds every hunter's turns and nothing else, eighteen items in the order this map heard them: `You to Wojmir: /implement-slice .scratch/slices/drain-the-bog.json S3`, `Wojmir: Slice S3: Lay the plank road (also ready: S2)`, `Wojmir: The spec does not say what the planks are made of. Oak or pine?`, `You to Wojmir: Oak, from the old grove.`, `Wojmir: Oak it is.`, `Wojmir: The plank road is laid in oak.`, `You to Wojmir: Pine next time.`, `You to Bogna: /implement-slice .scratch/slices/ward-the-well.json S1`, `Bogna:` with the plan it set out, ``You to Bogna: **Oak**, from the `old grove`.``, `Bogna: The weir is mended. See the measurements for the rest.`, `You to Dobromir: /implement-slice .scratch/slices/gauge-the-sluice.json S1`, `Dobromir:` with its gauge reading, `You to Jaromila: /make-verify`, `Jaromila:` with the same reading, and last `You to Dobromir: Set it to 2.4.`, `You to Dobromir: And log the readings.` and `You to Dobromir: Then close the sluice.`
Each hunter's own lines keep the order its own page has them in, and every line says whose it is: yours by the hunter you wrote it to, a hunter's by its name.
No `Bash:`, `Read:`, `Edit:` or `The turn ends.` stands anywhere in it: a tool call is a hunter's own work, read on its own page beside the words that called it.
Run `verify screenshot everyone` and `verify screenshot everyone-head --clip 545,10,880,120 --zoom 2`, and open both.
`JOURNAL OF` in small capitals over `Everyone` stands where a hunter's name stood, with `EVERYONE` first in the index under the close, ruled in rust as the page you are on, and the four hunters' names after it.
The turns run down one page the whole width of the surface, with no rail beside them, each under the name of whoever said it, and the foot of the surface is the last of them rather than a reply box.
No text overlaps, runs out of the surface or crosses the inner rule, and the painted world shows uncropped left of it.
- **Back to one hunter.** Run `verify click "Turn to Bogna"` and `verify snapshot`.
The dialog is `Journal of Bogna` again, holding that hunter's entries with `BASH` on the rail, and the text box `Reply to Bogna` is back at its foot.
Run `verify press Escape` to put the journal away.

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
- Only what the hunter says is set as type. What you typed and what a tool was given are shown exactly as written, since neither was written as markdown.
- An image, a raw HTML tag, or any construct the journal does not set, stays the plain text the hunter wrote: nothing a session writes can become markup on the page.
- A fenced block with more than it can show is a tab stop, and scrolls sideways under the arrow keys; one that fits is neither, so short fences do not fill the tab order.
- A leaf stands for every hunter on the map, whatever its state, and goes from the margin when its hunter leaves the map.
- A hunter that has not spoken yet says `Not a word yet.` where its words would stand.
- A leaf says its hunter's latest words as plain text: the shape the journal sets them in is for reading, and a leaf is for glancing.
- How long ago a hunter spoke is counted from when this map heard it, not from a clock the server keeps: the broadcast carries one state of the world and no time at all, so a map just opened says every hunter spoke just now.
- The leaves read the way the map reads: they stand in the order their hunters stand down it, and the hunter heard last is marked where it is rather than moved to the top.
- The margin floats over the map's right edge, so the world under it is covered whenever any hunter is out; the journal is much wider than the margin and stands over it, and over the map's right, for as long as it is open.
- The journal is one surface for reading: the turns run down a reading page and the tool calls of each turn stand on a rail at its right, beside the words that called them, rather than in among them. A turn's notes keep the order the session made them in, and no note stands above the words that led to it.
- A leaf opens when the pointer moves onto it, not when something over the margin closes under a pointer that has not moved: closing the journal leaves every leaf as it was.
- One leaf is open at a time: pointing at another leaf, or reaching one with the keyboard, closes the one that was open, and the mark on the map goes with it.
- An open leaf says the whole of its hunter's latest words, however many lines they take. A session that said a great deal says it inside the leaf, which scrolls rather than running the margin off the map.
- A leaf stays read-only open: it offers to read the hunter's journal and nothing else, since answering is not a glance.
- The journal is one surface turned from hunter to hunter, not one opened anew for each: what you had begun writing to a hunter, and the place you had turned back to in its session, are both still there when you come back to it. Closing the journal lets them go.
- The index stands only while more than one hunter is on the map, since with one there is nowhere to turn to, and it stands in the head's own space, so turning from hunter to hunter never moves the reading page under it.
- A hunter written to follows its words again: the page goes back to the foot and stays there as the session answers, wherever you had turned back to before you wrote.
- Everyone's stream is words alone: what you wrote to each hunter and what each said back. A tool call and the end of a turn are a hunter's own work, read on its own page beside the words that called them; in the stream they would say nothing about whose turn they were.
- The order of everyone's stream is the order this map heard it, not a clock the server keeps, since the broadcast carries none. Turns already in a journal when the map opened all arrived at once, and keep the order the world listed their hunters in; everything said after that is in true order.
- Everyone stands in the index only while more than one hunter is on the map, as the rest of the index does, and the chronicle closes rather than standing empty when the second to last hunter leaves it.
- Text that merely looks like markdown is set as markdown. A line that happens to start with a hash, or a stray run of pipes in a log, takes a shape the hunter did not intend; its characters survive, but its form may surprise.
