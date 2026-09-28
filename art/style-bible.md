# Guslar style bible

Every generation prompt pins this file's PALETTE, LINE, LIGHT and CONSTRAINTS blocks, plus the three reference images in `art/references/`. Change the bible, regenerate the kit.

## World in one line

A painted adventure map of a Slavic borderland at the end of autumn: bog, black forest, iron hills, a river town — Witcher-inspired, folklore-rooted, no Witcher IP.

## PALETTE (hex, use these words in prompts)

- Moss green `#4A5A3C` — forest, lowland
- Bog brown `#5C4A32` — marsh, roads, mud
- Iron grey `#4D5359` — mountains, stone, steel
- Bone `#D9CBA8` — parchment, fog highlights, UI paper
- Rust red `#8A3B2A` — the only accent: blood, wax seals, contract ribbons, hunter state markers
- Mist blue `#7C8B94` — distance, fog shadows, water

No saturated colours. No purple, no neon, no gold except dull brass.

## LINE

Ink outlines, brown-black, slightly broken like a dip pen. Painted gouache fills inside the lines, visible brush texture. Cartographic hatching for slopes and fog, never gradients.

## LIGHT

Overcast, low sun from the top-left, long soft shadows. Mist pooling in valleys. No rim light, no glow, no lens effects.

## CAMERA

Map assets: top-down oblique, about 60°, the HoMM adventure-map angle. Characters and props: three-quarter view, isolated on transparent or flat bone background.

## CONSTRAINTS (paste verbatim)

No text, no letters, no logos, no watermarks. No photorealism. No 3D render look. No Witcher characters, medallions, signs, or school symbols. No modern objects. Single subject per image unless the prompt says map.

## References

Put three images in `art/references/` named `ref-map.*`, `ref-figure.*`, `ref-texture.*`. They are for **you** to judge outputs against. Attach at most **one** to any generation: `ref-map` for map assets, `ref-figure` for hunters, none for props. More references made results *less* consistent in Amir Mušić's 8-image Nano Banana Pro test (characters lost, added, changed across 25 runs), and a shorter prompt beat his longer one.

## Prompt method (after Amir Mušić's smart prompts)

- `[VARIABLE]` on the first line, then one role line naming a specific reference universe, not a mood.
- CAPS section headers with the intent in parentheses.
- Every constraint says what is forbidden **and what to do instead**.
- Line quality gets its own paragraph. It is the biggest consistency lever.
- Background pinned to one hex.
- Keep it short. Cut before adding.

---

## Master prompt (Nano Banana Pro)

Fill `[ASSET]` and `[BACKGROUND]`. Keep everything else fixed.

```
[ASSET].
Act as the lead concept artist for a painted, turn-based fantasy strategy game in the tradition of Heroes of Might and Magic III adventure maps, set in Slavic dark folklore.

COMPOSITION (SINGLE SUBJECT, CLEAN SILHOUETTE):
Only the subject described above, centred, with generous empty space around it. No scene, no props, no extra figures unless the subject line names them.

VISUAL STYLE (INKED GOUACHE MAP PAINTING):
Hand-painted board-game illustration, late autumn, overcast. Gouache fills with visible brush texture. Slopes, shadow and fog drawn as pen cross-hatching, never as gradients or airbrush.

LINEWORK (THE CARTOGRAPHER'S PEN):
Brown-black ink outlines from a dip pen: slightly broken, varying in thickness. Thick contour on the outer silhouette, thin sharp lines for interior detail. Confident and quick, not shaky.

COLOR (MUTED SLAVIC AUTUMN):
Moss green, bog brown, iron grey, bone parchment, mist blue. Rust red appears only as one small accent if the subject names it. No saturated colour, no purple, no gold except dull brass.

LIGHT (OVERCAST, LOW SUN):
Soft low light from top-left, long soft shadows, mist pooling in low ground. No rim light, no glow, no lens effects.

CRITICAL CONSTRAINTS:
No text, letters, numbers or logos anywhere: leave parchments and signs blank. No photorealism and no 3D render: keep it flat painted. No Witcher characters, medallions, signs or school symbols: use generic Slavic folk dress and tools.

BACKGROUND:
[BACKGROUND]
```

`[BACKGROUND]` is one of:
- `Flat bone parchment, #D9CBA8, no texture.` (villages, props)
- `Pure white, #FFFFFF, for cut-out.` (hunters, flare: remove in post)
- `Full-bleed painted map to the edges, no border, no margin.` (world map)
- `Bone parchment, #D9CBA8, seamless-tileable ink wash only.` (fog)

## The v1 kit — `[ASSET]` and `[FORMAT]` per image

