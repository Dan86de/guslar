import type { RegionSlot, WorldState } from "../shared/world.js"
import type { Rgb, ThemeArt } from "./art.js"
import { clearArea, MAP_SIZE, SLOT_AREAS, type Ellipse } from "./geometry.js"
import { REGION_SLOTS } from "../shared/world.js"

/**
 * All the fog on the map, on one map-sized canvas. Each empty slot gets its own
 * cloud; then every claimed region is wiped clear, so a neighbour's feathered rim
 * never hazes a region that has a repo.
 *
 * This is the fog's body and its shape, but not its hatching: the cloud art drifts
 * over it, and shows through exactly this much of it (`WeatherLayer`, `weather.ts`).
 */
export class FogLayer {
  readonly canvas: HTMLCanvasElement
  private readonly clouds = new Map<RegionSlot, HTMLCanvasElement>()
  private readonly areas: Record<RegionSlot, Ellipse>

  /**
   * `veil` is the theme's wash, bone mist in Guslar and cold frost in a Vaillant world, and where
   * its clouds reach wider than the slots' own areas.
   */
  constructor(veil: ThemeArt["veil"]) {
    this.areas = { ...SLOT_AREAS, ...veil.reach }
    this.canvas = document.createElement("canvas")
    this.canvas.width = MAP_SIZE.width
    this.canvas.height = MAP_SIZE.height
    REGION_SLOTS.forEach((slot, index) => this.clouds.set(slot, paintFog(this.areas[slot], index + 1, veil)))
  }

  /**
   * Lays the fog out over the world as it stands.
   *
   * `world` is undefined until the first broadcast, when the map knows of no repos and every
   * slot is under fog. `reveal` is how far the fog has pulled off the claimed regions
   * (`revealProgress`, `reveal.ts`): at 0 it still stands over them, at 1 it is where it stays.
   */
  compose(world: WorldState | undefined, reveal: number): void {
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d canvas")
    ctx.globalCompositeOperation = "source-over"
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    const claimed = new Set(world?.slots.filter((slot) => slot.kind === "region").map((slot) => slot.slot))
    for (const slot of REGION_SLOTS) {
      const cloud = this.clouds.get(slot)
      if (!cloud) continue
      // A claimed region keeps its own fog until the reveal has finished taking it away,
      // thinning as the clear below opens out through it.
      if (claimed.has(slot)) {
        if (reveal >= 1) continue
        ctx.globalAlpha = 1 - reveal
      }
      const area = this.areas[slot]
      ctx.drawImage(cloud, area.x - cloud.width / 2, area.y - cloud.height / 2)
      ctx.globalAlpha = 1
    }

    ctx.globalCompositeOperation = "destination-out"
    // The clear opens from each claimed region's heart out to its edge, which is the fog
    // pulling back off it; at 0 nothing is clear yet and the whole map lies under weather.
    if (reveal > 0) {
      for (const slot of claimed) {
        const area = clearArea(slot)
        ctx.save()
        ctx.translate(area.x, area.y)
        ctx.scale(area.rx * reveal, area.ry * reveal)
        const clear = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.05)
        clear.addColorStop(0, "rgba(0,0,0,1)")
        clear.addColorStop(0.81, "rgba(0,0,0,1)")
        clear.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = clear
        ctx.fillRect(-1.05, -1.05, 2.1, 2.1)
        ctx.restore()
      }
    }
    fadeEdges(ctx, this.canvas.width, this.canvas.height, FOG_EDGE_FEATHER)
    ctx.globalCompositeOperation = "source-over"
  }
}

/** How far in from each edge the map fades out into the backdrop. */
const MAP_EDGE_FEATHER = 220

/**
 * The fog fades over a narrower band, so it is always at least as solid as the map
 * under it and what it hides never shows through where both thin out.
 */
const FOG_EDGE_FEATHER = 70

/** The map with its outer edge faded to transparent, so it melts into the backdrop. */
export function featheredMap(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")
  ctx.drawImage(image, 0, 0)
  fadeEdges(ctx, canvas.width, canvas.height, MAP_EDGE_FEATHER)
  return canvas
}

function fadeEdges(ctx: CanvasRenderingContext2D, width: number, height: number, feather: number): void {
  ctx.globalCompositeOperation = "destination-out"
  const edges: [number, number, number, number][] = [
    [0, 0, feather, 0],
    [width, 0, width - feather, 0],
    [0, 0, 0, feather],
    [0, height, 0, height - feather],
  ]
  for (const [x0, y0, x1, y1] of edges) {
    const fade = ctx.createLinearGradient(x0, y0, x1, y1)
    fade.addColorStop(0, "rgba(0,0,0,1)")
    fade.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = fade
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || width, Math.abs(y1 - y0) || height)
  }
}

/**
 * Paints one slot's fog on a canvas a little larger than its ellipse: a misty
 * bone wash, cut to a cloud of soft blobs so the rim is lumpy like the painted
 * mist around the map, never a clean oval.
 */
function paintFog(area: Ellipse, seed: number, veil: ThemeArt["veil"]): HTMLCanvasElement {
  const pad = 1.3
  const width = Math.ceil(area.rx * 2 * pad)
  const height = Math.ceil(area.ry * 2 * pad)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")

  // The theme's heart colour, cooling to its rim where the cloud thins. Guslar's carries the
  // warmth the cloud art's own cream paper used to lend it when the art was stamped in here.
  const wash = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2)
  wash.addColorStop(0, css(veil.heart))
  wash.addColorStop(1, css(veil.rim))
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = "destination-in"
  ctx.drawImage(cloudMask(width, height, area, seed), 0, 0)

  return canvas
}

/** A soft cloud: one dense core ellipse and a ring of feathered blobs around its rim. */
function cloudMask(width: number, height: number, area: Ellipse, seed: number): HTMLCanvasElement {
  const mask = document.createElement("canvas")
  mask.width = width
  mask.height = height
  const ctx = mask.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")
  const random = mulberry32(seed * 7919)
  const cx = width / 2
  const cy = height / 2

  const blob = (x: number, y: number, rx: number, ry: number, alpha: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(rx, ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, `rgba(0,0,0,${alpha})`)
    g.addColorStop(0.76, `rgba(0,0,0,${alpha})`)
    g.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = g
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }

  blob(cx, cy, area.rx * 1.02, area.ry * 1.02, 1)
  blob(cx, cy, area.rx * 0.8, area.ry * 0.8, 1)
  const count = 14
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.4
    const reach = 0.72 + random() * 0.22
    const size = 0.28 + random() * 0.18
    blob(
      cx + Math.cos(angle) * area.rx * reach,
      cy + Math.sin(angle) * area.ry * reach,
      area.rx * size,
      area.ry * size * (0.8 + random() * 0.4),
      0.75 + random() * 0.25,
    )
  }
  return mask
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function css([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}
