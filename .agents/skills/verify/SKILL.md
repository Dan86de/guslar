---
name: verify
description: Starts Guslar in an isolated run with its own port, HOME, world and headless browser, drives it the way a user does (the `guslar` CLI, the map page, the world broadcast), and records whether each check passed in the run's evidence.md. Use it on your own, without being asked, before calling any change to Guslar done.
---

# Verify Guslar

Prove a change works in the running product, and write down what you saw.
The recipe for each check is the feature map in [docs/manual/](../../../docs/manual/README.md): read its README, then the feature file you are checking.
This skill says how to start, drive, observe and stop. The map says what to do and what you should see.

Guslar has three surfaces:

- **The map page** (primary): the painted world in a browser, served by the local server.
- **The `guslar` CLI**: what it prints on start, its refusals, and its exit code.
- **The world broadcast**: the state the server sends on `/ws`, also served at `/api/world`.

Every command below runs from the repo root, through one helper:

```bash
.agents/skills/verify/verify.mjs <command> --run <run folder> [...]
```

`--run` and the other options may go anywhere after the command.

The helper logs every call that names a run, refusals and usage errors included, with its output and exit code, to `<run folder>/transcript.log`.
Run folder names are local time; timestamps inside files, such as `browser.log`, are UTC.
Arguments are logged shell-quoted only where the shell needs it, so `wait-for "Reconnecting"` is logged as `wait-for Reconnecting`.
Its exit codes: `0` it did what was asked, `1` it failed or what it waited for did not happen, `2` usage, `3` refused.
For `guslar`, exit `0` means the helper ran Guslar; what Guslar itself did is in the output.

## Start

```bash
.agents/skills/verify/verify.mjs start
```

Needs `npm install` done once, and Playwright's Chromium (`npx playwright install chromium` if start says it is missing).
It prints the run folder, builds the product with `npm run build`, starts it, and ends with the next command to run:

```text
run folder: .scratch/verify/20260927-193529-6ae937
building: npm run build
guslar: http://127.0.0.1:56099/ (pid 63540)
browser: pid 63545
world: .scratch/verify/20260927-193529-6ae937/world.json
next: .agents/skills/verify/verify.mjs doctor --run .scratch/verify/20260927-193529-6ae937
```

Ready means that `next:` line and exit 0. Pass the printed run folder as `--run` to every later command.
The run folder is printed relative to the repo.
Guslar prints the default world file and every repo as an absolute path, and a world file given with `--world` or `GUSLAR_WORLD` as it was given.

What the run gets, all inside the run folder:

- its own port, picked free by Guslar (`--port 0`)
- its own `HOME` (`home/`, empty at start), so `~/.guslar/world.json` is the run's, never the user's
- its own `world.json`, which the run's Guslar is started with as `--world <absolute path>`: `forest` is `./repos/bogwater` named `Bogwater Reach`, `river-town` is `./repos/kettle` with no name, and the four other slots are fog
- its own `BROWSER`, which records the URL Guslar asked to open in `browser.log` and opens nothing
- its own `GUSLAR_CLAUDE`, a recorder that stands in for every hunter's `claude`: it writes how it was started (folder, arguments, `GUSLAR_HUNTER_ID`, `GUSLAR_URL`) and every line it is sent to `claude.log`, each line prefixed `[pid <n>]`, and runs until Guslar ends its stdin; no real Claude Code session starts. After `replay`, it also answers its first message by replaying a recorded stream-json session, and logs each line it sends and each gate it waits at.
  Started in a terminal, as `Open in terminal` resumes a session, it logs `stdin is a terminal (TERM=…)`, replays nothing, writes `Recorder claude resumed <session id>. Type a line and it answers.`, answers each line typed with `Recorder claude heard: <line>` and logs it as `typed: <line>`, and exits on Control+D (`stdin ended, exiting`) or when the terminal hangs up (`the terminal hung up, exiting`)
- its own headless Chromium, with its profile in `chrome/` and a 1440x900 viewport

Start options:

- `--world <file>`: copy that world file into the run instead of the default. Every repo in it must resolve inside the run folder, or start refuses. [docs/manual/worlds/](../../../docs/manual/worlds/) holds the world files the manual starts runs with, such as `vaillant.json`.
- `--world none`: start with no world file, so Guslar reads the run's own `home/.guslar/world.json`, which does not exist.

