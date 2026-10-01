import type { Hunter } from "../shared/world.js"

/**
 * When a hunter was last heard: the time this map heard it, how late in the order it came, and
 * where its latest words stand in its journal, which is what tells the map it has spoken again.
 */
export type Heard = { at: number; turn: number; said: number }

/** A hunter's latest words, and where they stand in its journal, or nothing while it has said none. */
export function latestWords(hunter: Hunter): { at: number; text: string } | undefined {
  for (let at = hunter.journal.length - 1; at >= 0; at -= 1) {
    const entry = hunter.journal[at]
    if (entry?.kind === "said") return { at, text: entry.text }
  }
  return undefined
}

/**
 * When each hunter was last heard from, carried on from what was heard before this world arrived.
 *
 * The broadcast is one state of the world and carries no clock, so the only time a leaf can tell
 * is this map's own: the moment a hunter's latest words first arrived here. A map just opened
 * heard every hunter at once, and says so; `turn` keeps them in the order they were stamped, so
 * even then there is one hunter that was heard last.
 */
export function heardFrom(was: Map<string, Heard>, hunters: Hunter[], now: number): Map<string, Heard> {
  const next = new Map<string, Heard>()
  let turn = Math.max(0, ...[...was.values()].map((kept) => kept.turn))
  let moved = was.size !== hunters.length
  for (const hunter of hunters) {
    const said = latestWords(hunter)?.at ?? -1
    const before = was.get(hunter.id)
    if (before && before.said === said) {
      next.set(hunter.id, before)
      continue
    }
    turn += 1
    next.set(hunter.id, { at: now, turn, said })
    moved = true
  }
  return moved ? next : was
}

/** The hunter heard last of all, or nothing while none has been heard. */
export function heardLast(heard: Map<string, Heard>): string | undefined {
  let last: { id: string; turn: number } | undefined
  for (const [id, kept] of heard) if (!last || kept.turn > last.turn) last = { id, turn: kept.turn }
  return last?.id
}
