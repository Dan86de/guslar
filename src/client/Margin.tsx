import { useEffect, useMemo, useState } from "react"
import { heardLast, latestWords, type Heard } from "./heard.js"
import { plain } from "./markdown.js"
import type { Hunter, WorldState } from "../shared/world.js"
import { useWords, type Words } from "./words/index.js"

/** How often the leaves say again how long ago their hunters spoke, in ms. */
const CLOCK_MS = 20_000

/** How long ago a hunter spoke, as its leaf says it: coarser the longer it has been. */
function ago(words: Words, since: number): string {
  const minutes = Math.floor(Math.max(0, since) / 60_000)
  if (minutes < 1) return words.margin.ago.justNow
  if (minutes < 60) return words.margin.ago.minutes(minutes)
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? words.margin.ago.hours(hours) : words.margin.ago.days(Math.floor(hours / 24))
}

/** The map's own clock, which moves the leaves on from `just now` without a word from the server. */
function useClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(clock)
  }, [])
  return now
}

/**
 * One hunter's leaf: its name, how long ago it spoke, and its latest words clamped to two lines.
 * The words are the plain text of what it said, since a glance has no room for the shape the
 * journal sets them in, and the marks it wrote them with read no better here than there.
 *
 * The parse is memoised on the text: a leaf is drawn again on every world update and on every turn
 * of the clock, and a hunter's words never change once they have arrived.
 */
function Leaf({ hunter, heard, now, marked }: { hunter: Hunter; heard: Heard | undefined; now: number; marked: boolean }) {
  const words = useWords()
  const text = latestWords(hunter)?.text
  const glance = useMemo(() => (text === undefined ? undefined : plain(text)), [text])
  return (
    <article className="leaf" data-state={hunter.state} data-marked={marked || undefined}>
      <p className="leaf-who">
        {hunter.name}
        {marked && <span className="visually-hidden">{words.margin.latest}</span>}
      </p>
      <p className="leaf-when">{ago(words, now - (heard?.at ?? now))}</p>
      <p className="leaf-words" data-silent={glance === undefined || undefined}>
        {glance ?? words.margin.silent}
      </p>
    </article>
  )
}

/**
 * The margin: a leaf for every hunter on the map, down its right edge. The leaves stand in the
 * order their hunters stand down the map, which the map itself reports, so the margin reads the
 * way the map reads; recency is carried by a mark on the leaf heard last instead of by the order.
 */
export function Margin({ world, heard, order }: { world: WorldState; heard: Map<string, Heard>; order: string[] }) {
  const words = useWords()
  const now = useClock()
  if (world.hunters.length === 0) return null

  // A hunter the map has not placed yet keeps the world's own order, at the foot of the margin.
  const place = (id: string) => {
    const at = order.indexOf(id)
    return at === -1 ? order.length : at
  }
  const leaves = [...world.hunters].sort((one, other) => place(one.id) - place(other.id))
  const marked = heardLast(heard)

  return (
    <section className="margin" aria-label={words.margin.leaves}>
      {leaves.map((hunter) => (
        <Leaf key={hunter.id} hunter={hunter} heard={heard.get(hunter.id)} now={now} marked={hunter.id === marked} />
      ))}
    </section>
  )
}
