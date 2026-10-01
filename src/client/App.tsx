import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useState } from "react"
import { EVERYONE, Journal } from "./Journal.js"
import { Margin } from "./Margin.js"
import { NoticeBoard } from "./NoticeBoard.js"
import { Prompts } from "./Prompts.js"
import { RegionRites } from "./RegionRites.js"
import { useWorld, type Connection } from "./useWorld.js"
import { WorldMap, type VillageRef } from "./WorldMap.js"
import { boundOf } from "./bound.js"
import { pageTheme } from "./art.js"
import { useWords, WORDS, WordsProvider } from "./words/index.js"
import { THEME_TABS, type Theme } from "../shared/theme.js"
import type { Hunter, RegionSlot } from "../shared/world.js"

// The terminal brings a whole terminal emulator, so it loads only once one is opened.
const TerminalView = lazy(() => import("./TerminalView.js").then((module) => ({ default: module.TerminalView })))

/**
 * The map in its world's theme, words, art, colours and tab alike: the theme the server served the
 * page in until the broadcast names one, and the broadcast's after, so a Guslar restarted on
 * another theme redraws an open map in it rather than mixing the two.
 */
export function App() {
  const connection = useWorld()
  const theme = connection.world?.theme ?? pageTheme()
  useLayoutEffect(() => showTheme(theme), [theme])
  return (
    <WordsProvider value={WORDS[theme]}>
      <Page {...connection} theme={theme} />
    </WordsProvider>
  )
}

/** Puts the theme on the page's root, where its colours come from, and on its tab. */
function showTheme(theme: Theme): void {
  const root = document.documentElement
  if (root.dataset.theme === theme) return
  root.dataset.theme = theme
  const { title, icon } = THEME_TABS[theme]
  document.title = title
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link) {
    link.type = icon.type
    link.href = icon.href
  }
}

/**
 * The hunters in the order they stand down the map, which only the map knows: the order the margin
 * stands its leaves in, and the order the chronicle's index turns through, so the two read alike.
 * A hunter the map has not placed yet keeps the world's own order, at the foot.
 */
function standing(hunters: Hunter[], order: string[]): Hunter[] {
  const place = (id: string) => {
    const at = order.indexOf(id)
    return at === -1 ? order.length : at
  }
  return [...hunters].sort((one, other) => place(one.id) - place(other.id))
}

function Page({ world, connected, heard, told, theme }: Connection & { theme: Theme }) {
  const words = useWords()
  const [opened, setOpened] = useState<VillageRef>()
  const [reading, setReading] = useState<string>()
  const [watching, setWatching] = useState<string>()
  const [glancing, setGlancing] = useState<string>()
  const [performing, setPerforming] = useState<RegionSlot>()
  // The order the hunters stand in down the map, which only the map knows.
  const [order, setOrder] = useState<string[]>([])
  const onHunterOrder = useCallback((ids: string[]) => {
    setOrder((was) => (was.length === ids.length && was.every((id, at) => id === ids[at]) ? was : ids))
  }, [])
  const hunters = useMemo(() => standing(world?.hunters ?? [], order), [world?.hunters, order])

  // The board follows the live world; it goes when its village does.
  const region = world?.slots.find((slot) => slot.slot === opened?.slot)
  const village = region?.kind === "region" ? region.villages.find((v) => v.slug === opened?.slug) : undefined

  // So do a region's rites: they go when the region does.
  const riteRegion = world?.slots.find((slot) => slot.slot === performing)

  // So does the journal: it goes when its hunter leaves the map.
  const hunter = world?.hunters.find((h) => h.id === reading)

  // Turned to everyone, it stands as long as there is more than one hunter to read. With one left
  // the chronicle closes itself, rather than being taken from under the page here: closed, it stays
  // closed, where a chronicle merely hidden would stand again the next time a hunter rode out.
  const everyone = reading === EVERYONE

  // And the terminal: it goes when its hunter does, and the server hangs it up.
  const terminalHunter = world?.hunters.find((h) => h.id === watching)

  // And the mark an open leaf puts on the map: it goes with the hunter whose leaf it was.
  const glanced = world?.hunters.some((h) => h.id === glancing) ? glancing : undefined

  return (
    <main>
      <h1 className="visually-hidden">{words.app.heading}</h1>
      {/* Painted anew in another theme's art, over the colours showTheme has put on the root by then. */}
      <WorldMap
        key={theme}
        theme={theme}
        world={world}
        onOpenVillage={setOpened} onOpenHunter={setReading} onOpenRegion={setPerforming}
        onHunterOrder={onHunterOrder} glanced={glanced} />
      {world && <Prompts world={world} />}
      <Margin hunters={hunters} heard={heard} open={glanced} onOpen={setGlancing} onRead={setReading} />
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
      {world && (hunter || everyone) && (
        <Journal
          hunter={hunter}
          hunters={hunters}
          told={told}
          bound={hunter && boundOf(words, world, hunter)}
          onTurn={setReading}
          onOpenTerminal={() => hunter && setWatching(hunter.id)}
          onClose={() => setReading(undefined)}
        />
      )}
      {terminalHunter && (
        // Its own key: it is made anew for each hunter, where the chronicle beside it is turned.
        <Suspense key={`terminal/${terminalHunter.id}`}>
          <TerminalView
            hunter={terminalHunter}
            besideJournal={Boolean(hunter) || everyone}
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
