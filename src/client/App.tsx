import { useState } from "react"
import { Journal } from "./Journal.js"
import { NoticeBoard } from "./NoticeBoard.js"
import { useWorld } from "./useWorld.js"
import { WorldMap, type VillageRef } from "./WorldMap.js"

export function App() {
  const { world, connected } = useWorld()
  const [opened, setOpened] = useState<VillageRef>()
  const [reading, setReading] = useState<string>()

  // The board follows the live world; it goes when its village does.
  const region = world?.slots.find((slot) => slot.slot === opened?.slot)
  const village = region?.kind === "region" ? region.villages.find((v) => v.slug === opened?.slug) : undefined

  // So does the journal: it goes when its hunter leaves the map.
  const hunter = world?.hunters.find((h) => h.id === reading)
  const hunterRegion = world?.slots.find((slot) => slot.slot === hunter?.slot)
  const hunterVillage =
    hunterRegion?.kind === "region" ? hunterRegion.villages.find((v) => v.slug === hunter?.village) : undefined

  return (
    <main>
      <h1 className="visually-hidden">Guslar</h1>
      <WorldMap world={world} onOpenVillage={setOpened} onOpenHunter={setReading} />
      {opened && village && (
        <NoticeBoard
          key={`${opened.slot}/${village.slug}`}
          slot={opened.slot}
          village={village}
          hunters={world?.hunters.filter((h) => h.slot === opened.slot && h.village === village.slug) ?? []}
          onClose={() => setOpened(undefined)}
        />
      )}
      {hunter && (
        <Journal
          key={hunter.id}
          hunter={hunter}
          contractTitle={hunterVillage?.contracts.find((c) => c.id === hunter.contract)?.title}
          villageTitle={hunterVillage?.title ?? hunter.village}
          onClose={() => setReading(undefined)}
        />
      )}
      {world && !connected && (
        <p className="notice" role="status">
          The road to the server is cut. Reconnecting…
        </p>
      )}
    </main>
  )
}
