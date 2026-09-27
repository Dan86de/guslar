# Install the hooks

A user runs `guslar hooks install` once, and every repo in their world reports its sessions' events to Guslar through Claude Code hooks, without losing any hook they already had.
`guslar hooks remove` takes Guslar's hooks out again and leaves each settings file as the user wrote it.
Each event a hunter's session fires reaches the map as that hunter's last hook.

## Entry points

- `guslar hooks install`, with the world file chosen as [Configure the world](./configure-the-world.md) says (`--world`, `GUSLAR_WORLD`, `~/.guslar/world.json`).
- `guslar hooks remove`, the same way.
- A hunter's session running the installed hooks, seen in the world broadcast on `/ws` (and `/api/world`) as the hunter's `"lastHook"`.

## Steps

Preconditions: give Bogwater a settings file with hooks of its own and a ready contract, and make Kettle a git repo with no settings file.

- Run `verify write repos/bogwater/.claude/settings.local.json` with this content, as one argument:

  ```json
  {
    "permissions": {
      "allow": [
        "Bash(npm run check)"
      ]
    },
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "hooks": [
            {
              "type": "command",
              "command": "~/bin/audit-bash.sh",
              "timeout": 30
            }
          ]
        }
      ],
      "Stop": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "~/bin/notify-stop.sh"
            }
          ]
        }
      ]
    },
    "outputStyle": "Explanatory"
  }
  ```

- Run `verify write repos/bogwater/.scratch/specs/drain-the-bog.md '# Drain the bog'` and `verify write repos/bogwater/.scratch/slices/drain-the-bog.json '{"spec":".scratch/specs/drain-the-bog.md","branch":"main","slices":[{"id":"S1","title":"Dig the first ditch","autonomy":"afk","blocked_by":[]},{"id":"S3","title":"Lay the plank road","autonomy":"afk","blocked_by":["S1"]}]}'`.
- Run, in this order: `verify git repos/bogwater init --initial-branch=main`, `verify git repos/bogwater add .scratch`, `verify git repos/bogwater commit -m "Add the spec"`, `verify git repos/bogwater switch --create slices/drain-the-bog`, `verify git repos/bogwater commit --allow-empty -m "Dig the first ditch" -m "Slice: S1"`, `verify git repos/kettle init --initial-branch=main`. Each ends with `git exited: 0`.
- Run `verify git repos/bogwater status --short`: it lists `?? .claude/`, the settings file git does not ignore yet.

The steps, in this order:

