# The weather

The fog is weather, not a still picture. Two layers of cloud drift slowly behind the fog's outline, so a map with no hunter riding still has something moving in it, and the movement is slow enough that it never competes with a hunter for your eye.
It only blows while you are looking: a hidden tab holds the weather where it stood, and coming back to it carries on from there.
The map arrives under weather too: the whole world lies under fog for the moment before the server names your repos, and the fog then pulls off the regions that have one, which says what the map is without a word of interface.

## Entry points

- The map at the URL `guslar` prints. The fog drifts from the moment it is painted, with or without a hunter out; there is nothing to switch on and nothing in `world.json` about it.
- The same map on load, once per page. The fog covers every slot until the world's first broadcast, then leaves the claimed regions over the next second and stays where it lands.

## Steps

- **The fog pulls off your regions, once.** Not driven: `verify open` settles for a second after the map stops being busy before it returns, and a `screenshot` after it needs most of another, so no run can look at the page inside the second this takes. It stays with you. Load the map and watch the first second of it. Every slot is under fog as the map appears, `Bogwater Reach` and `kettle` included: the forest's pines and the town's walls are veiled, and only the dark heart of the forest shows. Then the fog opens from the middle of each of those two regions and draws outwards off them, thinning as it goes, until the region is clear and the fog stands where it stands for the rest of the page's life. The four unclaimed slots never clear. Nothing else moves while it happens: no plaque, no village and no hunter shifts, and the four fog banks keep their own outlines.
- **The fog drifts.** Run `verify open`, then `verify screenshot drift-body-before --clip 203,232,160,120 --zoom 4`, then `verify pause 5000`, then `verify screenshot drift-body-after --clip 203,232,160,120 --zoom 4`. Each is a 640x480 close-up of the middle of the ruins fog bank, the same patch of the page in both. Open the two and compare them: the hatching is not where it was. The strokes and the soft grey shading behind them have travelled, roughly a tenth of the crop's width, and they have not travelled as one piece. The pattern is rearranged rather than slid across, because two layers of cloud move over each other at speeds and headings of their own.
- **The fog's rim stays where it is.** Run `verify screenshot drift-rim-before --clip 386,361,160,120 --zoom 4`, then `verify pause 5000`, then `verify screenshot drift-rim-after --clip 386,361,160,120 --zoom 4`. The crop straddles the right edge of the ruins bank, where it thins away into the clear meadow. In both, the fog gives way to the map at the same place and over the same band, and the inked edge of the meadow shows through the thinning rim in the same line; only the hatching inside the fog has moved. Nothing that stands on the fogged region shows through.
- **A glance shows nothing.** Run `verify screenshot glance-before`, then `verify pause 500`, then `verify screenshot glance-after`. Both are 1440x900 of the whole map. Open them and look for a difference: at this size half a second of drift is about two pixels, and the two files read as the same picture.
- **A dropped server does not do it again.** Not driven, for the same reason as the step above: a reveal is over before a run can look. With the map open, run `verify server-stop`, `verify wait-for "Reconnecting"`, `verify server-start` and `verify wait-for "Reconnecting" --gone`, which puts the server back and brings the world with it, and watch the page yourself as the notice goes. Nothing happens to the fog: `Bogwater Reach` and `kettle` stay clear, the four banks stay where they are, and the only thing that changes is the notice leaving. The reveal belongs to the page's load, not to the world arriving, so every world after the first lands on a map whose fog has already settled.
- **The weather waits while you look away.** Not driven: no command here can hide a page, so this one stays with you. Watch the fog for a few seconds, note where a stroke of hatching sits, then switch to another tab or another window and leave Guslar hidden for a minute or two. Come back to it: the cloud is where you left it, a few seconds of drift on from the frame you last saw and not a minute on, and it picks up from there rather than jumping to catch up. Nothing else on the map has jumped either: a hunter part-way through its ride is where it was, and rides the rest of it from there.

## Behind it

- **The weather is the page's own.** Run `verify world` and `verify http /api/world`. Neither says anything about weather: the drift is not in the broadcast, not in `world.json` and not kept anywhere, so it takes nothing from the server and there is nothing to configure.

## Gotchas

- Take the pair with the pause between them, never two screenshots in a row: the drift is deliberately slower than a glance, and without the pause the two crops are the same picture.
- Judge the drift from a `--zoom 4` crop, not from the wide shot. Five seconds moves the cloud about twenty pixels at 1440x900, which is hard to see between two files and easy at four times the size.
- `--clip` is in page pixels, so the coordinates above hold at 1440x900 and nowhere else. Take these crops before any step that changes the viewport with `--size`.
- Judge the wait by where the cloud is, not by whether it is moving. It is moving either way a moment after you look back, and the whole of what this shows is that it did not run on without you.
- The drift moves the cloud inside the fog, never the fog's shape. Fog that has crept over a claimed region, or a rim in a new place, is not slow weather: it is the mask, and it fails this feature rather than [Open the world](./open-the-world.md).
- Do not try to catch the reveal with a screenshot. `verify open` waits a second after the map stops being busy before it returns and a `screenshot` needs most of another, so by the first frame a run can take, the fog has been where it stays for over a second. Both reveal steps are watched by a person, on a page they loaded themselves.
- Every step below the reveal assumes the fog has settled. Run `verify open` first and take the reveal steps, if you are taking them, before anything else touches the page.
