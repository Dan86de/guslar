import { useEffect, useMemo, useState } from "react"
import { heardLast, latestWords, type Heard } from "./heard.js"
import { plain } from "./markdown.js"
import type { Hunter } from "../shared/world.js"
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
 * Pointed at, or reached with the keyboard, the leaf opens: the clamp goes, so it says the whole
 * of those words, and it offers the one thing to be done from a glance, which is to read the
 * hunter's journal. The leaf itself is the tab stop, so the offer is reached by the keyboard the
 * same way it is found by the pointer, rather than only appearing for one of the two.
 *
 * The parse is memoised on the text: a leaf is drawn again on every world update and on every turn
 * of the clock, and a hunter's words never change once they have arrived.
 */
function Leaf({
  hunter,
  heard,
  now,
  marked,
  open,
  onOpen,
  onClose,
  onRead,
}: {
  hunter: Hunter
  heard: Heard | undefined
  now: number
  marked: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  onRead: () => void
}) {
  const words = useWords()
  const text = latestWords(hunter)?.text
  const glance = useMemo(() => (text === undefined ? undefined : plain(text)), [text])
  return (
    <article
      className="leaf"
      tabIndex={0}
      data-state={hunter.state}
      data-marked={marked || undefined}
      data-open={open || undefined}
      // On the pointer moving onto the leaf, not on it merely being uncovered: closing something
      // over the margin leaves the pointer where it was, and nothing a user did opens a leaf there.
      onPointerMove={onOpen}
      onPointerLeave={onClose}
      onFocus={onOpen}
      // Focus moving to the leaf's own button is focus still inside the leaf, so it stays open.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose()
      }}
    >
      <p className="leaf-who">
        {hunter.name}
        {marked && <span className="visually-hidden">{words.margin.latest}</span>}
      </p>
      <p className="leaf-when">{ago(words, now - (heard?.at ?? now))}</p>
      <p className="leaf-words" data-silent={glance === undefined || undefined}>
        {glance ?? words.margin.silent}
      </p>
      {open && (
        <p className="leaf-act">
          <button type="button" className="leaf-read" onClick={onRead}>
            {words.margin.read(hunter.name)}
          </button>
        </p>
      )}
    </article>
  )
}

/**
 * The margin: a leaf for every hunter on the map, down its right edge. The leaves stand in the
 * order their hunters stand down the map, which the page hands it, so the margin reads the way
 * the map reads; recency is carried by a mark on the leaf heard last instead of by the order.
 *
 * Which leaf is open is the page's, not the margin's: the map marks that hunter's figure for as
 * long as it is, so a glance at a leaf says on the world which hunter it is about.
 */
export function Margin({
  hunters,
  heard,
  open,
  onOpen,
  onRead,
}: {
  /** Every hunter on the map, in the order they stand down it. */
  hunters: Hunter[]
  heard: Map<string, Heard>
  /** The hunter whose leaf is open, if any. */
  open: string | undefined
  /** Says which hunter's leaf is open now, or none. */
  onOpen: (id: string | undefined) => void
  /** Reads a hunter's journal, by the hunter's id. */
  onRead: (id: string) => void
}) {
  const words = useWords()
  const now = useClock()
  if (hunters.length === 0) return null

  const marked = heardLast(heard)

  return (
    <section className="margin" aria-label={words.margin.leaves}>
      {hunters.map((hunter) => (
        <Leaf
          key={hunter.id}
          hunter={hunter}
          heard={heard.get(hunter.id)}
          now={now}
          marked={hunter.id === marked}
          open={hunter.id === open}
          onOpen={() => onOpen(hunter.id)}
          // The pointer leaves one leaf before it enters the next, so a leaf closes only its own.
          onClose={() => {
            if (hunter.id === open) onOpen(undefined)
          }}
          onRead={() => onRead(hunter.id)}
        />
      ))}
    </section>
  )
}
