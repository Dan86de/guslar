export const REGION_SLOTS = ["forest", "marsh", "mountains", "river-town", "mines", "ruins"] as const

export type RegionSlot = (typeof REGION_SLOTS)[number]

/** The user's world.json: which repo sits in which painted slot. */
export type World = { regions: { slot: RegionSlot; repo: string; name?: string }[] }

export type Autonomy = "afk" | "hitl"

/**
 * A contract's state, read from the trailers on `slices/<slug>`: `Slice: <id>` is done,
 * `Slice-Pending: <id>` is pending, and otherwise it is ready once every contract it is
 * blocked by is done, or sealed until then.
 */
export type ContractState = "done" | "pending" | "ready" | "sealed"

/** One slice of a spec, pinned to its village's notice board. */
export type Contract = {
  id: string
  title: string
  autonomy: Autonomy
  state: ContractState
  /** The contracts it is blocked by that are not done yet; only a sealed contract has them. */
  sealedBy?: string[]
}

/**
 * How far a village's spec has come: `bounty-drafted` has a spec and no slices file,
 * `contracts-posted` has a slices file, and `cleared` has every one of its contracts done.
 */
export type VillageStage = "bounty-drafted" | "contracts-posted" | "cleared"

/** One spec in a region's `.scratch/specs/`. */
export type Village = {
  slug: string
  /** The spec's first `# ` heading, or its slug when it has none. */
  title: string
  stage: VillageStage
  /** The spec, relative to the repo. */
  spec: string
  /** The slices file, relative to the repo, when there is one. */
  slices?: string
  /** Why the slices file could not be read, when it could not. */
  problem?: string
  contracts: Contract[]
}

export type SlotState =
  | { slot: RegionSlot; kind: "region"; name: string; repo: string; villages: Village[] }
  | { slot: RegionSlot; kind: "fog" }

/** What the server broadcasts to every open map. Slots are always in REGION_SLOTS order. */
export type WorldState = { slots: SlotState[] }

export type ServerMessage = { type: "world"; world: WorldState }

export function isRegionSlot(value: unknown): value is RegionSlot {
  return typeof value === "string" && (REGION_SLOTS as readonly string[]).includes(value)
}
