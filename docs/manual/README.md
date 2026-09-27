# Guslar manual

What Guslar does, feature by feature, and what you should see at each step.
A person reads it as the product's checklist; the verify skill (`.agents/skills/verify/`) reads it as the recipe for a check.

Guslar is a local web app started with `guslar` (`npx guslar` once published).
It draws the repos listed in a `world.json` as regions of one painted map, and covers every empty slot in fog.
Every spec in a region's repo is a village, and each village's notice board carries that spec's contracts and their states.
Each village is painted at its stage: bounty drafted, contracts posted or cleared.
A ready contract can be taken, which sends a hunter: a `claude` session running `/implement-slice` on it, one per village at a time.
Each hunter stands on the map beside its village in the pose of its state, and comes back with a trophy once its contract's commit lands, or wounded when its session's turn ends without one.

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
- [Configure the world](./configure-the-world.md): which `world.json` Guslar reads, how regions are named, and the configs it refuses.
- [Read a village's notice board](./villages.md): every spec is a village on the map, and its board shows each contract's title, autonomy and state from the `slices/<slug>` trailers.
- [See each village's stage](./village-stages.md): each village is painted as a bounty drafted, contracts posted or cleared, and the page says which.
- [Take a contract](./take-a-contract.md): a ready contract is taken with a chosen permission mode, a hunter rides out on it, and its village refuses a second one.
- [Follow a hunter](./follow-a-hunter.md): each hunter rides out, hunts, awaits you, and returns with a trophy or wounded, on the map, on its contract's card and in the broadcast.
- [Lose and regain the server](./reconnect.md): the map says when the server is gone and recovers by itself when it is back.
