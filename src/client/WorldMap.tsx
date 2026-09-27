import { Application, BlurFilter, ColorMatrixFilter, Container, Sprite, Texture } from "pixi.js"
import { useEffect, useRef, useState } from "react"
import fogUrl from "../../art/fog.png"
import mapUrl from "../../art/world-map.png"
import type { RegionSlot, WorldState } from "../shared/world.js"
import { featheredMap, FogLayer } from "./fog.js"
import { fitMap, labelAnchor, MAP_SIZE, type View } from "./geometry.js"

/** What the map needs from the Pixi scene once it is built. */
type Scene = { showFog(world: WorldState): void }

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

export function WorldMap({ world }: { world: WorldState | undefined }) {
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
      const [, mapImage, fogImage] = await Promise.all([
        app.init({
          resizeTo: element,
          background: "#1d1812",
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio,
        }),
        loadImage(mapUrl),
        loadImage(fogUrl),
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
        showFog(world) {
          fog.compose(world)
          fogSprite.texture.source.update()
          fogSprite.visible = true
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
    scene.showFog(world)
  }, [scene, world])

  const ready = Boolean(scene && world && view)

  return (
    <div className="map" ref={host} aria-busy={!ready}>
      {ready && view && world && (
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
      )}
    </div>
  )
}
