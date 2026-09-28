import { Application, BlurFilter, CanvasSource, ColorMatrixFilter, Container, Sprite, Texture } from "pixi.js"
import { useEffect, useRef, useState } from "react"
import flareUrl from "../../art/awaiting-flare.png"
import fogUrl from "../../art/fog.png"
import huntingUrl from "../../art/hunter-hunting.png"
import ridingUrl from "../../art/hunter-riding.png"
import trophyUrl from "../../art/hunter-trophy.png"
import woundedUrl from "../../art/hunter-wounded.png"
import bountyUrl from "../../art/village-bounty.png"
import clearedUrl from "../../art/village-cleared.png"
import contractsUrl from "../../art/village-contracts.png"
import mapUrl from "../../art/world-map.png"
import type { RegionSlot, VillageStage, WorldState } from "../shared/world.js"
import { outFor } from "./bound.js"
import { cutOutAll } from "./cutout.js"
import { featheredMap, FogLayer } from "./fog.js"
import { fitMap, hunterGround, labelAnchor, MAP_SIZE, regionGround, villageSpots, type View } from "./geometry.js"
import { HUNTER_STATE_NAMES } from "./hunterStates.js"
import { HunterLayer, isOut, POSES, RIDE_MS, type HunterPlace, type Pose } from "./hunters.js"
import { REVEAL_MS, REVEAL_STEP_MS, revealProgress } from "./reveal.js"
import { WeatherLayer } from "./weather.js"

/** What the map needs from the Pixi scene once it is built. */
type Scene = {
  show(world: WorldState): void
  /** The village art's height over its width. */
  villageAspect: number
}

/** Each village stage's art, painted from one camera so they swap in place. */
const STAGE_ART: Record<VillageStage, string> = {
  "bounty-drafted": bountyUrl,
  "contracts-posted": contractsUrl,
  cleared: clearedUrl,
}

/** A village's stage as its list item says it. */
const STAGE_NAMES: Record<VillageStage, string> = {
  "bounty-drafted": "Bounty drafted",
  "contracts-posted": "Contracts posted",
  cleared: "Cleared",
}

const STAGES = Object.keys(STAGE_ART) as VillageStage[]

const POSE_ART: Record<Pose, string> = {
  riding: ridingUrl,
  hunting: huntingUrl,
  wounded: woundedUrl,
  trophy: trophyUrl,
}

/**
 * Where every hunter in the world stands on the map: beside its village, or by its region's plaque
 * for a rite of the region's own or a session started outside Guslar, out in the field or back
 * home. Hunters on the same ground stand side by side, each next one further out.
 */
function hunterPlaces(world: WorldState, aspect: number): HunterPlace[] {
  const taken = new Map<string, number>()
  return world.hunters.flatMap((hunter) => {
    const region = world.slots.find((slot) => slot.slot === hunter.slot)
    if (region?.kind !== "region") return []
    let ground
    if (hunter.village === undefined) {
      ground = regionGround(region.slot, aspect)
    } else {
      const index = region.villages.findIndex((v) => v.slug === hunter.village)
      const spot = villageSpots(region.slot, region.villages.length, aspect)[index]
      if (!spot) return []
      ground = hunterGround(spot, aspect)
    }
    const at = isOut(hunter.state) ? ground.field : ground.home
    const key = `${at.x},${at.y}`
    const before = taken.get(key) ?? 0
    taken.set(key, before + 1)
    const step = ground.height * SIDE_BY_SIDE * before * ground.outward
    return [{ hunter, at: { x: at.x + step, y: at.y }, height: ground.height, outward: ground.outward }]
  })
}

/** How far apart two hunters on the same ground stand, as a share of their height: a figure's width and a little. */
const SIDE_BY_SIDE = 0.75

/** A village the user opened: its region's slot and the spec's slug. */
export type VillageRef = { slot: RegionSlot; slug: string }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`could not load ${url}`))
    image.src = url
  })
}

function slotName(slot: RegionSlot): string {
  return slot.replace("-", " ")
}

