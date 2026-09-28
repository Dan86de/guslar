# The weather

The fog is weather, not a still picture. Two layers of cloud drift slowly behind the fog's outline, so a map with no hunter riding still has something moving in it, and the movement is slow enough that it never competes with a hunter for your eye. It only blows while you are looking: a hidden tab holds the weather where it stood, and coming back to it carries on from there.

## Entry points

- The map at the URL `guslar` prints. The fog drifts from the moment it is painted, with or without a hunter out; there is nothing to switch on and nothing in `world.json` about it.

## Steps

- **The fog drifts.** Run `verify open`, then `verify screenshot drift-body-before --clip 203,232,160,120 --zoom 4`, then `verify pause 5000`, then `verify screenshot drift-body-after --clip 203,232,160,120 --zoom 4`. Each is a 640x480 close-up of the middle of the ruins fog bank, the same patch of the page in both. Open the two and compare them: the hatching is not where it was. The strokes and the soft grey shading behind them have travelled, roughly a tenth of the crop's width, and they have not travelled as one piece. The pattern is rearranged rather than slid across, because two layers of cloud move over each other at speeds and headings of their own.
- **The fog's rim stays where it is.** Run `verify screenshot drift-rim-before --clip 386,361,160,120 --zoom 4`, then `verify pause 5000`, then `verify screenshot drift-rim-after --clip 386,361,160,120 --zoom 4`. The crop straddles the right edge of the ruins bank, where it thins away into the clear meadow. In both, the fog gives way to the map at the same place and over the same band, and the inked edge of the meadow shows through the thinning rim in the same line; only the hatching inside the fog has moved. Nothing that stands on the fogged region shows through.
- **A glance shows nothing.** Run `verify screenshot glance-before`, then `verify pause 500`, then `verify screenshot glance-after`. Both are 1440x900 of the whole map. Open them and look for a difference: at this size half a second of drift is about two pixels, and the two files read as the same picture.
- **The weather waits while you look away.** Not driven: no command here can hide a page, so this one stays with you. Watch the fog for a few seconds, note where a stroke of hatching sits, then switch to another tab or another window and leave Guslar hidden for a minute or two. Come back to it: the cloud is where you left it, a few seconds of drift on from the frame you last saw and not a minute on, and it picks up from there rather than jumping to catch up. Nothing else on the map has jumped either: a hunter part-way through its ride is where it was, and rides the rest of it from there.

## Behind it

- **The weather is the page's own.** Run `verify world` and `verify http /api/world`. Neither says anything about weather: the drift is not in the broadcast, not in `world.json` and not kept anywhere, so it takes nothing from the server and there is nothing to configure.

## Gotchas

- Take the pair with the pause between them, never two screenshots in a row: the drift is deliberately slower than a glance, and without the pause the two crops are the same picture.
- Judge the drift from a `--zoom 4` crop, not from the wide shot. Five seconds moves the cloud about twenty pixels at 1440x900, which is hard to see between two files and easy at four times the size.
- `--clip` is in page pixels, so the coordinates above hold at 1440x900 and nowhere else. Take these crops before any step that changes the viewport with `--size`.
- Judge the wait by where the cloud is, not by whether it is moving. It is moving either way a moment after you look back, and the whole of what this shows is that it did not run on without you.
- The drift moves the cloud inside the fog, never the fog's shape. Fog that has crept over a claimed region, or a rim in a new place, is not slow weather: it is the mask, and it fails this feature rather than [Open the world](./open-the-world.md).
