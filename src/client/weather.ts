import { Container, Sprite, Texture, TilingSprite, CanvasSource, type Ticker } from "pixi.js"
import { advanceDrift, driftOffsets } from "./drift.js"
import { MAP_SIZE } from "./geometry.js"

/**
 * The weather inside the fog: two layers of the cloud art drifting across the whole
 * map, seen only through the fog's own composite, which masks them. The composite
 * never moves, so the fog's outline, its rim and its clearing around claimed regions
 * are exactly where they were, and what drifts is only what is inside them.
 */
export class WeatherLayer {
  readonly container = new Container()
  private readonly layers: readonly [TilingSprite, TilingSprite]
  private readonly tileSize: number
  private elapsedMs = 0
  private sinceStep = 0
  private held = false

  /** `fogTexture` is the fog composite's texture, used here as the shape the drift shows through. */
  constructor(fogArt: HTMLImageElement, fogTexture: Texture, ticker: Ticker) {
    const tile = seamlessTile(fogArt)
    this.tileSize = tile.width
    // Mipmapped: the map is drawn at about half size, and fine hatching minified
    // without them crawls as it drifts.
    const texture = new Texture({
      source: new CanvasSource({ resource: tile, autoGenerateMipmaps: true, scaleMode: "linear" }),
    })
    // The tile holds the art shrunk to `TILE_SIZE`, so a layer draws it back up by that
    // much to put the hatching on the map at the size its `scale` asks for.
    const drawnUp = fogArt.naturalWidth / tile.width
    const [near, far] = LAYER_LOOKS
    this.layers = [cloudLayer(texture, near, drawnUp), cloudLayer(texture, far, drawnUp)]
    this.container.addChild(...this.layers)

    // Not drawn, only masked with: a sprite mask must be in the subtree it masks.
    const shape = new Sprite(fogTexture)
    this.container.addChild(shape)
    this.container.setMask({ mask: shape, channel: "alpha" })

    this.place()
    ticker.add((tick) => {
      this.frame(tick.deltaMS)
    })
  }

  /**
   * Holds the weather where it stands, or lets it blow again.
   *
   * Held, the layers are given no time at all, so the cloud is exactly where the last frame
   * left it and letting it go carries on from there rather than catching up.
   */
  hold(held: boolean): void {
    this.held = held
  }

  private frame(deltaMs: number): void {
    if (this.held) return
    // Time the ticker reported is never dropped, only held back until a step is due.
    this.sinceStep += deltaMs
    if (this.sinceStep < DRIFT_STEP_MS) return
    this.elapsedMs = advanceDrift(this.elapsedMs, this.sinceStep)
    this.sinceStep = 0
    this.place()
  }

  private place(): void {
    const offsets = driftOffsets(this.elapsedMs)
    for (const [index, layer] of this.layers.entries()) {
      const offset = index === 0 ? offsets[0] : offsets[1]
      // Wrapped to one tile, so an afternoon of drift never grows past what the
      // tiling shader can hold precisely. The clock itself keeps counting up.
      const span = this.tileSize * layer.tileScale.x
      layer.tilePosition.set(offset.x % span, offset.y % span)
    }
  }
}

/** How a drifting layer of cloud art is drawn: its size on the map, and how much of it shows. */
type LayerLook = { readonly scale: number; readonly alpha: number }

/**
 * The two layers, at sizes of their own so the pair never reads as one texture. The
 * nearer one is drawn at the size the fog art was stamped at before it drifted, and the
 * further one larger and fainter, for cloud behind cloud. Between them they lay on about
 * as much ink as the one stamped layer did.
 */
const LAYER_LOOKS: readonly [LayerLook, LayerLook] = [
  { scale: 0.62, alpha: 0.32 },
  { scale: 0.88, alpha: 0.14 },
]

/**
 * How often the drift is moved on, at most. One ticker draws the whole stage, so this
 * caps what the weather costs rather than the rate the stage renders at; a step at
 * these speeds is a third of a screen pixel, far below what an eye catches.
 */
const DRIFT_STEP_MS = 1000 / 12

function cloudLayer(texture: Texture, look: LayerLook, drawnUp: number): TilingSprite {
  const scale = look.scale * drawnUp
  return new TilingSprite({
    texture,
    width: MAP_SIZE.width,
    height: MAP_SIZE.height,
    tileScale: { x: scale, y: scale },
    alpha: look.alpha,
  })
}

/**
 * How wide the tile is cut. The map is drawn at about six tenths of its own size in a
 * normal window and the hatching at six tenths of the art's, which puts a tile this wide
 * at roughly one texel to the screen pixel. Cutting it larger only means the card has to
 * shrink it again, and a shrunk texture is a blurred one: the strokes lose their edge.
 */
const TILE_SIZE = 768

/**
 * The cloud art as a tile of ink that repeats without a seam.
 *
 * The art is wrapped by half its width and height, so the edges that meet where it
 * repeats are two stretches that already sat side by side in the painting. That leaves
 * the painting's own edges meeting in a cross down the middle, which a patch of the art
 * covers, faded in over a wide band so the hatching crosses it with no line to see.
 */
function seamlessTile(art: HTMLImageElement): HTMLCanvasElement {
  const size = TILE_SIZE
  const half = size / 2
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")
  for (const x of [-half, half]) {
    for (const y of [-half, half]) ctx.drawImage(art, x, y, size, size)
  }
  ctx.drawImage(crossPatch(art, size), 0, 0)
  inkOnly(ctx, size)
  return canvas
}

/**
 * Lifts the hatching off the paper it was painted on: each pixel becomes shadow as
 * deep as it was dark, and the cream ground falls away to nothing. Laid over the fog's
 * bone wash that darkens it exactly where the ink is, which is what the stamped art did
 * when it was multiplied into the wash, and leaves the wash's own colour everywhere else.
 */
function inkOnly(ctx: CanvasRenderingContext2D, size: number): void {
  const image = ctx.getImageData(0, 0, size, size)
  const pixels = image.data
  for (let i = 0; i < pixels.length; i += 4) {
    const lightest = Math.max(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0)
    pixels[i] = 0
    pixels[i + 1] = 0
    pixels[i + 2] = 0
    pixels[i + 3] = 255 - lightest
  }
  ctx.putImageData(image, 0, 0)
}

/** The art cut to a soft cross down its middle, to cover the seam wrapping leaves there. */
function crossPatch(art: HTMLImageElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")
  ctx.drawImage(art, 0, 0, size, size)
  ctx.globalCompositeOperation = "destination-in"
  ctx.drawImage(crossMask(size), 0, 0)
  return canvas
}

/** Two soft bands down the middle of a tile, solid over the seam and gone an eighth of the tile either side. */
function crossMask(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d canvas")
  const half = size / 2
  const band = size / 8
  // Alpha adds where the two bands cross, so the middle of the cross stays solid.
  ctx.globalCompositeOperation = "lighter"
  const bands: [number, number, number, number][] = [
    [half - band, 0, half + band, 0],
    [0, half - band, 0, half + band],
  ]
  for (const [x0, y0, x1, y1] of bands) {
    const fade = ctx.createLinearGradient(x0, y0, x1, y1)
    fade.addColorStop(0, "rgba(0,0,0,0)")
    fade.addColorStop(0.5, "rgba(0,0,0,1)")
    fade.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = fade
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || size, Math.abs(y1 - y0) || size)
  }
  return canvas
}
