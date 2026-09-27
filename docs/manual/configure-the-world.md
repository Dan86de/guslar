# Configure the world

A user decides which repo sits in which painted slot by writing a `world.json`, and Guslar tells them plainly when that file is wrong instead of opening a broken map.

## Entry points

- `~/.guslar/world.json`, read when nothing else is given.
- `guslar --world <file>`.
- The `GUSLAR_WORLD` environment variable.

A world file is `{ "regions": [{ "slot": …, "repo": …, "name"?: … }] }`, with slots `forest`, `marsh`, `mountains`, `river-town`, `mines`, `ruins`.

## Steps

Run them in this order: later steps rely on the files earlier ones write.

- **No world file at all.** Run `verify guslar`. It prints `Guslar reads <run folder>/home/.guslar/world.json (0 regions)`, then `it started; world served at /api/world:` with all six slots `"kind":"fog"`.
- **The default file.** Run `verify write home/.guslar/world.json '{"regions":[{"slot":"marsh","repo":"~/fen"}]}'`, then `verify guslar`. It prints `(1 region)` and serves `marsh` as a region named `fen` whose `repo` is `<run folder>/home/fen`: `~` is the home directory.
- **A file given with `--world`.** Run `verify write ruins.json '{"regions":[{"slot":"ruins","repo":"./old"}]}'`, then `verify guslar --world ruins.json`. It prints `Guslar reads ruins.json (1 region)` and serves only `ruins` as a region, named `old`, whose `repo` is `<run folder>/old`: a relative repo starts at the world file's folder, and `--world` wins over the default file.
- **A file given with `GUSLAR_WORLD`.** Run `verify guslar --env GUSLAR_WORLD=ruins.json`. It prints `Guslar reads ruins.json (1 region)` and serves the same world as the step before: `GUSLAR_WORLD` wins over the default file.
- **`--world` wins over `GUSLAR_WORLD`.** Run `verify write other.json '{"regions":[{"slot":"mines","repo":"./pit"}]}'`, then `verify guslar --env GUSLAR_WORLD=other.json --world ruins.json`. It prints `Guslar reads ruins.json (1 region)`.
- **A region's own name.** Run `verify read world.json`: `forest` has `"name": "Bogwater Reach"` and `river-town` has no `name`. Then run `verify world`. `forest` is named `Bogwater Reach`, and `river-town` is named after its folder, `kettle`.
- **Two repos in one slot.** Run `verify write twice.json '{"regions":[{"slot":"ruins","repo":"./a"},{"slot":"ruins","repo":"./b"}]}'`, then `verify guslar --world twice.json`. It prints `guslar: twice.json: regions[1].slot "ruins" is already taken by another repo` and `guslar exited by itself: 1`.
- **A slot that does not exist.** Run `verify write desert.json '{"regions":[{"slot":"desert","repo":"./a"}]}'`, then `verify guslar --world desert.json`. It prints `guslar: desert.json: regions[0].slot must be one of forest, marsh, mountains, river-town, mines, ruins` and `guslar exited by itself: 1`.
- **An empty repo.** Run `verify write blank.json '{"regions":[{"slot":"mines","repo":""}]}'`, then `verify guslar --world blank.json`. It prints `guslar: blank.json: regions[0].repo must be a path` and `guslar exited by itself: 1`.
- **Broken JSON.** Run `verify write broken.json '{"regions": ['`, then `verify guslar --world broken.json`. It prints `guslar: broken.json is not valid JSON:` and `guslar exited by itself: 1`.
- **A bad port.** Run `verify guslar --port 99999`. It prints `guslar: --port must be a whole number from 0 to 65535, got "99999"` and `guslar exited by itself: 1`.

## Behind it

- **World files are left as written.** `verify read home/.guslar/world.json` and `verify read ruins.json` print each file exactly as `verify write` printed it.
- **No repo folder is created.** `verify read home/fen` and `verify read old`, the repos of the two worlds Guslar served, each print `does not exist`.

## Gotchas

- `--world` wins over `GUSLAR_WORLD`, which wins over `~/.guslar/world.json`.
- A missing world file is not an error: it is a world all under fog.
- Guslar does not check that a repo folder exists yet. A region pointing at a missing folder still shows.
- A refusal names the file as it was given, so a relative `--world` shows up relative.
