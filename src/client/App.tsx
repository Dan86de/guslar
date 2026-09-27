import { useState } from "react"
import { NoticeBoard } from "./NoticeBoard.js"
import { useWorld } from "./useWorld.js"
import { WorldMap, type VillageRef } from "./WorldMap.js"

export function App() {
  const { world, connected } = useWorld()
  const [opened, setOpened] = useState<VillageRef>()

  // The board follows the live world; it goes when its village does.
  const region = world?.slots.find((slot) => slot.slot === opened?.slot)
  const village = region?.kind === "region" ? region.villages.find((v) => v.slug === opened?.slug) : undefined

  return (
    <main>
      <h1 className="visually-hidden">Guslar</h1>
      <WorldMap world={world} onOpenVillage={setOpened} />
      {village && (
        <NoticeBoard key={`${opened?.slot}/${village.slug}`} village={village} onClose={() => setOpened(undefined)} />
      )}
      {world && !connected && (
        <p className="notice" role="status">
          The road to the server is cut. Reconnecting…
        </p>
      )}
    </main>
  )
}
