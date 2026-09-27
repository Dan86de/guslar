export const REGION_SLOTS = ["forest", "marsh", "mountains", "river-town", "mines", "ruins"] as const

export type RegionSlot = (typeof REGION_SLOTS)[number]

/** The user's world.json: which repo sits in which painted slot. */
export type World = { regions: { slot: RegionSlot; repo: string; name?: string }[] }

export type SlotState =
  | { slot: RegionSlot; kind: "region"; name: string; repo: string }
  | { slot: RegionSlot; kind: "fog" }

/** What the server broadcasts to every open map. Slots are always in REGION_SLOTS order. */
export type WorldState = { slots: SlotState[] }

export type ServerMessage = { type: "world"; world: WorldState }

export function isRegionSlot(value: unknown): value is RegionSlot {
  return typeof value === "string" && (REGION_SLOTS as readonly string[]).includes(value)
}
