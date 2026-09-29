import { CanvasSource, Container, Sprite, Texture, type Ticker } from "pixi.js"
import type { Hunter, HunterState } from "../shared/world.js"
import { cutOutAll } from "./cutout.js"
import type { Footing } from "./geometry.js"

/** The hunter's four poses, painted from one camera so they swap in place. */
export type Pose = "riding" | "hunting" | "wounded" | "trophy"

export const POSES: Pose[] = ["riding", "hunting", "wounded", "trophy"]

/** Which pose each state is painted in; awaiting you is the hunting pose with the flare planted beside it. */
const POSE_OF: Record<HunterState, Pose> = {
  "riding-out": "riding",
  hunting: "hunting",
  "awaiting-you": "hunting",
  "returned-trophy": "trophy",
  "returned-wounded": "wounded",
}

/** How long a hunter takes to ride between its village and its hunting ground, in ms. */
export const RIDE_MS = 2000

/**
 * A hunter's ground, as the map lays it out: where it stands now, how tall it is drawn, and
 * `outward`, the side its field lies on from its home: 1 to the right, -1 to the left.
 */
export type HunterPlace = { hunter: Hunter; at: Footing; height: number; outward: 1 | -1 }

/** A returned hunter stands at home, the rest out in the field. */
export function isOut(state: HunterState): boolean {
  return state !== "returned-trophy" && state !== "returned-wounded"
}

function texture(canvas: HTMLCanvasElement): Texture {
  // Drawn far smaller than painted, so it needs mipmaps or its ink lines break into pixels.
  return new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: "linear" }) })
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

type Figure = {
  sprite: Sprite
  flare: Sprite
  from: Footing
  to: Footing
  started: number
  height: number
  /** 1 faces right, -1 left: outward, away from its home, while out, and back towards it once returned. */
  facing: 1 | -1
}

/**
 * The hunters on the map, one painted figure each, in the pose of its state. A figure that
 * changes ground rides there over RIDE_MS rather than jumping, facing the way it goes: out
 * to the field facing away from its village or its region's plaque, back home facing it.
 */
export class HunterLayer {
  readonly container = new Container()
  private readonly poses: Map<Pose, Texture>
  private readonly flareTexture: Texture
  private readonly flareAspect: number
  private readonly figures = new Map<string, Figure>()
  private readonly aspect: number
  private clock = 0

  /**
   * `flareShare` is how tall the flare stands as a share of its figure's height, since each
   * theme's flare carries its signal at a different height on its post.
   */
  constructor(
    poseImages: HTMLImageElement[],
    flareImage: HTMLImageElement,
    private readonly flareShare: number,
    ticker: Ticker,
  ) {
    const cutouts = cutOutAll(poseImages)
    this.poses = new Map(POSES.map((pose, index) => [pose, texture(cutouts[index] ?? document.createElement("canvas"))]))
    const first = cutouts[0]
    this.aspect = first ? first.width / first.height : 0.67
    // The flare keeps the pale halo it was painted with: it sets it off from any ground.
    const [flare] = cutOutAll([flareImage])
    if (!flare) throw new Error("no flare art")
    this.flareTexture = texture(flare)
    this.flareAspect = flare.width / flare.height
    ticker.add((tick) => this.frame(tick.deltaMS))
  }

  show(places: HunterPlace[]): void {
    const seen = new Set<string>()
    for (const { hunter, at, height, outward } of places) {
      seen.add(hunter.id)
      let figure = this.figures.get(hunter.id)
      if (!figure) {
        const sprite = new Sprite()
        sprite.anchor.set(0.5, 1)
        const flare = new Sprite(this.flareTexture)
        flare.anchor.set(0.5, 0.95)
        this.container.addChild(flare, sprite)
        // A hunter new to the map is placed where it stands; only a ride seen from its start is drawn.
        figure = { sprite, flare, from: at, to: at, started: -Infinity, height, facing: 1 }
        this.figures.set(hunter.id, figure)
      }
      if (figure.to.x !== at.x || figure.to.y !== at.y) {
        figure.from = this.position(figure)
        figure.to = at
        figure.started = this.clock
      }
      figure.height = height
      figure.facing = isOut(hunter.state) ? outward : outward === 1 ? -1 : 1
      figure.sprite.texture = this.poses.get(POSE_OF[hunter.state]) ?? Texture.EMPTY
      figure.flare.visible = hunter.state === "awaiting-you"
      this.place(figure)
    }
    for (const [id, figure] of this.figures) {
      if (seen.has(id)) continue
      figure.sprite.destroy()
      figure.flare.destroy()
      this.figures.delete(id)
    }
  }

  private position(figure: Figure): Footing {
    const t = ease(Math.min(1, Math.max(0, (this.clock - figure.started) / RIDE_MS)))
    return { x: figure.from.x + (figure.to.x - figure.from.x) * t, y: figure.from.y + (figure.to.y - figure.from.y) * t }
  }

  private place(figure: Figure): void {
    const { x, y } = this.position(figure)
    const { sprite, flare, height } = figure
    sprite.position.set(x, y)
    sprite.height = height
    // Pixi's width setter keeps the sign scale.x had, so set the size, then the side it faces.
    sprite.width = height * this.aspect
    sprite.scale.x = Math.abs(sprite.scale.x) * figure.facing
    const flareHeight = height * this.flareShare
    flare.height = flareHeight
    flare.width = flareHeight * this.flareAspect
    // Planted just behind the hunter, on the side it faces away from, so its pennant flies beside the
    // hunter's head and never covers its hands.
    flare.position.set(x - figure.facing * height * this.aspect * 0.45, y - height * 0.14)
    // The pennant stirs in the wind so the eye finds it.
    flare.skew.x = Math.sin(this.clock / 260) * 0.05
  }

  private frame(deltaMs: number): void {
    this.clock += deltaMs
    for (const figure of this.figures.values()) this.place(figure)
  }
}
