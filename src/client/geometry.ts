import type { RegionSlot } from "../shared/world.js"

/** Size of art/world-map.png, the space every coordinate below lives in. */
export const MAP_SIZE = { width: 2752, height: 1536 } as const

export type Ellipse = { x: number; y: number; rx: number; ry: number }

/** Each painted region on the world map, as the ellipse fog covers when the slot is empty. */
export const SLOT_AREAS: Record<RegionSlot, Ellipse> = {
  ruins: { x: 680, y: 480, rx: 430, ry: 320 },
  forest: { x: 1400, y: 270, rx: 430, ry: 285 },
  marsh: { x: 2060, y: 450, rx: 390, ry: 290 },
  mines: { x: 680, y: 990, rx: 420, ry: 320 },
  "river-town": { x: 1395, y: 1185, rx: 460, ry: 300 },
  mountains: { x: 2100, y: 950, rx: 420, ry: 350 },
}

/**
 * The ellipse wiped clear of neighbouring fog when a slot has a repo. It is the
 * fog area unless the fog must reach wider than the painted region: the forest's
 * cloud has to cover its tallest pines, but clearing that wide would uncover the
 * ruins' eastern wall.
 */
export function clearArea(slot: RegionSlot): Ellipse {
  return slot === "forest" ? { x: 1400, y: 280, rx: 390, ry: 270 } : SLOT_AREAS[slot]
}

/** Where a region's name plaque hangs: above the middle of its area. */
export function labelAnchor(slot: RegionSlot): { x: number; y: number } {
  const area = SLOT_AREAS[slot]
  return { x: area.x, y: area.y - area.ry * 0.55 }
}

/** The part of the map that must stay on screen: every region, plus a little margin. */
const MUST_SHOW = { left: 250, top: 0, right: 2600, bottom: 1500 }

export type View = { scale: number; x: number; y: number }

/**
 * Fills the viewport with the map like `background-size: cover`, but zooms out
 * far enough that no region is ever cropped on tall or narrow screens.
 */
export function fitMap(width: number, height: number): View {
  const cover = Math.max(width / MAP_SIZE.width, height / MAP_SIZE.height)
  const keepRegions = Math.min(
    width / (MUST_SHOW.right - MUST_SHOW.left),
    height / (MUST_SHOW.bottom - MUST_SHOW.top),
  )
  const scale = Math.min(cover, keepRegions)
  const centreX = (MUST_SHOW.left + MUST_SHOW.right) / 2
  const centreY = (MUST_SHOW.top + MUST_SHOW.bottom) / 2
  return { scale, x: width / 2 - centreX * scale, y: height / 2 - centreY * scale }
}

/** Where a village sits, in map pixels: the centre of its art, and the art's width. */
export type VillageSpot = { x: number; y: number; width: number }

/** The widest a village is drawn, in map pixels, when its region has room. */
const VILLAGE_WIDTH = 195

/** How much of its share of the region a village's art fills, so it stands as a hamlet, not a town. */
const VILLAGE_FILL = 2 / 3

/**
 * Lays a region's villages out in rows of up to three, below its plaque. Each village gets
 * an equal share of the painted region, shrinking as there are more so they all stay inside
 * it, and stands at the centre of its share, drawn smaller than it so neighbours and their
 * names keep a gap. `aspect` is the village art's height over its width; each share keeps
 * room below the art for the village's own name.
 */
export function villageSpots(slot: RegionSlot, count: number, aspect: number): VillageSpot[] {
  if (count === 0) return []
  const area = SLOT_AREAS[slot]
  const cols = Math.min(count, 3)
  const rows = Math.ceil(count / cols)
  const pitchX = 1.15
  const pitchY = aspect + 0.3
  const share = Math.min((area.rx * 1.5) / (cols * pitchX), (area.ry * 1.25) / (rows * pitchY))
  const width = Math.min(VILLAGE_WIDTH, share * VILLAGE_FILL)
  const centreY = area.y + area.ry * 0.2
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols)
    const inRow = Math.min(cols, count - row * cols)
    const col = index - row * cols
    return {
      x: area.x + (col - (inRow - 1) / 2) * share * pitchX,
      y: centreY + (row - (rows - 1) / 2) * share * pitchY,
      width,
    }
  })
}

/** Where a hunter stands, in map pixels: the point under its feet. */
export type Footing = { x: number; y: number }

/**
 * Where a village's hunter stands, and how tall it is drawn, from the village's spot and its
 * art's aspect: `home` at the village's right edge, where it comes back to, and `field` out to
 * the right of it, where it hunts. Both stay inside the village's share of the region, clear
 * of the next village in its row and of the village's own name under it.
 */
export function hunterGround(spot: VillageSpot, aspect: number): { home: Footing; field: Footing; height: number } {
  const height = spot.width * aspect
  return {
    home: { x: spot.x + spot.width * 0.74, y: spot.y + height * 0.42 },
    field: { x: spot.x + spot.width * 0.93, y: spot.y + height * 0.2 },
    height: height * 0.8,
  }
}
