import { Application, BlurFilter, CanvasSource, ColorMatrixFilter, Container, Sprite, Texture } from "pixi.js"
import { useEffect, useRef, useState } from "react"
import fogUrl from "../../art/fog.png"
import bountyUrl from "../../art/village-bounty.png"
import clearedUrl from "../../art/village-cleared.png"
import contractsUrl from "../../art/village-contracts.png"
import mapUrl from "../../art/world-map.png"
import type { RegionSlot, VillageStage, WorldState } from "../shared/world.js"
import { cutOutAll } from "./cutout.js"
import { featheredMap, FogLayer } from "./fog.js"
import { fitMap, labelAnchor, MAP_SIZE, villageSpots, type View } from "./geometry.js"

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
}: {
  world: WorldState | undefined
  onOpenVillage: (village: VillageRef) => void
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

    void (async () => {
      const [, mapImage, fogImage, ...stageImages] = await Promise.all([
        app.init({
          resizeTo: element,
          background: "#1d1812",
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio,
        }),
        loadImage(mapUrl),
        loadImage(fogUrl),
        ...STAGES.map((stage) => loadImage(STAGE_ART[stage])),
      ])
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

      const fog = new FogLayer(fogImage)
      const fogSprite = new Sprite(Texture.from(fog.canvas))
      fogSprite.visible = false
      board.addChild(fogSprite)
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
      setScene({
        villageAspect,
        show(world) {
          fog.compose(world)
          fogSprite.texture.source.update()
          fogSprite.visible = true

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
        },
      })
    })()

    return () => {
      life.cancelled = true
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
              const anchor = labelAnchor(slot.slot)
              const style = { left: view.x + anchor.x * view.scale, top: view.y + anchor.y * view.scale }
              return slot.kind === "region" ? (
                <li key={slot.slot} className="plaque" style={style} data-slot={slot.slot} data-repo={slot.repo}>
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