What a run cannot reach, and so refuses:

- any URL that is not this run's Guslar (`open`, `http`, `world`)
- a world file, `GUSLAR_WORLD` or file write outside the run folder, and any repo outside it, `git` included
- any `git` subcommand but those listed under Drive
- a run folder this skill did not start
- any other environment variable for `guslar`

Two runs can go side by side: nothing is shared but the built `dist/`, which each start rebuilds from the same source.

## Doctor

```bash
.agents/skills/verify/verify.mjs doctor --run <run folder>
```

Read-only. It prints `fit: guslar pid … at …, browser pid …, build is current` and exits 0, or `unfit` with one line per problem and exits 1.
It checks that the recorded Guslar is alive and is this run's `dist/server/cli.js` reading this run's world, that it answers and serves no repo outside the run, that nothing in `src/`, `index.html`, `package.json`, `vite.config.ts` or the art in `art/` and `art/vaillant/` changed since start, and that the browser is alive.

Run it first, and again whenever something looks off.
Unfit because the build is stale means your edit is not in the running product: stop and start a new run.

## Drive

| Command | What it does and prints |
|---|---|
| `open [path]` | Loads a page of this run in the browser and waits for the map to paint. Prints `opened <url>: HTTP <status>`, `title: …`, `icon: <path>` with the path of the page's tab icon, `map busy: false` once painted, `console:` with each console message or `(nothing)`, then `page:` and the accessibility tree. |
| `snapshot` | Prints `url: …` and the current page's accessibility tree, without reloading. |
| `wait-for <text> [--gone] [--timeout ms]` | Waits up to 15 s (or `--timeout`) for text to appear on the page, or with `--gone` to leave it. Prints `"<text>" is visible after <n> ms` or `"<text>" is gone after <n> ms`, and exits 1 if it did not happen. |
| `screenshot <name> [--size WxH] [--clip x,y,w,h [--zoom n]]` | Saves `<name>.png` in the run folder (names use letters, digits, `-` and `_`) and prints `saved <file> (<W>x<H>)`. `--size` changes the run's viewport for this and every later command; a screenshot with `--size 1440x900` puts back the default. `--clip` saves only that part of the page, in page pixels, and `--zoom` (1 to 4) renders it magnified, for a close look at a detail; it prints `saved <file> (<W>x<H>: <w>x<h> at <x>,<y>, zoom <n>)`. Crops are evidence too, so take them this way rather than cropping a file yourself. Zoom 4 is as close as the art goes: its own resolution is the limit, and a larger `--size` shows nothing more. |
| `world` | Connects to `/ws` as a map does and prints the first message, pretty-printed JSON shaped `{"type": "world", "world": {"theme": "…", "slots": [...], "hunters": [...]}}`. |
| `http <path> [--save <file>]` | GETs a path of this run's Guslar and prints `HTTP <status> <content type>`, then the body when it is text (JSON and SVG included), or `(<n> bytes of <content type>)` when it is not, like a PNG. `--save` also writes the body to `<file>` in the run folder (letters, digits, `-` and `_`, and one extension) and prints `saved <file>`, so an image it served can be opened and looked at. |
| `guslar [--env GUSLAR_WORLD=<file>] [args…]` | Runs a one-off `guslar --port 0 --no-open [args…]` in the run folder with the run's environment; your args come last and override those defaults. When the first arg is a command, like `hooks install`, it runs `guslar [args…]` as given, since a command starts no server. It does not get the run's `world.json`: without `--world` or `GUSLAR_WORLD` it reads `home/.guslar/world.json`. It never opens a browser, so `browser.log` does not change. It prints `one-off guslar pid <n>`, what Guslar printed, then either `guslar exited by itself: <code>`, or `it started; world served at /api/world: <json>` and `stopped it`, and last `pid <n> has ended`. |
| `click <name> [--exact]` | Clicks the one button whose accessible name contains `<name>`, as a user clicking it, and prints `clicked button "<full name>"`. With `--exact`, only a button named exactly `<name>` matches, for a name that is part of another's, like `Send` beside `Send home`. With none or several matching, it says so, lists every button's name, and exits 1. |
| `point <words>` | Moves the pointer onto the one leaf in the margin whose words hold `<words>`, as a user pointing at it, and prints `pointing at leaf "<hunter name>"`. The pointer stays where it was put until something else moves it, another `point` or a `click`. With none or several matching, it says so, lists every leaf by its hunter, and exits 1. |
| `fill <name> <text>` | Clicks the one text box whose accessible name contains `<name>`, empties it if it holds anything, and types `<text>` into it key by key, as a user does, then prints `filled text box "<full name>" with: <text>`. With none or several matching, it says so, lists every text box's name, and exits 1. |
| `press <key>` | Presses a key on the page, like `Escape`, `Tab` or `Enter`, and prints `pressed <key>`. |
| `git <repo> <subcommand> [args…]` | Runs `git <subcommand> [args…]` in a repo folder inside the run (made if missing), as a user of that repo does, and prints git's output, then `git exited: <code>`. Subcommands are `init`, `add`, `commit`, `switch`, `branch`, `log`, `rev-parse` and `status`. It runs with the run's `HOME`, the author and committer `Verify <verify@guslar.invalid>`, none of the user's git config, and no search for a repo above the folder, so it never signs, pushes, or touches the Guslar checkout the run folder sits in. |
| `server-stop [--signal INT\|HUP\|TERM\|KILL]` | Stops this run's Guslar with that signal and prints `stopped guslar (pid <n>) with SIG<name>`. `INT` is Ctrl-C, `HUP` is its terminal closing, `TERM` (the default) is a service manager stopping it, `KILL` is a crash. The browser stays. |
| `server-start` | Starts this run's Guslar again on the same port and prints `guslar: <url> (pid <n>), same port as before`. |
| `replay <transcript>` | Makes every claude this run's Guslar starts from now on answer its first message by replaying `<transcript>`, a `.jsonl` stream-json session in this repo, one line about every 150 ms, then run until its stdin ends. A line `{"replay":"wait","for":"<name>"}` is not sent: the claude logs `waiting at gates/<name>` and holds there until the run has a file `gates/<name>` (make it with `write gates/<name> open`), then logs `passed gates/<name>`. Each line sent is logged as `sent <type>`, with its subtype and the tool it calls, like `sent control_request can_use_tool` or `sent assistant AskUserQuestion`, and the end as `replay done`. A line `{"replay":"next"}` is not sent either: the claude logs `waiting for the next message` and holds there until Guslar writes it another line, as a session waits for your reply once its turn is over, then logs `replaying on`. A line `{"replay":"hook","event":"<event>","input":{…}}` is not sent either: as Claude Code does, the claude runs every hook its repo's `.claude/settings.local.json` has for that event, with the event on the hook's stdin, and logs `ran <event> hook: <command>: exit <code>`, followed by anything the hook printed, or `no <event> hook to run`. It prints `every claude started from now on replays <transcript> after its first message: <n> lines` and `it waits at: <gates>`, and, when the transcript has such lines, `it waits for its next message: once` (or `<n> times`) and `it runs the repo's hooks for: <events>`, each event once, in the order it first comes. |
| `pause <ms>` | Waits that long (1 to 10000 ms), for something that moves on the canvas to settle, and prints `paused <ms> ms`. |
| `write <path> <content>` | Writes a file inside the run folder, making its folders, and prints `wrote <file>:` followed by what the file now holds. Use it for every world file a check needs, so the write is in the transcript. |
| `read [path]` | Lists a folder inside the run folder (`(empty)` when it is), or prints a file. A missing path prints `<path> does not exist`, with the path as you passed it, and exits 1: that is how to prove a folder was not created. |
| `claude <repo> <prompt>` | Starts a recorder claude in a repo folder of the run as a user starts `claude` in a terminal, outside Guslar: with the run's `HOME` and no `GUSLAR_URL` or `GUSLAR_HUNTER_ID`. It takes `<prompt>` as its first message, replays the run's `replay` transcript with nothing on stdout, running the repo's hooks at its hook lines and writing each line it replays to its session transcript, `sessions/<pid>.jsonl`, whose path each hook gets as `transcript_path`, then exits. It logs to `claude.log` like the others, `outside Guslar, prompt: <prompt>` after its environment, and `session over, exiting` at the end. It prints `outside claude pid <n> started in <repo>, with no GUSLAR_URL or GUSLAR_HUNTER_ID`, and refuses until `replay` has been run. |
| `stop` | See [Stop](#stop). |

Handles to use:

- On the tab: the `title:` and `icon:` lines `open` prints. A world with no `theme`, or `"theme": "guslar"`, has `title: Guslar` and `icon: /favicon.svg`; a Vaillant world, `title: Guslar · Vaillant` and `icon: /vaillant/favicon.png`.
- In a Vaillant world, every name below is said in its own words instead, as [Choose a world's theme](../../../docs/manual/choose-a-theme.md) lists them: `Offices`, `Heat pumps`, `Technicians` and `Office jobs` for the lists, `Jobs at <office>` for a region's rites, `Job board of <heat pump>` for a notice board, `Service log of <technician>` for a journal.
- On the page: the heading `Guslar`, the list named `Regions`, and its six items in slot order.
  A region item reads `<name> , <slot name>` and a fogged one `Unclaimed <slot name>, under fog`, where the slot name is the slot with its hyphen as a space (`river town`).
  When the server is gone there is a status `The road to the server is cut. Reconnecting…`.
- The list named `Villages`, after `Regions`: one item per spec, region by region in slot order, each a button named `<village title> , village in <region name>`.
  Beside its button, each item has the village's stage as text: `Bounty drafted`, `Contracts posted` or `Cleared`.
- An opened village is a dialog named `Notice board of <village title>`, with a button `Close the notice board` and a list `Contracts` whose items read `<id> <afk|hitl> <title> <state>`, the state being `Done`, `Pending`, `Ready` or `Sealed by <ids>`.
- On a ready contract, a button `Take <id>`; a contract with a hunter out on it reads `… Ready <hunter name> hunts it` instead.
  `Take` opens a dialog `Send a hunter on <id>`, with a list `Permission modes` of four buttons, whose names start `Ask before every tool`, `Edit files freely`, `Let Claude judge` and `Never ask`, and a button `Cancel`.
  A village with a hunter out answers `Take` with an alert `<village title> refuses a second hunter: <hunter name> is out on <id>.`
- The list named `Region rites`, after `Hunters` (or after `Villages` while no hunter is out): one button per claimed region, over its plaque, named `Rites of <region name>`, which opens a dialog `Rites of <region name>` with a list `Rites` of three buttons, whose names start `Hear the villagers`, `Draft the bounty` and `Set the proof of kill`, and a button `Close the rites`. A rite opens the same permission chooser as `Take`, named `Send a hunter to <rite in lower case>`; a region with a hunter out on one of its rites answers with an alert `<region name> refuses a second hunter: <hunter name> is out to <rite in lower case>.`
- On a notice board with no contracts posted, a button `Post contracts`, whose chooser is `Send a hunter to post contracts`; on a pending contract, a button `Inspect the trophy of <id>`, whose chooser is `Send a hunter to inspect the trophy of <id>`.
- The list named `Hunters`, after `Villages`: one item per hunter on the map, reading `<hunter name> , <state> on <contract id> of <village title>`, or for another rite `<hunter name> , <state>, sent to <rite in lower case> for <village title>` (or `in <region name>`), the state being `riding out`, `hunting`, `awaiting you`, `returned with a trophy` or `returned wounded`.
  A session started outside Guslar reads `<hunter name> , <state> in <region name>, started outside Guslar` until its first reply names a contract, and `<hunter name> , <state> on <contract id> of <village title>, started outside Guslar` after.
  Each item holds a button named `<hunter name>`, over the hunter's name and figure, which opens its journal: a dialog `Journal of <hunter name>` with a button `Close the journal`, a list `Entries` whose items read `You: <text>`, `<hunter name>: <text>`, `<tool>:` followed by its input as code, or `The turn ends.`, a text box `Reply to <hunter name>` and a button `Send`.
  On the board, a contract whose hunter has come back reads `… <hunter name> returned with a trophy` or `… Ready <hunter name> returned wounded`, the wounded one with its `Take` button back.
- In a journal, while more than one hunter is on the map, a navigation `Journals` (`Service logs` in a Vaillant world) at its head, holding one button per hunter in the order they stand down the map, named `Turn to <hunter name>` (`Go to <technician>` in a Vaillant world) and standing as that hunter's name alone.
  Clicking one turns the journal to that hunter without closing it, keeping what you had begun writing to each hunter and the place you had turned back to in its session for as long as the journal stands open.
  Those names hold the hunter's name, so `click "<hunter name>"` matches one of them as well while a journal is open: use `--exact` for the hunter's own button on the map.
  First in that navigation stands `Everyone`, named `Turn to everyone` (`Go to everyone` in a Vaillant world), which turns the journal to `Journal of Everyone` (`Service log of Everyone`): every hunter's turns in one stream, in the order this map heard them, your own lines reading `You to <hunter name>:` and each hunter's its name alone, with no tool call and no `The turn ends.` among them.
  That view has no contract, no state, no `Open in terminal`, no `Send home` and no text box or `Send`, since there is nobody in particular in it to write to.
- An outside session's journal has no text box, `Send` or `Open in terminal`: in their place, the text `Started outside Guslar: write to <hunter name> in its own terminal.`
- In a journal, a button `Open in terminal`, disabled until the hunter's session has begun. It opens a dialog `Terminal of <hunter name>` along the map's foot, with a heading `Terminal of <hunter name>`, the code `claude --resume <session id>`, the text `running` or `ended, exit <code>`, a button `Close the terminal`, a button `Resume again` once it has ended, and a text box `Terminal input` that takes keys as the terminal does (`fill`, then `press Enter`).
  The terminal's lines are in the accessibility tree, so `wait-for` finds them; its rows there trail the screen by up to a second, so `pause 1500` before a `snapshot` that reads them. Escape goes to the terminal, not to the dialog.
- The margin down the map's right edge is a region `Leaves` (`Notes` in a Vaillant world), holding one article per hunter on the map, in the order their hunters stand down the map.
  Each reads `<hunter name>`, then how long ago that hunter spoke (`just now` under a minute, then `<n> min ago`, `<n> hr ago`, `a day ago` and `<n> days ago`), then its latest words as plain text, with none of the markdown marks it wrote them with, or `Not a word yet.` while it has said none.
  The leaf of the hunter heard last reads `<hunter name> , spoke last`.
  How long ago a hunter spoke is counted from when the page heard it, so a page just opened says every hunter spoke `just now`.
- A leaf opens when the pointer comes onto it or the keyboard reaches it, the leaf itself being the tab stop: it then says the whole of its hunter's latest words in place of two lines, and holds a button `Read the journal of <hunter name>` (`Read the service log of <technician>` in a Vaillant world), which opens that hunter's journal.
  One leaf is open at a time, and the name of its hunter is marked on the map for as long as it is.
  That button's name holds the hunter's name, so `click "<hunter name>"` matches it as well while that leaf is open: close the leaf, by pointing elsewhere, before opening a journal that way.
- A hunter's permission request is a region `Requests`, after `Hunters`, holding one dialog per hunter asking, named `<hunter name> asks to use <tool>`: the contract as `<id> <title>, <village title>`, the tool's description when it has one, each other input field as a term over its value in code, a text box `Reason to give <hunter name>`, and buttons `Allow <hunter name>` and `Deny <hunter name>`.
  Those button names hold the hunter's name, so `click "<hunter name>"` matches several while a request is up: answer it before opening the journal that way.
- On the CLI: the lines `Guslar reads <file> (<n> regions)` and `Guslar is listening on <url>`, and refusals starting `guslar: `.
  `guslar hooks install` and `guslar hooks remove` print one line per repo, naming its `.claude/settings.local.json`.

The map itself is a canvas: its art and fog are checked by screenshot, and everything a check asserts in words comes from the accessibility tree, the broadcast or the CLI.

## Evidence

Start writes `<run folder>/evidence.md` with the commit, branch and uncommitted changes filled in, then `## Setup`, `## Checks`, `## Stop`, and a placeholder `## Verdict` at the end.
Setup holds `start`, the first doctor right after it, and the feature's preconditions. When a step checks what `start` printed, quote that output again in the step.
When a `Behind it` line rests on output already quoted under a step, name that step instead of copying it again; when it rests on Setup, quote the Setup block again.
Headings use the feature's file name and the step's or line's bold name as the manual writes it, code formatting and final period included. A feature with no preconditions says so in Setup. Stop holds stop and the final doctor. Neither section is a check.
Fill it in last, after [Stop](#stop), so everything is in `transcript.log` to copy from.

Each check section:

A step's heading is `### <feature file>: <step name>`, and a `Behind it` line's is `### <feature file>: Behind it - <what it checks>`.

````markdown
### <feature file>: <step name>
- Verdict: pass | fail | manual | not driven
- Note: what happened
- Captured: screenshots and files read, by name in the run folder, or none

```text
<every command run for this check and its output, copied from transcript.log>
```
````

A check is one of:

- `pass`: the product does what the check says.
- `fail`: it does not, and the product is wrong: its code, or how it places or paints the art. The note says what happened instead.
- `manual`: it does not, and the map is wrong, because the change meant this. The note says why, and the map changes in the same PR.
- `not driven`: it needs something a run cannot reach. The note names it, and that check stays with the user.

The verdict is one of: **Done**, **Done, with n not driven** naming them, **Not done** naming the failed checks, or **Done once the map changes in this PR**.
A placeholder verdict means an abandoned run, which proves nothing.

The proof bar:

- Drive the user's real path, never an internal setter or a test-only endpoint.
- Capture the action and the state it led to, not only the final screen.
- Check side effects as well as what is visible: files written, what the browser was asked to open, what the server broadcasts.
- Cover every entry point the map lists for the feature. One not driven is reported as not driven, never as verified through another.
- Use a fake only where production already puts a boundary around the external system the check is not about. Here that is `BROWSER`, where the recorder stands in for the user's browser and the run's own Chromium loads the page, and `GUSLAR_CLAUDE`, where the recorder stands in for Claude Code.
- Copy command output from `transcript.log`; never paraphrase it. Each call there is a block: `$ <command>`, its output, then `[exit <n>]`. Copy whole blocks, those two lines included.
- Open every screenshot you take and look at it against the whole bar, whatever the step names. A defect fails the check whose subject it is (the map's art and fog belong to [Open the world](../../../docs/manual/open-the-world.md)); in any other check whose screenshot shows it, note it and leave that check's verdict to its own subject. A look that is off is a `fail`, even when the words pass: a region cropped, black bars or a hard edge around the map, a plaque off its region or over another, or fog that does not hide its region.
- The painted world is what lies inside its double border line; the margin outside it (autumn trees, drifting cloud, the blurred frame) belongs to no slot, and fog never has to hide it. The line is clearest at the left and right; at the top and bottom it runs into the map's own faded edge, and everything in that fade is margin: at 1440x900, the blurred autumn trees along the bottom (below y 780) and top are margin.
- Marks the manual names as known ground are ground. If a close look still cannot settle whether any other mark is ground or a feature, call it `fail`, name the screenshot and the spot in the note, and let the user decide.
- Where a fog bank meets a claimed region, the claimed region's clear zone fades into the fog. What shows in that seam belongs to the claimed region's side: its walls, trees and the roads, posts and bushes along its approaches. Only a feature that stands clearly inside the fogged region is a `fail` there.
- Fog has a dense body and a feathered rim, about the outer fifth of its width, where it thins into the map on purpose. Nothing may be made out in the body: no building, ruin, tower, pit-head, tree, post or peak. In the rim, only the map's own ground may show faintly through: the double border line around the painted world, the roads and river that lead into the region, and the colour of the land. Anything standing on the ground is a feature, not ground: buildings, ruins, pit-heads, mine carts, timber, rubble or spoil heaps, trees, stumps, posts and peaks. A feature of the fogged region showing in the rim, or poking out past the fog's edge, is a `fail`; margin art beyond the border line is not.

## Stop

```bash
.agents/skills/verify/verify.mjs stop --run <run folder>
```

It sends `SIGTERM` to this run's Guslar and browser by their recorded pids, never by name, waits until each is gone (escalating to `SIGKILL` after 5 s), and prints `stopped guslar (pid <n>) with SIGTERM`, `stopped browser (pid <n>) with SIGTERM` and `evidence stays in <run folder>`.
When Guslar started any hunters, or `claude` started any outside sessions, it also waits for each recorder claude in `claude.log` to exit, which a hunter's does once Guslar ends its stdin and an outside one once its replay is done, and prints `claudes ended: <n> of <n>`; one still held at a gate after 5 s is stopped. If either survived it prints `still running: <pids>` and exits 1.
Then run `doctor` once more: it must say `unfit`, with both processes not running.
The run folder, its screenshots, `transcript.log` and `evidence.md` stay.
