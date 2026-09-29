# Open the world

A user runs one command and the painted world opens in their browser: every repo in their `world.json` is a named region in its slot, and every slot without a repo lies under fog.

## Entry points

- `guslar` in a terminal (`npx guslar` once published), which opens the map in the browser.
- The URL it prints, `Guslar is listening on <url>`, opened in any browser.

## Steps

`verify start` is this feature's first entry point; it is Setup, like every run's start, and the first two steps check what it did.

- **It started.** `start` printed `guslar: http://127.0.0.1:<port>/ (pid <n>)`. Run `verify read guslar.log`: it shows `Guslar reads <run folder>/world.json (2 regions)` then `Guslar is listening on http://127.0.0.1:<port>/`, the same URL.
- **The browser is asked to open the map.** Run `verify read browser.log`. It has one line: a timestamp and the same URL `start` printed.
- **See the map at the printed URL.** Run `verify open`, which loads the URL `start` printed, as a user opening it in any browser would. It prints `opened http://127.0.0.1:<port>/: HTTP 200`, `title: Guslar`, `map busy: false`, and `console:` with `(nothing)` on the line under it. The page has a heading `Guslar` and a list `Regions` with six items, in this order: `Bogwater Reach , forest`, `Unclaimed marsh, under fog`, `Unclaimed mountains, under fog`, `kettle , river town`, `Unclaimed mines, under fog`, `Unclaimed ruins, under fog`.
- **The look, wide.** Run `verify pause 1500`, so this shot rests on a wait of its own rather than on how long `open` settles for, and the fog is past its arrival and where it stays ([The weather](./weather.md)), then `verify screenshot wide` and open `wide.png`. It is 1440x900, and the map with its margin fills it. The dark forest at the top carries a parchment plaque `Bogwater Reach`, and the walled river town at the bottom carries `kettle`. Inside the painted world's double border line, the ruins (top left) and mines (left) merge into one bank of bone-coloured, hatched fog, and the marsh (top right) and mountains (right) into another, with soft, lumpy edges. No ruin, pit-head, dead tree, fence post or peak can be made out in it or pokes out of it; only the map's border line, and the roads and river leading in, show faintly at its thinning rim. The meadow and river in the middle stay clear.
- **The look, tall.** Run `verify screenshot tall --size 800x1000` and open `tall.png`. Take any close-ups for the wide look before this step, while the size is still 1440x900. The whole map shows with no region cropped, framed above and below by a blurred, darkened copy of the map, with no black bars and no hard edge where the map meets it.
- **The broadcast.** Run `verify world`. It prints one message with `"type": "world"` and, under `"world"`, six `slots` in the order forest, marsh, mountains, river-town, mines, ruins. `forest` is `"kind": "region"` with `"name": "Bogwater Reach"` and `repo` ending in `/repos/bogwater`. `river-town` is a region named `kettle` with `repo` ending in `/repos/kettle`. The other four are `"kind": "fog"`.

## Behind it

- **`/api/world` agrees with the broadcast.** `verify http /api/world` prints `HTTP 200 application/json` and `{"theme":"guslar","slots":[…]}`, the same theme and six slots as the broadcast.
- **Guslar writes nothing but where it listens.** `verify read home` prints `.guslar/` after the steps above, and `verify read home/.guslar/running` one file, `<pid>.json`, where `<pid>` is the pid `start` printed for Guslar. It is how a session started outside Guslar finds it, and Guslar takes it away when it stops, as [See sessions started outside Guslar](./outside-sessions.md) says.

## Gotchas

- `guslar.log` is appended to on every start of the run, so read the last `Guslar is listening` line.
- A plaque's accessible name reads `<name> , <slot name>`, with a space before the comma. That space is how the accessibility tree joins the visible name and the hidden slot name, not a typo in the product.
- Known ground at 1440x900, not features: the border line's grey-blue hook above the left bank near (355, 85), where it bends into the margin mist; the road leaving the town's north-west gate, with its roadside post and a bush, in the seam near (485-500, 585-615); the forest's own pines fading into the right bank near (845-920, 80-195); the meadow path's inked edge where it enters the right bank near (925, 400); and two parallel curved lines at the top of the right bank, which are a road.
- The browser zooms the map to fit, so plaques move between sizes. Judge positions against the painted regions, not against fixed pixels.
- The fog's hatching is weather and drifts, so it never lands twice the same way and these shots differ in it from run to run. What stays the same is everything this file asserts: where each bank sits, how far it reaches, and that nothing of a fogged region shows in it. Where the hatching goes belongs to [The weather](./weather.md).
