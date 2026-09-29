# Vaillant style bible

Forked from [Guslar's](style-bible.md).
Same method, same line, same camera; a different world, palette and kit.
Every generation prompt pins this file's PALETTE, LINE, LIGHT and CONSTRAINTS blocks, plus at most one reference image.
Change the bible, regenerate the kit.

## World in one line

A painted adventure map of Vaillant country in deep winter: six offices on snowy ground, housing with heat pumps humming beside it, a teal service van on the roads, a hare who fixes things.

## PALETTE (hex, use these words in prompts)

- Snow `#EEF1F0`: ground, roofs under snow, UI paper, prop backgrounds
- Slate `#4B545C`: roofs, rock, stone, steel, ink shadow
- Cold blue `#8FA7B5`: shadows on snow, ice, water, distance, frost
- Pine `#3F5247`: conifers, hedges, the Bergisches woods
- Brick `#9A5B45`: house plinths, chimneys, old walls, the warm counterweight
- Vaillant teal `#00917E`: the only accent. Heat-pump trim, the van, the hare's flannel, board pins, the work-order clip.

Warm window light `#E8B060` is light, not paint: it appears only as the glow in a window of a house whose heat pump runs.
Red appears on one object only, the fault light, as rust red did on Guslar's flare.
No other saturated colour. No purple, no neon, no gold.

Teal was sampled from `references/vaillant/logo-head.png` (`#00907C`, rounded to the brand's `#00917E`).

## LINE

Unchanged from Guslar.
Ink outlines, brown-black, slightly broken like a dip pen.
Painted gouache fills inside the lines, visible brush texture.
Cartographic hatching for slopes, snow shadow and frost, never gradients.

## LIGHT

Cold overcast winter day, low sun from the top-left, long pale-blue shadows on snow.
Mist and fine snow haze in the valleys.
The one warm light: windows glowing amber in houses whose heat pump is running.
No rim light, no lens effects, no glow anywhere but those windows.

## CAMERA

Unchanged from Guslar.
Map assets: top-down oblique, about 60°, the HoMM adventure-map angle.
Characters and props: three-quarter view, isolated on a flat background.

## CONSTRAINTS (paste verbatim)

No text, no letters, no numbers, no logos, no watermarks: leave displays, signs, van sides and papers blank. No photorealism. No 3D render look. Modern objects are allowed and expected: heat pumps, vans, pipes, tools. The hare is the only brand mark and appears only when the subject names it. Single subject per image unless the prompt says map.

## References

The Vaillant references are in `art/references/vaillant/`.
Attach at most **one** to any generation, as Guslar's lessons prescribe.

- `world-map.png` (Guslar's, in `art/`) for the Vaillant map: it is the layout to keep.
- `campaign-hare-figure.png`: `campaign-hare.png` cropped to the hare alone, before the egg logo that overlaps his arm, so the model has less logo to copy. It produced `ref-hare.png`.
- `ref-hare.png`: the hare painted in the bible's style, leaning on the teal van (from Downloads `6f9be3fd-….png`). The only reference for all four hare poses, the way Guslar's `ref-hunter.png` anchors its hunter. Identity carriers: tan fur, long upright ears with pink insides, amber eyes, teal-and-grey check flannel open over a light grey tee, baggy grey cargo trousers, white sneakers, brown leather tool belt; the van is a boxy high-roof teal van with a blank grille oval and blank plates.
- `logo-head.png` for nothing generated: the favicon is traced from it by hand, not painted.
- `campaign-hare-watermarked.png`: never attach. The model copies watermarks.
- `office-map.webp`: never attach. It is background for which office sits where.

## Prompt method

Unchanged from Guslar (after Amir Mušić's smart prompts).

- `[ASSET]` on the first line, then one role line naming a specific reference universe, not a mood.
- CAPS section headers with the intent in parentheses.
- Every constraint says what is forbidden **and what to do instead**.
- Line quality gets its own paragraph.
- Background pinned to one hex.
- Keep it short. Cut before adding.

---

## Master prompt (Nano Banana Pro)

Fill `[ASSET]` and `[BACKGROUND]`. Keep everything else fixed.

```
[ASSET].
Act as the lead concept artist for a painted, turn-based strategy game in the tradition of Heroes of Might and Magic III adventure maps, set in a snowy modern Europe of heat pumps and service vans.

COMPOSITION (SINGLE SUBJECT, CLEAN SILHOUETTE):
Only the subject described above, centred, with generous empty space around it. No scene, no props, no extra figures unless the subject line names them.

VISUAL STYLE (INKED GOUACHE MAP PAINTING):
Hand-painted board-game illustration, deep winter, overcast. Gouache fills with visible brush texture. Slopes, snow shadow and frost drawn as pen cross-hatching, never as gradients or airbrush.

LINEWORK (THE CARTOGRAPHER'S PEN):
Brown-black ink outlines from a dip pen: slightly broken, varying in thickness. Thick contour on the outer silhouette, thin sharp lines for interior detail. Confident and quick, not shaky.

COLOR (WINTER WITH ONE TEAL ACCENT):
Snow white, slate grey, cold pale blue, dark pine green, brick red-brown. Vaillant teal #00917E appears only on the objects the subject names. No other saturated colour, no purple, no neon, no gold.

LIGHT (COLD OVERCAST, LOW SUN):
Soft low light from top-left, long pale-blue shadows on snow, fine haze in low ground. The only warm light is amber window glow, and only if the subject names it. No rim light, no lens effects.

CRITICAL CONSTRAINTS:
No text, letters, numbers or logos anywhere, including on water, snow and ground: leave displays, signs, van sides and papers blank. No photorealism and no 3D render: keep it flat painted. Modern objects are fine; draw them with the same pen and gouache as everything else.

BACKGROUND:
[BACKGROUND]
```

`[BACKGROUND]` is one of:

- `Flat bone parchment, #D9CBA8, no texture, reaching every edge.` (heat pumps: `cutout.ts` flood-fills the border colour away, and a snowy plate on a snow-white background would be cut away with it)
- `Flat snow paper, #EEF1F0, no texture.` (board, card)
- `Pure white, #FFFFFF, for cut-out.` (hare, fault light: remove in post)
- `Full-bleed painted map to the edges, no border, no margin.` (world map)
- `Cool frost paper, #E3EAEE, seamless-tileable ink hatching only.` (frost: a cooler tint than the map's snow, so a frosted slot reads as veiled)

## The Vaillant kit: `[ASSET]` and `[FORMAT]` per image

Filenames mirror Guslar's so the theme swaps images one for one.
Formats match Guslar's delivered sizes, so the code needs no new geometry for any sprite.

| # | File | Replaces | [ASSET] | [FORMAT] | Reference |
|---|---|---|---|---|---|
| 1 | `world-map.png` | `world-map.png` | see "The map prompt" below | same aspect as the reference; web copy exactly 2752×1536 | Guslar `art/world-map.png` |
| 2 | `frost.png` | `fog.png` | a seamless tileable winter frost texture: short clusters of fine parallel pen hatching in slate blue-grey ink, each cluster a handful of quick straight strokes, the clusters turned at many different angles and scattered evenly across the whole sheet; between them, soft pale icy-blue gouache washes like breath on cold glass; here and there a few tiny six-pointed rime crystals. Uniform density, no focal point, not symmetrical, no long sweeping arcs, no ink splatters. Swap COMPOSITION for TEXTURE ONLY, LIGHT for FLAT, and COLOR for cold with no accent, as the map swaps COMPOSITION. | 2048×2048, tileable | none |
| 3 | `heatpump-delivered.png` | `village-bounty.png` | a small snowy family cottage (white-rendered wall, brick plinth, snowy slate roof, dark cold windows) and in front of it, as the hero, a large modern air-source heat pump outdoor unit: light grey box, one big round fan grille on its front face, thin teal trim line along its top edge, on a small concrete pad, brand new and not yet connected, cardboard protectors on its four corners and a strap around it, untouched snow; on an oval ground plate of trodden snow with an inked rim; heat pump big and front-centre, cottage small behind. It must read at 195 px wide, the most a village is drawn. | 1024×1024, bone background | none |
| 4 | `heatpump-installing.png` | `village-contracts.png` | The same cottage, heat pump and plate as the reference image, identical cottage, heat pump, camera and plate, now with: the heat pump's front panel off and leaning against its side, copper pipes and black hoses running from it into the cottage wall, an open toolbox and a coil of cable in the snow, footprints around it | 1024×1024, bone background | #3 |
| 5 | `heatpump-running.png` | `village-cleared.png` | The same cottage, heat pump and plate as the reference image, identical cottage, heat pump, camera and plate, now with: insulated pipes running neatly from the heat pump into the cottage wall, its fan a soft blur, a faint plume of white vapour above it, every cottage window glowing warm amber, a shovelled path to the door | 1024×1024, bone background | #3 |
| 6 | `hare-driving.png` | `hunter-riding.png` | a tall anthropomorphic hare as in the reference image, tan fur, long upright ears, teal check flannel shirt over a white tee, grey cargo trousers, white sneakers, a tool belt, driving a small compact teal service van seen three-quarter from the front and above, its arm on the open window, van sides blank | 512×768, white for cut-out | `campaign-hare.png` |
| 7 | `hare-working.png` | `hunter-hunting.png` | The same hare as the reference image, identical fur, ears, teal check flannel, white tee, grey cargo trousers, white sneakers and tool belt, now on foot, kneeling in snow with a spanner raised to an unseen unit, an open toolbox beside him, intent | 512×768, white for cut-out | #6 |
| 8 | `hare-fault.png` | `hunter-wounded.png` | The same hare as the reference image, identical fur, ears, teal check flannel, white tee, grey cargo trousers, white sneakers and tool belt, now on foot, ears drooping, fur singed grey at the cuffs and one ear tip, a wisp of smoke, carrying a small blank control display in one paw, head down | 512×768, white for cut-out | #6 |
| 9 | `hare-commissioned.png` | `hunter-trophy.png` | The same hare as the reference image, identical fur, ears, teal check flannel, white tee, grey cargo trousers, white sneakers and tool belt, now at the wheel of the same teal van, one paw raised holding a signed sheet of paper with a teal clip, blank of any writing | 512×768, white for cut-out | #6 |
| 10 | `job-board.png` | `notice-board.png` | an empty cork pinboard in a plain pale ash-wood frame, wall-mounted, straight-on, portrait; flat battens about 1/12 of the board's width on every side, small screws at the corners; flat even empty light-cork field with fine stipple; four small teal push pins in its corners; a light dusting of snow on the top edge | 1024×1536, white background, then cut out to a transparent PNG (a CSS background: no runtime cutout) | none |
| 11 | `work-order.png` | `contract-card.png` | a single blank off-white work-order sheet, portrait, straight-on, filling the picture edge to edge at three-quarters as wide as tall (CSS stretches it into 765:1024); a small teal clipboard clip at the top centre; completely empty middle, one corner slightly curled, a faint crease; one flat round teal sticker with a thin darker ring, centred 3/4 across and 4/5 down, about 1/5 of the sheet's width across, where `.card-seal` crops it (window centred 74.5%, 79.6%, ~19.6% wide); a thin ink outline all around the sheet for the cutout; no lines, boxes or tables | 765×1024, bone background, cut out by flood fill | none |
| 12 | `fault-light.png` | `awaiting-flare.png` | a small red warning beacon lamp on a short post planted in snow, lit, the only saturated object | 256×512, white for cut-out | none |

### Settings

Guslar's originals show the settings that worked: Nano Banana Pro at 4K, one aspect ratio per format, defaults for everything else.

| Asset | Aspect ratio | Resolution | Original | Web copy |
|---|---|---|---|---|
| 1 map | 16:9 | 4K | 5504×3072 | 2752×1536, exactly half |
| 2 frost | 1:1 | 4K | 4096×4096 | 2048×2048 |
| 3 to 5 heat pumps | 1:1 | 4K | 4096×4096 | 1024×1024 |
| 6 to 9 hare | 2:3 | 4K | as generated | 515×768, transparent |
| 10 job board | 2:3 | 4K | as generated | 1024×1536 |
| 11 work order | 3:4 | 4K | as generated | 768×1024 |
| 12 fault light | 9:16 | 4K | as generated | 288×512 |

One reference at most, a fresh generation per run, no chat follow-up edits.
Originals go in `art/source/vaillant/`, web copies in the theme's art folder.

Generation order: 1, 2 first (S6 needs them). Then 3 to 5, 10, 11 (S7). Then 6 to 9, 12 (S8).

The favicon is not in the kit.
It is the logo head in its teal egg, traced by hand to SVG from `references/vaillant/logo-head.png`.

### The map prompt

`[ASSET]` for #1, with Guslar's `art/world-map.png` attached as the only reference.
For the map, replace the master prompt's COMPOSITION block with `COMPOSITION (FULL MAP):` and `The whole map as in the reference image, edge to edge.`, because a single-subject composition fights a map.

```
Keep only the layout of the reference image: the same six region footprints in the same places and sizes, the same river, roads, bridges, central meadow and double ring border. Replace everything inside each region with the city named here, drawn as its best-known landmarks, under deep winter snow. Top-left: Istanbul, the great domes and slender minarets of Hagia Sophia and the Blue Mosque, the round Galata Tower, a stretch of old Theodosian city wall. Top-centre: Remscheid, snowy pine woods on rolling hills, the tall steel arch of the Müngsten railway bridge spanning a wooded valley, a low modern office building with a teal roof edge. Top-right: Amsterdam, a ring of frozen canals with narrow tall gabled canal houses, small arched canal bridges, moored houseboats. Bottom-left: Katowice, the flying-saucer-shaped Spodek arena, red-brick worker houses of Nikiszowiec, two steel mine winding towers. Bottom-centre: Lyon, an open city spread along wide stone quays where a second river flows in from the left and joins the main river; on a steep hill on the left bank the white Basilica of Fourvière with its four towers and the thin metal Fourvière tower beside it; below the hill, rows of tall narrow old-town houses with terracotta roofs lining both quays right up to the edge of the region, and wide stone bridges across both rivers. Bottom-right: Dietikon, snowy Swiss Alpine peaks, wooden chalets and a church with a slender spire in the valley below, a small river. A few small heat-pump units beside houses, a few amber windows. Every building, van and sign is blank: no lettering, no logos. The land beyond the ring border is frozen and hazy.
```

## Consistency rules

- Generate the world map first, with Guslar's map attached, until the six regions, the river and the ring border sit where the reference has them. Lay the output over Guslar's map at 50% to check. That run becomes the only Vaillant map reference.
- If the regions drift off their footprints after a handful of runs, keep the best run and re-measure the slot geometry on it: the decision is regenerate first, then per-theme geometry, never retouching.
- Heat pumps 4 and 5: attach heat pump 3 only, and start `[ASSET]` with "The same house and plate as the reference image, identical house, camera and plate, now with…".
- Hare 7 to 9: attach hare 6 only, and start `[ASSET]` with "The same hare as the reference image, identical…", naming every identity carrier.
- Board, card, fault light and frost: no reference attached.
- Reject any image with text, numbers, a logo other than the hare, glow outside amber windows, gradient shading, or saturated colour outside teal and the fault light's red. Regenerate, do not retouch.
- If a run drifts, shorten the `[ASSET]` line before touching the fixed blocks.

## Guslar's lessons that apply here

- "denser toward the edges" plus "tileable" produced a vignette. Keep tiles uniform; edge darkening is the renderer's job.
- Forbid symmetry explicitly, or the model mirrors the texture.
- "no long sweeping arcs, no ink splatters" gets hatching instead of calligraphy.
- Figures chain when the prompt names the identity carriers, not just "the same hunter".
- Removals are weaker than additions: describe each new state as additions. That is why heat pump 3 is the crated one and the later states add to it.

## Kit status

| # | File | Status | Notes for code |
|---|---|---|---|
| 1 | `world-map.png` | done 2026-09-29: run 9, original saved as `art/source/vaillant/world-map.png` (5504×3072, from Downloads `9ec0689e-….png`), web copy `art/vaillant/world-map.png` (2752×1536, lanczos half) | Chain: Guslar map, then run 4 (layout-only prompt, landmarks), then run 7 (+KTW), then run 9 (+Grossmünster in Dietikon). Needs the 4K original. Two tiny pseudo-lettered spots survive from run 7, on the lower front of the Istanbul mosque and two Lyon right-bank rooftops: accepted as is by Daniel, the one known exception to the no-text rule, since both are about 10 px at display size. River forks into a Y at the bottom, inside Lyon's slot. Web copy must be exactly 2752×1536, the space `geometry.ts` lives in. Original in `art/source/vaillant/`. |
| 2 | `frost.png` | done 2026-09-29: run 1, original `art/source/vaillant/frost.png` (4096², from Downloads `58120a0e-….png`), web copy `art/vaillant/frost.png` | The model painted the sheet as a 2×2 repeat of one tile (period exactly 2048 px on both axes), so the web copy is one native-resolution quarter, cropped at 1024,1024: truly seamless, unlike Guslar's fog, so plain repeat works. Its strokes are about twice Guslar's fog's relative to the tile: tune the render scale and opacity on the live map. Paper `#E3EAEE` veils a slot clearly against the white map. Two tiny snowflakes per tile, accepted. |
| 3 | `heatpump-delivered.png` | done (web copy pre-cut to transparent) 2026-09-29: run 2, original `art/source/vaillant/heatpump-delivered.png` (4096², from Downloads `70dd79a3-….jpg`, decoded to PNG), web copy `art/vaillant/heatpump-delivered.png` (1024²) | The only reference for 4 and 5. Cuts out cleanly from bone; the plate's hatched edge survives as a fine ink fringe, like Guslar's villages. One faint pencil-like mark in the left shadow, about 2 px at map size: accepted, and inherited by 4 and 5. |
| 4 | `heatpump-installing.png` | done 2026-09-29: run 1, original `art/source/vaillant/heatpump-installing.png` (4096², from Downloads `66251131-….png`), web copy `art/vaillant/heatpump-installing.png` (1024²) | Chained from 3 by additions only: diff against 3 lights up only the added pipes, open front, leaning panel, toolbox, cable and footprints; cottage, unit body and patch are pixel-identical, so the stage swaps in place. |
| 5 | `heatpump-running.png` | done 2026-09-29: run 2, original `art/source/vaillant/heatpump-running.png` (4096², from Downloads `fe776a73-….png`), web copy `art/vaillant/heatpump-running.png` (1024²) | Chained from 3. Dark slate path and a casing pinned to 3's grey keep the cutout from bleeding (casing fully opaque). The cardboard corner protectors survived "bare metal where the protectors were": accepted, a few pixels at map size. |
| 6 | `hare-driving.png` | done 2026-09-29: run 2, original `art/source/vaillant/hare-driving.png` (3392×5056, white background, from Downloads `debd5a19-….png`), web copy `art/vaillant/hare-driving.png` (515×768, transparent, like Guslar's hunters) | Chained from `ref-hare.png`. At the wheel, head, ears and one arm out of the window, snow spray off the front wheel. Reads at hunter size (about 156 map px, 0.8 of a village) facing either way. Cut out with `art/cutout.py` on white (near 8, far 30); the palest spray fades out, as it should. |
| 7 | `hare-working.png` | done 2026-09-29: run 1, original `art/source/vaillant/hare-working.png` (from Downloads `d13e11bf-….png`), web copy `art/vaillant/hare-working.png` (515×768, transparent) | Chained from `ref-hare.png`. Kneeling, facing right, spanner raised at a unit outside the picture (the map puts the heat pump beside him), paw on a red-brown toolbox. The faint snow patch mostly fades in the cutout. |
| 8 | `hare-fault.png` | done 2026-09-29: run 2, original `art/source/vaillant/hare-fault.png` (from Downloads `7b5a822d-….png`), web copy `art/vaillant/hare-fault.png` (515×768, transparent) | Chained from `hare-working.png`, not `ref-hare.png`, so no ghost van. Walking right, drooping singed ears, soot, a smoke wisp, a blank control box under one arm, free paw empty. No red. |
| 9 | `hare-commissioned.png` | done 2026-09-29: run 1, original `art/source/vaillant/hare-commissioned.png` (from Downloads `3f0dba7b-….png`), web copy `art/vaillant/hare-commissioned.png` (515×768, transparent) | Chained from `hare-driving.png` by one addition: a grin and a blank sheet with a teal clip held up out of the window. The white sheet survives the white-background cut because it is painted over the van. |
| 10 | `job-board.png` | done 2026-09-29: run 2, original `art/source/vaillant/job-board.png` (3392×5056, white background, from Downloads `b93022fa-….png`), web copy `art/vaillant/job-board.png` (1030×1536, transparent) | The CSS fixes the board box at 1030:1536 and places the title at 20.6% down and the card field at 14.6–85.4% across, 29.8–90.4% down. The board (0.649 wide to tall) is cropped to its ink outline, scaled to 85% of the box height, placed 11.25% from the top and centred: the title lands on the header panel and the card field on the cork. Cut out by flood fill from the white border with a tight band (near 8, far 30) that stops at the ink outline and keeps the white snow. |
| 11 | `work-order.png` | done 2026-09-29: run 3, original `art/source/vaillant/work-order.png` (3584×4800, bone background, from Downloads `926dd6c4-….png`), web copy `art/vaillant/work-order.png` (765×1024, transparent) | Cropped to its outline (clip handle included, 0.667 wide to tall), scaled to the full 1024 height and centred with 40 px side margins, cut out by flood fill from the bone border (near 22, far 70). The sticker's centre lands at 74.0%, 79.2% against the seal window's 74.5%, 79.6%, so `.card-seal` crops a clean all-teal disc and stamps it over the clip with no CSS change. The sticker is larger than the window, so the stamp shows its flat middle without the outer ring. |
| 12 | `fault-light.png` | done 2026-09-29: run 1, original `art/source/vaillant/fault-light.png` (3072×5504, from Downloads `c4873ad3-….png`), web copy `art/vaillant/fault-light.png` (286×512, transparent, Guslar's flare size) | A red beacon dome with painted rays on a slate post in a snow mound. No white halo: a halo is invisible on snow, so a thick ink contour carries it. The separate rays survive the cut, being far from white. |

## Lessons from generating

- Map run 1: the layout held almost perfectly against Guslar's map at 50% overlay, but "the same winding towers" and "the same ring wall" made it Guslar in snow, and it lettered "Vaillant" on the office and vans. Ask for the layout only, name each city's landmarks, and say every building and van is blank.
- Map run 2 (layout only, landmarks named): footprints held again, and Istanbul, Remscheid, Amsterdam, Katowice and Dietikon read as themselves. Lyon kept Guslar's ring wall despite "no town wall", because the wall is the reference's strongest shape and removals are weak. A "96" glyph appeared on the river. Describe Lyon as additions that fill the footprint (open quays, a joining river, houses to the region's edge) and ban text on water and ground too.
- Map runs 3 to 5 (HQ campus, hare tracks, egg pond, KTW and the Lyon rewrite added at once): each extra addition cost layout. Run 3 kept the footprints but grew Lyon's wall back; run 4 finally solved Lyon (Fourvière on its hill, open quays) with a river fork at the bottom and a signature-like scribble; run 5 had a good KTW but lost the ring border and central river and put Fourvière outside the map. Shorten before adding holds for maps too.
- Chaining works for maps: attach the nearly-right run as the only reference and ask only for additions ("The same map as the reference image, identical …, now with: …"). Keep track of which run is the base; two chains went onto run 3 by mistake and brought its walled Lyon back.
- KTW has to be described by shape, since the model does not know it by name: dark blue-grey glass, three stacked blocks shifted sideways, dark crown bands. "White with vertical ribs" gave a generic slab. Pin its height ("no taller than the Galata Tower") and its region ("entirely inside Katowice, never overlapping Istanbul"), or it grows into the neighbouring footprint.
- Map run 7 (run 4 plus KTW): first run passing footprints, all six places and the Vaillant touches.
- Naming a place does not position an addition: the model cannot see our labels. Run 8 put the Grossmünster in Lyon's river fork because the prompt said "on a river bank". Run 9 pinned it by visible neighbours ("next to the small wooden chalets and the white church with the slender spire", "far from the big main river") and landed it right, changing nothing else.
- A chain copies its reference's flaws faithfully: stronger no-text constraints did not remove pseudo-lettering already in the reference. Catch text early, before a run becomes a chain base.
- Frost run 1: asked for "seamless tileable", the model painted a 2×2 repeat of a smaller tile. Measure the period before downscaling: one quarter is a native, truly seamless tile.
- Heat pump run 1: "oval ground plate with an inked rim" gave a thick token-like disc with a side wall, half the sprite, floating on the map. "A small flat oval patch of trodden snow that hugs them closely, with no thickness and no side wall, its edge fading softly with loose hatch strokes" gave a flat patch and a bigger heat pump.
- Heat pump 5 run 1: the cutout flood-fills everything near the background colour that it can reach from the border, and a tan paving path carried it across the snow onto the concrete pad and into a casing that came out warmer grey than in stage 3, erasing the heat pump. Keep every surface that touches the plate's edge far from the background colour, pin reused colours to the reference ("the same cool light grey as in the reference image"), and test each stage with the cutout before accepting it.
- Job board run 1: a square-ish board with cork to the top would squash sideways in the CSS's fixed 1030:1536 box and leave the title nowhere to sit. Name the proportions ("two-thirds as wide as it is tall"), ask for a deep empty header rail, and place the result in the box with margins rather than changing CSS.
- Work order runs 1 to 3: the model placed and sized the sticker differently every run (24% wide at 75.9% down, then 14.6% at 89.4%, then 30.7% at 79.2%), whatever the prompt said. Measure every run against the crop window rather than trusting the prompt, and use the fitting step (crop, scale to height, centre) to absorb what is left.
- Hare run 1: the pose leaked from the reference. Asked to drive, the hare leaned on a parked van, crossed legs and all, because the campaign photo shows him leaning. The likeness was so good it became the identity reference `ref-hare.png`, and every pose chains from it instead.
- Hare 8 run 1: chained from `ref-hare.png` with "No van", the model half-erased the van and left a ghost door panel beside his arm, overlapping the cuff. For a pose without the van, chain from a pose that never had it (`hare-working.png`) and leave the van out of the prompt entirely.
- All sprites ship pre-cut to transparent PNGs, made from the originals with `art/cutout.py` (villages and heat pumps on bone: near 22, far 70; figures on white: near 8, far 30, `global` where mist or gaps enclose white). `cutout.ts` keeps an already-transparent image as is, so this needs no code change and cuts are reproducible. Guslar's hunters, board, card and villages were re-cut the same way on 2026-09-29; the flare keeps its hand cut, because its white halo is deliberate.

**Kit complete: 12 of 12, 2026-09-29.** Web copies in `art/vaillant/`, originals in `art/source/vaillant/`, references in `art/references/vaillant/`.