export function WorldMap({
  world,
  onOpenVillage,
  onOpenHunter,
  onOpenRegion,
}: {
  world: WorldState | undefined
  onOpenVillage: (village: VillageRef) => void
  /** Opens a hunter's journal, by the hunter's id. */
  onOpenHunter: (id: string) => void
  /** Opens a region's rites, by its slot. */
  onOpenRegion: (slot: RegionSlot) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<Scene>()
  const [view, setView] = useState<View>()

  useEffect(() => {
    const element = host.current
    if (!element) return
    const life = { cancelled: false }
    const app = new Application()
    let onResize: (() => void) | undefined
    let onVisibility: (() => void) | undefined
    let stopStillness: (() => void) | undefined

    void (async () => {
      const [, mapImage, fogImage, flareImage, ...images] = await Promise.all([
        app.init({
          resizeTo: element,
          background: "#1d1812",
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio,
        }),
        loadImage(mapUrl),
        loadImage(fogUrl),
        loadImage(flareUrl),
        ...STAGES.map((stage) => loadImage(STAGE_ART[stage])),
        ...POSES.map((pose) => loadImage(POSE_ART[pose])),
      ])
      const stageImages = images.slice(0, STAGES.length)
      const poseImages = images.slice(STAGES.length)
      if (life.cancelled) {
        app.destroy(true)
        return
      }

      const mapTexture = Texture.from(mapImage)
      const feathered = Texture.from(featheredMap(mapImage))

      // Beyond the map's edge, a blurred and darkened copy of it fills the screen, so a
      // viewport of any shape shows painted mist rather than bars.
      const backdrop = new Sprite(mapTexture)
      backdrop.anchor.set(0.5)
      const dim = new ColorMatrixFilter()
      dim.brightness(0.7, false)
      backdrop.filters = [new BlurFilter({ strength: 24, quality: 4 }), dim]
      app.stage.addChild(backdrop)

      const board = new Container()
      board.addChild(new Sprite(feathered))

      // Villages stand on the map, under the fog, which never covers a claimed region anyway.
      // Drawn far smaller than painted, so it needs mipmaps or its ink lines break into pixels.
      // Every stage is cut to the same box, so they share one aspect.
      const cutouts = cutOutAll(stageImages)
      const stageTextures = new Map(
        STAGES.map((stage, index) => [
          stage,
          new Texture({
            source: new CanvasSource({ resource: cutouts[index], autoGenerateMipmaps: true, scaleMode: "linear" }),
          }),
        ]),
      )
      const firstCutout = cutouts[0]
      if (!firstCutout) throw new Error("no village art")
      const villageAspect = firstCutout.height / firstCutout.width
      const villages = new Container()
      board.addChild(villages)

      const fog = new FogLayer()
      const fogTexture = Texture.from(fog.canvas)
      const fogSprite = new Sprite(fogTexture)
      board.addChild(fogSprite)

      // The cloud art drifts over the fog's body, masked by the very same texture, so
      // the weather is only ever seen inside the outline the composite already has.
      const weather = new WeatherLayer(fogImage, fogTexture, app.ticker)
      board.addChild(weather.container)

      // Hunters stand over the fog: they only ride in claimed regions, and one hunting at the
      // edge of its region must not fade into a neighbour's fog rim.
      const hunters = new HunterLayer(poseImages, flareImage, app.ticker)
      board.addChild(hunters.container)
      app.stage.addChild(board)
      element.appendChild(app.canvas)

      onResize = () => {
        const width = element.clientWidth
        const height = element.clientHeight
        const next = fitMap(width, height)
        board.scale.set(next.scale)
        backdrop.position.set(width / 2, height / 2)
        backdrop.scale.set(Math.max(width / MAP_SIZE.width, height / MAP_SIZE.height) * 1.15)
        board.position.set(next.x, next.y)
        setView(next)
      }
      onResize()
      app.renderer.on("resize", onResize)

      // A window left open all day spends most of it behind another one, and there is no
      // one to show a frame to while it does. Everything that moves on the map is placed
      // from time the ticker reported, so stopping the ticker holds the weather and the
      // hunters where the last frame left them, and starting it again reports the frame
      // after the pause rather than the pause itself: the drift carries on, never skips.
      onVisibility = () => {
        if (document.hidden) app.ticker.stop()
        else app.ticker.start()
      }
      document.addEventListener("visibilitychange", onVisibility)
      onVisibility()

      // The map arrives under fog over every slot, and gives the claimed ones up once, as the
      // world's first broadcast tells it which they are. `shown` is the last world the fog was
      // laid out for; `revealMs` is undefined until that first world, so the clock starts when
      // there is something to uncover and runs down only once. A dropped socket brings another
      // world, never another reveal: by then the clock is spent and the fog is where it stays.
      let shown: WorldState | undefined
      let revealMs: number | undefined
      let sinceStep = 0
      const layFog = () => {
        fog.compose(shown, revealProgress(revealMs ?? 0))
        fogSprite.texture.source.update()
      }
      layFog()
      app.ticker.add((tick) => {
        if (revealMs === undefined || revealMs >= REVEAL_MS) return
        revealMs += tick.deltaMS
        sinceStep += tick.deltaMS
        // Held back until a step is due, or until the fog has arrived where it stays.
        if (sinceStep < REVEAL_STEP_MS && revealMs < REVEAL_MS) return
        sinceStep = 0
        layFog()
      })

      // Asking the system for less motion turns the weather off, and that setting is the whole
      // switch: there is nothing in `world.json` about it and nothing on the page to click. Off,
      // the cloud is held where it stands and the reveal is spent before anyone sees it, so the
      // fog simply lies where it stays. Read again whenever it changes, so a map already open
      // goes still, and letting motion back lets that same cloud blow on from where it stopped.
      const stillness = window.matchMedia("(prefers-reduced-motion: reduce)")
      const onStillness = () => {
        weather.hold(stillness.matches)
        // A reveal already under way ends here, rather than easing on under a setting that
        // has just asked it not to.
        if (!stillness.matches || revealMs === undefined || revealMs >= REVEAL_MS) return
        revealMs = REVEAL_MS
        layFog()
      }
      stillness.addEventListener("change", onStillness)
      onStillness()
      stopStillness = () => stillness.removeEventListener("change", onStillness)

      setScene({
        villageAspect,
        show(world) {
          // The reveal's clock is spent before it starts when the setting is on, so the first
          // world lays the fog straight down where it stays.
          if (revealMs === undefined) revealMs = stillness.matches ? REVEAL_MS : 0
          shown = world
          layFog()

          for (const child of villages.removeChildren()) child.destroy()
          for (const slot of world.slots) {
            if (slot.kind !== "region") continue
            const spots = villageSpots(slot.slot, slot.villages.length, villageAspect)
            for (const [index, village] of slot.villages.entries()) {
              const spot = spots[index]
              if (!spot) continue
              const sprite = new Sprite(stageTextures.get(village.stage))
              sprite.anchor.set(0.5)
              sprite.position.set(spot.x, spot.y)
              sprite.width = spot.width
              sprite.height = spot.width * villageAspect
              villages.addChild(sprite)
            }
          }
          hunters.show(hunterPlaces(world, villageAspect))
        },
      })
    })()

    return () => {
      life.cancelled = true
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility)
      if (stopStillness) stopStillness()
      if (onResize) {
        app.renderer.off("resize", onResize)
        app.destroy(true, { children: true, texture: true })
      }
      setScene(undefined)
    }
  }, [])

  useEffect(() => {
    if (!scene || !world) return
    scene.show(world)
  }, [scene, world])

  const ready = Boolean(scene && world && view)

  return (
    <div className="map" ref={host} aria-busy={!ready}>
      {ready && view && world && scene && (
        <>
          <ul className="slots" aria-label="Regions">
            {world.slots.map((slot) => {
              // A region's plaque is painted by its button under Region rites, after the villages
              // and hunters, so Tab reaches a village first; this says it in its slot's place.
              return slot.kind === "region" ? (
                <li key={slot.slot} className="visually-hidden" data-slot={slot.slot} data-repo={slot.repo}>
                  {slot.name}
                  <span className="visually-hidden">{`, ${slotName(slot.slot)}`}</span>
                </li>
              ) : (
                <li key={slot.slot} className="visually-hidden" data-slot={slot.slot} data-fog="">
                  {`Unclaimed ${slotName(slot.slot)}, under fog`}
                </li>
              )
            })}
          </ul>
          <VillageList world={world} view={view} aspect={scene.villageAspect} onOpen={onOpenVillage} />
          <HunterList world={world} view={view} aspect={scene.villageAspect} onOpen={onOpenHunter} />
          <ul className="slots" aria-label="Region rites">
            {world.slots.map((slot) => {
              if (slot.kind !== "region") return null
              const anchor = labelAnchor(slot.slot)
              const style = { left: view.x + anchor.x * view.scale, top: view.y + anchor.y * view.scale }
              return (
                <li key={slot.slot}>
                  <button
                    type="button"
                    className="plaque"
                    style={style}
                    aria-label={`Rites of ${slot.name}`}
                    onClick={() => onOpenRegion(slot.slot)}
                  >
                    {slot.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * What a user clicks to open a village: one button over each village's art, with its name
 * under it, and the stage the art paints said in words beside it.
 */
function VillageList({
  world,
  view,
  aspect,
  onOpen,
}: {
  world: WorldState
  view: View
  aspect: number
  onOpen: (village: VillageRef) => void
}) {
  const items = world.slots.flatMap((slot) => {
    if (slot.kind !== "region") return []
    const spots = villageSpots(slot.slot, slot.villages.length, aspect)
    return slot.villages.flatMap((village, index) => {
      const spot = spots[index]
      if (!spot) return []
      const height = spot.width * aspect
      const style = {
        left: view.x + spot.x * view.scale,
        top: view.y + (spot.y - height / 2) * view.scale,
        width: spot.width * view.scale,
        height: height * view.scale,
      }
      return [
        <li key={`${slot.slot}/${village.slug}`} className="village" style={style}>
          <button type="button" onClick={() => onOpen({ slot: slot.slot, slug: village.slug })}>
            <span className="village-name">{village.title}</span>
            <span className="visually-hidden">{`, village in ${slot.name}`}</span>
          </button>
          <span className="visually-hidden">{STAGE_NAMES[village.stage]}</span>
        </li>,
      ]
    })
  })
  if (items.length === 0) return null
  return (
    <ul className="slots" aria-label="Villages">
      {items}
    </ul>
  )
}

/**
 * Each hunter's name over its painted figure's head, following it as it rides, with its state and
 * what it is out for said in words for anyone who cannot see the pose. The name and the figure under it
 * are one button, named by the hunter, which opens its journal.
 */
function HunterList({
  world,
  view,
  aspect,
  onOpen,
}: {
  world: WorldState
  view: View
  aspect: number
  onOpen: (id: string) => void
}) {
  const places = hunterPlaces(world, aspect)
  if (places.length === 0) return null
  return (
    <ul className="slots" aria-label="Hunters">
      {places.map(({ hunter, at, height }) => {
        const style = {
          left: view.x + at.x * view.scale,
          top: view.y + (at.y - height) * view.scale,
          transitionDuration: `${RIDE_MS}ms`,
          "--figure-height": `${height * view.scale}px`,
        }
        return (
          <li key={hunter.id} className="hunter" style={style} data-state={hunter.state}>
            {/* Named by the hunter alone, so a village's name opens only its village. */}
            <button
              type="button"
              className="hunter-open"
              aria-describedby={`hunter-${hunter.id}`}
              onClick={() => onOpen(hunter.id)}
            >
              <span className="hunter-name">{hunter.name}</span>
            </button>
            <span id={`hunter-${hunter.id}`} className="visually-hidden">
              {` , ${HUNTER_STATE_NAMES[hunter.state]}${outFor(world, hunter)}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
