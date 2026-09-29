# Guslar manual

What Guslar does, feature by feature, and what you should see at each step.
A person reads it as the product's checklist; the verify skill (`.agents/skills/verify/`) reads it as the recipe for a check.

Guslar is a local web app started with `guslar` (`npx guslar` once published).
It draws the repos listed in a `world.json` as regions of one painted map, and covers every empty slot in fog, which drifts like weather while its outline stays where it is.
The map arrives under that fog everywhere, and it pulls off the slots that have a repo once, as the page loads.
Every spec in a region's repo is a village, and each village's notice board carries that spec's contracts and their states.
Each village is painted at its stage: bounty drafted, contracts posted or cleared.
A ready contract can be taken, which sends a hunter: a `claude` session running `/implement-slice` on it, one per village at a time.
The other rites of the pipeline send hunters too: from a region's plaque (`/interview`, `/write-spec`, `/make-verify`), from a village with no contracts (`/write-slices`), and from a pending contract (`/implement-slice --signoff`).
Each hunter stands on the map beside its village in the pose of its state, and comes back with a trophy once its contract's commit lands, or wounded when its session's turn ends without one.
Each hunter keeps a journal of its session, opened from its figure on the map, where you read it as it goes and write back to it.
From the journal, a hunter's session can be resumed in a real terminal along the map's foot, when the journal is not enough.
A hunter that has come back is sent home from its journal, which takes it off the map and lets its session go.
`guslar hooks install` puts Guslar's Claude Code hooks into every repo of the world, beside any hooks already there, so each hunter's session reports its events to the map; `guslar hooks remove` takes them out again.
With the hooks in, a hunter's permission request is pinned to the map as a petition, and allowing or denying it there answers the session.
A `claude` session started outside Guslar, in a repo of the world, shows up as a hunter too, bound to the contract its first reply names, with a journal to read but not to write in.
Guslar keeps its own hunters beside `world.json`, so a restart, a crash or a closed terminal brings them back with their journals, and writing to one resumes its session.

## Start from a known state

- Start a run with the verify skill; it prints the run folder and the URL.
- The run's Guslar is started with the run's own `world.json`: `forest` is `./repos/bogwater` named `Bogwater Reach`, `river-town` is `./repos/kettle`, and the other four slots are empty.
- The run has its own `HOME`, empty at start. A one-off `verify guslar` reads `home/.guslar/world.json` unless a step gives it `--world` or `GUSLAR_WORLD`.
- Run the skill's doctor right after `start`, and require `fit` before driving anything else.
- Never drive an instance this run did not start.

## Driving conventions

- `verify` below means `.agents/skills/verify/verify.mjs`, with `--run <run folder>` on every command but `start`.
- `<run folder>` in what Guslar prints means its absolute path, because Guslar prints the default world file and every repo that way. The helper's own lines (`run folder:`, `saved`, `wrote`) print it relative to the repo.
- Name page elements by role and accessible name, never by CSS class or position.
- The map art is a canvas: assert words from the accessibility tree, the broadcast or the CLI, and the look from a screenshot you open and inspect.
- Write every file a step needs with `verify write`, so the write is in the transcript.
- Take commands literally: keep quoted names and flags as written.
- Preconditions are setup, not checks. Every step and every `Behind it` line is a check; an entry point with no step of its own is not driven.
- Quoted output appears in a line of the output; the rest of that line may say more. Pids, ports and run folder names differ per run.
- Each feature file assumes a fresh run, so start one per file.

## Feature file shape

Each file opens with the feature's name and one paragraph on what a user gets from it, then these sections, in order:

1. `Entry points`: every way a user reaches the feature.
2. `Steps`: each step is the user's action, the command that performs it, and what you should see.
3. `Behind it`: the state the steps leave, and how to read it.
4. `Gotchas`: what wastes a run or makes a check lie.

No implementation details: only user paths, handles, commands, state and what proves it.

## Features

- [Open the world](./open-the-world.md): `guslar` starts the server, opens the browser, and the map shows each region in its slot and fog elsewhere.
- [The weather](./weather.md): the map arrives under fog that pulls off your own regions once, and the fog then drifts like cloud while its outline stays put, so the map is alive when you watch it, still when you glance past it, at rest while you are away from it, and off altogether when your system asks for less motion.
- [Configure the world](./configure-the-world.md): which `world.json` Guslar reads, how regions are named, and the configs it refuses.
- [Choose a world's theme](./choose-a-theme.md): a `world.json` with `"theme": "vaillant"` opens a world whose tab carries the Vaillant logo head and the title `Guslar · Vaillant`, whose plaques and dialogs are teal on snow, whose heat pumps stand at their stages beside corkboards of work orders, whose technician is the Vaillant hare, named from its office's city, with a red fault light when it waits on you, and whose map speaks of offices, heat pumps and technicians, a world with no theme is Guslar, and a theme there is not is refused.
- [Read a village's notice board](./villages.md): every spec is a village on the map, and its board shows each contract's title, autonomy and state from the `slices/<slug>` trailers.
- [See each village's stage](./village-stages.md): each village is painted as a bounty drafted, contracts posted or cleared, and the page says which.
- [Take a contract](./take-a-contract.md): a ready contract is taken with a chosen permission mode, a hunter rides out on it, and its village refuses a second one.
- [Perform a rite](./perform-a-rite.md): a region's plaque sends hunters to hear the villagers, draft the bounty or set the proof of kill, a village with no contracts sends one to post them, and a pending contract one to inspect its trophy, each with that skill in the region's repo.
- [Follow a hunter](./follow-a-hunter.md): each hunter rides out, hunts, awaits you, and returns with a trophy or wounded, on the map, on its contract's card and in the broadcast.
- [Talk to a hunter](./talk-to-a-hunter.md): a hunter's journal shows its session's messages and tool calls as they arrive, and sends what you type as your next message.
- [Open a hunter in a terminal](./open-in-terminal.md): the journal's `Open in terminal` resumes the hunter's session with `claude --resume` in a terminal on the map, which is read and typed into like any other.
- [Send a hunter home](./send-a-hunter-home.md): the journal's `Send home` takes a hunter that has come back off the map for good, lets its session go and frees its name, and is refused while the hunter is still out.
- [Install the hooks](./install-hooks.md): `guslar hooks install` adds Guslar's hooks to each repo's `.claude/settings.local.json` and keeps every other hook, a hunter's hook events reach the broadcast, and `guslar hooks remove` leaves the file as it was.
- [Answer a hunter's request](./answer-a-request.md): a hunter's permission request appears as a petition on the map, the hunter awaits you, and allowing or denying it, with a reason, answers its session.
- [See sessions started outside Guslar](./outside-sessions.md): a `claude` session started in a registered repo appears as a hunter by its region's plaque, rides for the contract its first reply line names, follows the same states as Guslar's own hunters, and has a journal with no line to type into.
- [Lose and regain the server](./reconnect.md): the map says when the server is gone and recovers by itself when it is back.
- [Keep hunters across a restart](./keep-hunters.md): Guslar keeps its hunters in `hunters.json` beside `world.json`, a restart brings each back with its journal and session, one cut short mid-turn comes back wounded, and writing to it resumes its session.