- **Install.** Run `verify guslar hooks install --world world.json`. It prints `Guslar reads world.json (2 regions)`, `Guslar's hooks installed in <run folder>/repos/bogwater/.claude/settings.local.json`, `Guslar's hooks installed in <run folder>/repos/kettle/.claude/settings.local.json` and `guslar exited by itself: 0`.
- **Their hooks stay first and as written.** Run `verify read repos/bogwater/.claude/settings.local.json`. `permissions` and `outputStyle` are as written, in their places. `PreToolUse` opens with their `Bash` group running `~/bin/audit-bash.sh` with `"timeout": 30`, and `Stop` with their `~/bin/notify-stop.sh` group, each laid out exactly as written. After them, and alone under `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PermissionRequest`, `Notification` and `SessionEnd`, each of those eight events has one more group: `"type": "command"`, `"command": "node '<checkout>/dist/server/guslar-hook.js'"` and `"timeout": 10`, but `"timeout": 300` under `PermissionRequest`, where `<checkout>` is the Guslar checkout the run folder sits in.
- **A repo with no settings file gets one.** Run `verify read repos/kettle/.claude/settings.local.json`. It holds only `"hooks"`, with the same eight events in that order, each with only Guslar's group.
- **Git does not see them.** Run `verify git repos/bogwater status --short` and `verify git repos/kettle status --short`. Neither lists `.claude/`. Run `verify read repos/kettle/.git/info/exclude`: its last two lines are `` # Guslar's hooks: `guslar hooks remove` takes these two lines out `` and `/.claude/settings.local.json`, and the same two close `repos/bogwater/.git/info/exclude`.
- **Installing twice adds nothing.** Run `verify guslar hooks install --world world.json` again. It prints `Guslar's hooks are already in <run folder>/repos/bogwater/.claude/settings.local.json` and the same for Kettle, then `guslar exited by itself: 0`. `verify read repos/bogwater/.claude/settings.local.json` prints the same as in **Their hooks stay first and as written.**, and each `.git/info/exclude` still has Guslar's two lines once.
- **A hook reaches its hunter.** Run `verify replay test/fixtures/transcripts/hooks.jsonl`. It prints `it waits at: gates/stop` and `it runs the repo's hooks for: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop`. Run `verify open`, `verify click "Drain the bog"`, `verify click "Take S3"`, `verify click "Edit files freely"` and `verify press Escape`, then `verify wait-for "Wojmir , hunting on S3"`. `verify world` shows `Wojmir` with `"lastHook": {"event": "PreToolUse", "tool": "Bash"}`.
- **The last hook moves on.** Run `verify write gates/stop open`, then `verify wait-for "Wojmir , returned wounded on S3"`. `verify world` shows `Wojmir` with `"lastHook": {"event": "Stop"}`.
- **Remove.** Run `verify guslar hooks remove --world world.json`. It prints `Guslar's hooks removed from <run folder>/repos/bogwater/.claude/settings.local.json`, `Guslar's hooks removed from <run folder>/repos/kettle/.claude/settings.local.json, which held nothing else and is gone` and `guslar exited by itself: 0`.
- **Their file as they wrote it.** Run `verify read repos/bogwater/.claude/settings.local.json`: it prints exactly what the precondition's `verify write` printed. `verify read repos/kettle/.claude` prints `repos/kettle/.claude does not exist`. Neither `.git/info/exclude` has Guslar's lines any more, and `verify git repos/bogwater status --short` lists `?? .claude/` again, as before **Install.**
- **Removing twice finds nothing.** Run `verify guslar hooks remove --world world.json` again. It prints `No Guslar hooks in <run folder>/repos/bogwater/.claude/settings.local.json` and the same for Kettle, and `verify read repos/bogwater/.claude/settings.local.json` is still as written.
- **A broken settings file is refused.** Run `verify write repos/kettle/.claude/settings.local.json '{"hooks": ['`, then `verify guslar hooks install --world world.json`. It prints `guslar: <run folder>/repos/kettle/.claude/settings.local.json is not valid JSON:` and `guslar exited by itself: 1`. `verify read repos/bogwater/.claude/settings.local.json` is still as written: nothing was installed anywhere.

## Behind it

- **What the hunter's claude ran.** `verify read claude.log` shows `GUSLAR_URL=` followed by this run's URL, then `ran SessionStart hook: node '<checkout>/dist/server/guslar-hook.js': exit 0`, and the same for `UserPromptSubmit`, `PreToolUse`, `PostToolUse` and `Stop`, in that order, each with nothing after `exit 0`: the hook printed nothing into the session. Bogwater's own hooks ran beside Guslar's: `ran PreToolUse hook: ~/bin/audit-bash.sh: exit 127` and `ran Stop hook: ~/bin/notify-stop.sh: exit 127`, because the run's `home/bin` is empty.
- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and `Wojmir` with `"lastHook":{"event":"Stop"}`.

## Gotchas

- The hooks live in each repo's `.claude/settings.local.json`, Claude Code's settings for this machine only. Guslar keeps that file out of `git status` with two lines in the repo's `.git/info/exclude`, since `implement-slice` needs a clean tree, and takes them out again on remove.
- Install checks every repo's settings file before it writes any, so one broken file stops the whole install.
- A hook runs `guslar-hook.js` from the Guslar that installed it. After moving or updating Guslar, install again: it replaces Guslar's own hooks and says `updated`.
- The hook reaches only the Guslar that started the session, through `GUSLAR_URL`. A session Guslar did not start runs the hook to no effect.
- `verify replay` lines `{"replay":"hook",…}` make the recorder claude run the repo's installed hooks as Claude Code would, so the hook, not the recorder, posts the event.
