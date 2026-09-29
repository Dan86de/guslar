import { lazy, Suspense, useState } from "react"
import { Journal } from "./Journal.js"
import { NoticeBoard } from "./NoticeBoard.js"
import { Prompts } from "./Prompts.js"
import { RegionRites } from "./RegionRites.js"
import { useWorld, type Connection } from "./useWorld.js"
import { WorldMap, type VillageRef } from "./WorldMap.js"
import { boundOf } from "./bound.js"
import { useWords, WORDS, WordsProvider } from "./words/index.js"
import { DEFAULT_THEME } from "../shared/theme.js"
import type { RegionSlot } from "../shared/world.js"

// The terminal brings a whole terminal emulator, so it loads only once one is opened.
const TerminalView = lazy(() => import("./TerminalView.js").then((module) => ({ default: module.TerminalView })))

/** The map, speaking its world's theme: Guslar's words until the first broadcast names another. */
export function App() {
  const connection = useWorld()
  return (
    <WordsProvider value={WORDS[connection.world?.theme ?? DEFAULT_THEME]}>
      <Page {...connection} />
    </WordsProvider>
  )
}

function Page({ world, connected }: Connection) {
  const words = useWords()
  const [opened, setOpened] = useState<VillageRef>()
  const [reading, setReading] = useState<string>()
  const [watching, setWatching] = useState<string>()
  const [performing, setPerforming] = useState<RegionSlot>()

  // The board follows the live world; it goes when its village does.
  const region = world?.slots.find((slot) => slot.slot === opened?.slot)
  const village = region?.kind === "region" ? region.villages.find((v) => v.slug === opened?.slug) : undefined

  // So do a region's rites: they go when the region does.
  const riteRegion = world?.slots.find((slot) => slot.slot === performing)

  // So does the journal: it goes when its hunter leaves the map.
  const hunter = world?.hunters.find((h) => h.id === reading)

  // And the terminal: it goes when its hunter does, and the server hangs it up.
  const terminalHunter = world?.hunters.find((h) => h.id === watching)

  return (
    <main>
      <h1 className="visually-hidden">{words.app.heading}</h1>
      <WorldMap world={world} onOpenVillage={setOpened} onOpenHunter={setReading} onOpenRegion={setPerforming} />
      {world && <Prompts world={world} />}
      {opened && village && (
        <NoticeBoard
          key={`${opened.slot}/${village.slug}`}
          slot={opened.slot}
          village={village}
          hunters={world?.hunters.filter((h) => h.slot === opened.slot && h.village === village.slug) ?? []}
          onClose={() => setOpened(undefined)}
        />
      )}
      {riteRegion?.kind === "region" && (
        <RegionRites
          key={riteRegion.slot}
          slot={riteRegion.slot}
          name={riteRegion.name}
          // An outside session not on a contract stands by the plaque, but performs none of its rites.
          hunters={world?.hunters.filter((h) => h.slot === riteRegion.slot && h.village === undefined && !h.outside) ?? []}
          onClose={() => setPerforming(undefined)}
        />
      )}
      {world && hunter && (
        <Journal
          key={hunter.id}
          hunter={hunter}
          bound={boundOf(words, world, hunter)}
          onOpenTerminal={() => setWatching(hunter.id)}
          onClose={() => setReading(undefined)}
        />
      )}
      {terminalHunter && (
        // Its own key: a sibling keyed like the journal would be taken for it.
        <Suspense key={`terminal/${terminalHunter.id}`}>
          <TerminalView
            hunter={terminalHunter}
            besideJournal={Boolean(hunter)}
            onClose={() => setWatching(undefined)}
          />
        </Suspense>
      )}
      {world && !connected && (
        <p className="notice" role="status">
          {words.app.reconnecting}
        </p>
      )}
    </main>
  )
}
