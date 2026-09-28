import type { HunterState } from "../shared/world.js"

/** A hunter's state in words, as the map's list and the journal say it. */
export const HUNTER_STATE_NAMES: Record<HunterState, string> = {
  "riding-out": "riding out",
  hunting: "hunting",
  "awaiting-you": "awaiting you",
  "returned-trophy": "returned with a trophy",
  "returned-wounded": "returned wounded",
}
