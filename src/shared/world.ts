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

/**
 * How far a hunter may go without asking you, passed to `claude --permission-mode`:
 * `default` asks before every tool, `acceptEdits` edits files freely and asks for the rest,
 * `auto` lets Claude judge what is safe, and `bypassPermissions` never asks.
 */
export const PERMISSION_MODES = ["default", "acceptEdits", "auto", "bypassPermissions"] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * Where a hunter is, read from its session's stream-json: `riding-out` until the session
 * first answers, `hunting` while it works, `awaiting-you` while it asks you something or
 * waits on a permission, `returned-trophy` once its contract's commit lands (done or pending
 * sign-off), and `returned-wounded` when its turn ends without one.
 */
export const HUNTER_STATES = ["riding-out", "hunting", "awaiting-you", "returned-trophy", "returned-wounded"] as const

export type HunterState = (typeof HUNTER_STATES)[number]

/** A hunter back in its village, trophy or wound, no longer holds the village. */
export function isReturned(hunter: Pick<Hunter, "state">): boolean {
  return hunter.state === "returned-trophy" || hunter.state === "returned-wounded"
}

/**
 * One line of a hunter's journal, read from its session's stream-json as it arrives: what was
 * sent to the session (`you`: the opening command and every reply), what it said, each tool it
 * called with the gist of its input, and the result that closes each turn.
 */
export type JournalEntry =
  | { kind: "you"; text: string }
  | { kind: "said"; text: string }
  | { kind: "tool"; tool: string; input: string }
  | { kind: "result"; text: string; error: boolean }

/** A Claude Code session Guslar started on a contract, while its process runs. */
export type Hunter = {
  /** Given to the session as `GUSLAR_HUNTER_ID`, so its hooks and stream join up. */
  id: string
  name: string
  /** The region, village and contract it rides for. */
  slot: RegionSlot
  village: string
  contract: string
  permissionMode: PermissionMode
  state: HunterState
  /** The conversation so far, oldest first. */
  journal: JournalEntry[]
  /** The last event its session's hooks posted, once one has. */
  lastHook?: HookSighting
}

/** A hook event as the map sees it: which event, and the tool it is about, if any. */
export type HookSighting = { event: string; tool?: string }

/** What the server broadcasts to every open map. Slots are always in REGION_SLOTS order. */
export type WorldState = { slots: SlotState[]; hunters: Hunter[] }

/** What a map posts to `/api/hunters` to send a hunter on a ready contract. */
export type TakeRequest = { slot: RegionSlot; village: string; contract: string; permissionMode: PermissionMode }

/** What a map posts to `/api/hunters/<id>/replies` to write to a hunter in its journal. */
export type ReplyRequest = { text: string }

/**
 * What Guslar's hook posts to `/api/hooks`: the event as Claude Code gave it on the hook's stdin,
 * and the hunter whose session it came from, when the session is one Guslar started.
 */
export type HookRequest = {
  hunterId?: string
  input: { hook_event_name?: unknown; tool_name?: unknown; session_id?: unknown } & Record<string, unknown>
}

/** A village takes one hunter at a time; this is what it says to a second one. */
export function refusalOf(village: Pick<Village, "title">, holder: Pick<Hunter, "name" | "contract">): string {
  return `${village.title} refuses a second hunter: ${holder.name} is out on ${holder.contract}.`
}

export type ServerMessage = { type: "world"; world: WorldState }

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value)
}

export function isRegionSlot(value: unknown): value is RegionSlot {
  return typeof value === "string" && (REGION_SLOTS as readonly string[]).includes(value)
}
