import type { Hunter, JournalEntry } from "../shared/world.js"

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

/**
 * The order this map heard each entry of each hunter's journal in: one running number per entry of
 * that hunter's journal, by its id.
 *
 * The broadcast is one state of the world and carries no clock, so the only order across hunters a
 * map can tell is the order their words arrived here. Entries already there when the map opened
 * all arrived at once, and keep the order the world listed their hunters in.
 */
export function toldFrom(was: Map<string, number[]>, hunters: Hunter[]): Map<string, number[]> {
  // Each hunter's numbers run upwards, so the last of them is the highest it holds.
  let told = 0
  for (const seqs of was.values()) told = Math.max(told, seqs[seqs.length - 1] ?? 0)
  const next = new Map<string, number[]>()
  let moved = was.size !== hunters.length
  for (const hunter of hunters) {
    const before = was.get(hunter.id)
    if (before && before.length === hunter.journal.length) {
      next.set(hunter.id, before)
      continue
    }
    const seqs = before ? before.slice(0, hunter.journal.length) : []
    while (seqs.length < hunter.journal.length) {
      told += 1
      seqs.push(told)
    }
    next.set(hunter.id, seqs)
    moved = true
  }
  return moved ? next : was
}

/** One line of the stream of everyone: who said it, and which of its journal's entries it is. */
export type Turn = { hunter: Hunter; entry: JournalEntry; told: number }

/**
 * Everyone's turns in one stream, in the order this map heard them: what you wrote to each hunter
 * and what each hunter said back, and nothing else. A tool call and the end of a turn are a
 * hunter's own work, read on its own page beside the words that called them; here they would say
 * nothing about whose turn they were.
 */
export function everyoneSaid(hunters: Hunter[], told: Map<string, number[]>): Turn[] {
  const stream: Turn[] = []
  for (const hunter of hunters) {
    const seqs = told.get(hunter.id) ?? []
    hunter.journal.forEach((entry, at) => {
      if (entry.kind === "you" || entry.kind === "said") stream.push({ hunter, entry, told: seqs[at] ?? at })
    })
  }
  return stream.sort((one, other) => one.told - other.told)
}
