# Choose a world's theme

A user who runs two Guslars side by side, one for their own repos and one for work, tells them apart by giving each world its own theme.
A `world.json` that says `"theme": "vaillant"` opens a Vaillant world, whose browser tab carries the Vaillant logo head and the title `Guslar · Vaillant`.
A world with no theme, or with `"theme": "guslar"`, opens as Guslar always has, and a theme Guslar does not have is refused before anything starts.

## Entry points

- The `theme` field of a `world.json`, read from wherever [Configure the world](./configure-the-world.md) says Guslar reads it: `--world`, `GUSLAR_WORLD` or `~/.guslar/world.json`.
- The themes are `guslar`, the default, and `vaillant`.

## Steps

Start the run with the Vaillant world the manual keeps: `verify start --world docs/manual/worlds/vaillant.json`.
It is the default run's world with `"theme": "vaillant"` added: `forest` is `./repos/bogwater` named `Bogwater Reach`, and `river-town` is `./repos/kettle` with no name.

- **The world names its theme.** Run `verify read world.json`. It holds `"theme": "vaillant"` beside the two regions.
- **The tab says Vaillant.** Run `verify open`. It prints `title: Guslar · Vaillant`, `icon: /vaillant/favicon.png`, `map busy: false`, and `console:` with `(nothing)` on the line under it. The page still has the heading `Guslar` and the list `Regions` with six items.
- **The tab's icon is the Vaillant logo head.** Run `verify http /vaillant/favicon.png --save tab-icon.png`. It prints `HTTP 200 image/png`, `bytes of image/png` and `saved`. Open `tab-icon.png`: a 128x128 square holding the Vaillant hare's black-and-white head in a white egg, on a teal rounded rectangle standing upright in the middle, with the square's sides clear either side of it.
- **The broadcast carries the theme.** Run `verify world`. It prints one message with `"type": "world"` and, under `"world"`, `"theme": "vaillant"` and six `slots` in the order forest, marsh, mountains, river-town, mines, ruins, `forest` and `river-town` regions and the other four `"kind": "fog"`.
- **A world set to Guslar's own theme is Guslar.** Run `verify write guslar.json '{"theme":"guslar","regions":[{"slot":"forest","repo":"./repos/bogwater"}]}'`, then `verify guslar --world guslar.json`. It prints `Guslar reads guslar.json (1 region)` and `it started; world served at /api/world:` with `"theme":"guslar"`.
- **A world with no theme is Guslar.** Run `verify guslar`, which reads `home/.guslar/world.json`, a file that does not exist. It prints `it started; world served at /api/world:` with `"theme":"guslar"`.
- **A theme there is not is refused.** Run `verify write nonsense.json '{"theme":"nonsense","regions":[]}'`, then `verify guslar --world nonsense.json`. It prints `guslar: nonsense.json: theme must be one of guslar, vaillant` and `guslar exited by itself: 1`.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and a world whose `"theme"` is `"vaillant"`.
- **The world file is left as written.** `verify read world.json` prints what the first step printed.

## Gotchas

- A Guslar-themed world's tab is checked in [Open the world](./open-the-world.md): its `open` prints `title: Guslar` and `icon: /favicon.svg`.
- `http` prints an image only by its size; `--save` is how to look at it.
- The theme changes only the tab so far: the map, its words and its colours are Guslar's in every theme.