| # | File | [ASSET] | [FORMAT] |
|---|---|---|---|
| 1 | `world-map.png` | one continuous painted world map, top-down oblique, six distinct regions in a ring: black forest, bog marsh, iron mountains, a walled river town, mine hills with pit-heads, and old stone ruins; dirt roads joining them; a river through the middle; unpainted bone parchment margin | 4096×2304 landscape |
| 2 | `fog.png` | a loose ink-wash and cross-hatching fog texture on bone parchment, denser at the edges, seamless-tileable, no subject | 2048×2048, tileable |
| 3 | `village-bounty.png` | a small wooden Slavic village, three izby with thatched roofs, one notice post with a single blank parchment nailed to it, quiet, smoke from one chimney | 1024×1024, bone background |
| 4 | `village-contracts.png` | the same village with a full notice board of blank parchments, a saddled horse tied nearby, lanterns lit | 1024×1024, bone background |
| 5 | `village-cleared.png` | the same village with the notice board empty, a beast skull hung on the gate post, a small feast fire in the square | 1024×1024, bone background |
| 6 | `hunter-riding.png` | a lone hunter in a worn grey cloak on a dark horse, riding, seen from three-quarter above, no face detail | 512×768, white for cut-out |
| 7 | `hunter-hunting.png` | the same hunter on foot, crouched with a drawn sword, tense, mist around the boots | 512×768, white for cut-out |
| 8 | `hunter-wounded.png` | the same hunter walking the horse by the reins, one arm bandaged in rust-red cloth, head down | 512×768, white for cut-out |
| 9 | `hunter-trophy.png` | the same hunter riding with a wrapped trophy sack tied to the saddle, one hand raised | 512×768, white for cut-out |
| 10 | `notice-board.png` | an empty wooden village notice board on two posts, weathered planks, iron nails, straight-on | 1024×1536, white for cut-out |
| 11 | `contract-card.png` | a single blank aged parchment with torn edges, a rust-red wax seal bottom-right, one nail hole top-centre, straight-on | 768×1024, white for cut-out |
| 12 | `awaiting-flare.png` | a small rust-red cloth pennant on a short stick, planted in mud, fluttering, the only saturated object | 256×512, white for cut-out |

Generation order: 1, 2 first (S1 needs them). Then 3–5, 10, 11 (S2/S3). Then 6–9, 12 (S5).

## Consistency rules

- Generate the world map first, with `ref-map` attached, until one run matches the bible. That run becomes the only map reference.
- Villages 4 and 5: attach village 3 only, and start `[ASSET]` with "The same village as the reference image, now with…".
- Hunters 7–9: attach hunter 6 only, and start `[ASSET]` with "The same hunter as the reference image, now…".
- Props (10, 11, 12) and fog: no reference attached.
- Reject any image with text, glow, gradient shading, or saturated colour outside rust red. Regenerate, do not retouch.
- If a run drifts, shorten the `[ASSET]` line before touching the fixed blocks.

## Kit status

| # | File | Status | Notes for code |
|---|---|---|---|
| 1 | `world-map.png` | done 2026-09-27 | `art/` holds a 2752×1536 web copy; the 5504×3072 original goes in `art/source/` (over the sync limit, saved by hand). Pass two removed all red and moved mines to the left hills only. Whole image runs warmer than `ref-map`: accepted. |
| 2 | `fog.png` | done 2026-09-27 | 2048² web copy, 4096² original in `art/source/`. Not truly seamless: strokes cut at the edge. Render with mirrored repeat or per-region offset under a soft mask, never plain tiling. Strokes are heavy at 1:1; render at ~2× or ~40% opacity. |
| 3 | `village-bounty.png` | done 2026-09-27 | 1024² web copy. Also saved as `references/ref-village.png`: the only reference for villages 4 and 5. Oval ground plate: blend its edge softly onto the terrain. |
| 4 | `village-contracts.png` | done 2026-09-27 | Board with five blank parchments, saddled horse, two lanterns. Lanterns carry a faint brass glow: accepted, helps the state read. Two chimneys smoke, not three. |
| 5 | `village-cleared.png` | done 2026-09-27 | Skull on lintel, ringed fire, logs. Regenerated with the gate post bare: board is empty, everything else identical. |
| 10 | `notice-board.png` | done 2026-09-27 | 1030×1536, white bg to cut out. Wall-mounted, no legs: better for a panel. Card area is the inner rectangle between the side battens, ~8% margin. |
| 11 | `contract-card.png` | done 2026-09-27 | 765×1024, white bg to cut out. Clean centre for text. The seal is the palette's one rust-red accent; a sealed contract can reuse the card with a second seal over the nail. |
| 6 | `hunter-riding.png` | done 2026-09-27 | 515×768, white bg. Also `references/ref-hunter.png`: the only reference for 7–9. Identity carriers: two-tier hooded grey cloak, bone-white pommel, shaggy dark horse. |
| 7 | `hunter-hunting.png` | done 2026-09-27 | On foot, crouched, sword drawn, mist at boots. Flat blade, no highlight. |
| 8 | `hunter-wounded.png` | done 2026-09-27 | Leading the horse, head bowed, rust-red sling is the only red, torn hem. No blood. |
| 9 | `hunter-trophy.png` | done 2026-09-27 | Riding, roped sack behind saddle, open-palm salute. Sack closed. |
| 12 | `awaiting-flare.png` | done 2026-09-27 | 286×512, white bg with a white halo around the silhouette: keep it, it separates the flare from terrain. The one saturated object on the map. |

**Kit complete: 12 of 12, one session, 2026-09-27.** Originals (4K) belong in `art/source/`, saved by hand.

## Lessons from generating

- "denser toward the edges" + "tileable" produced a vignette. Keep tiles uniform; edge darkening is the renderer's job.
- Forbid symmetry explicitly: without it the model mirrored the texture.
- "no long sweeping arcs, no ink splatters" was needed to get hatching instead of calligraphy.
- Figures chain as well as buildings when the prompt names the identity carriers (cloak shape, pommel colour, horse) rather than just "the same hunter".
- Chaining from one reference with "The same village as the reference image, identical …, now with:" held buildings, plate and camera across three states. Removals are weaker than additions: the model kept the reference's parchment when asked for an empty board. Prefer describing the new state as additions.
