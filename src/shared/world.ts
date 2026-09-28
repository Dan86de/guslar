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
 * sign-off; done, for an inspection), and `returned-wounded` when its turn ends without one. A
 * rite with no contract returns with a trophy when its turn ends well, and wounded when it fails.
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

/**
 * The skill a hunter is sent with. `implement-slice` hunts a ready contract; the other rites are
 * performed from a village (`write-slices` posts its contracts, `sign-off` inspects the trophy of a
 * pending one) or from a region (`interview`, `write-spec`, `make-verify`).
 */
export const RITES = ["implement-slice", "interview", "write-spec", "write-slices", "make-verify", "sign-off"] as const

export type Rite = (typeof RITES)[number]

/** Where each rite is performed: on a contract, in a village, or in a region. */
export const RITE_GROUND: Record<Rite, "contract" | "village" | "region"> = {
  "implement-slice": "contract",
  "sign-off": "contract",
  "write-slices": "village",
  interview: "region",
  "write-spec": "region",
  "make-verify": "region",
}

/** Each rite as the world names it. */
export const RITE_NAMES: Record<Rite, string> = {
  "implement-slice": "Take the contract",
  interview: "Hear the villagers",
  "write-spec": "Draft the bounty",
  "write-slices": "Post contracts",
  "make-verify": "Set the proof of kill",
  "sign-off": "Inspect the trophy",
}

/** A Claude Code session Guslar started on a rite, while its process runs. */
export type Hunter = {
  /** Given to the session as `GUSLAR_HUNTER_ID`, so its hooks and stream join up. */
  id: string
  name: string
  /** The skill it was sent with. */
  rite: Rite
  /** The region it rides in, and the village and contract it rides for, when its rite has them. */
  slot: RegionSlot
  village?: string
  contract?: string
  permissionMode: PermissionMode
  state: HunterState
  /** The conversation so far, oldest first. */
  journal: JournalEntry[]
  /** The last event its session's hooks posted, once one has. */
  lastHook?: HookSighting
  /** The permission its session is waiting on you for, oldest first, while one is. */
  prompt?: PermissionPrompt
  /** The Claude Code session it runs, once the session has said so; "open in terminal" resumes it. */
  sessionId?: string
  /** The terminal its session was resumed in, once one was opened. */
  terminal?: HunterTerminal
}

/**
 * A terminal a hunter's session was resumed in: `open` while the `claude --resume` in it runs,
 * `ended` once it has exited, with its exit code.
 */
export type HunterTerminal = { state: "open" } | { state: "ended"; exitCode: number }

/** What a map sends down a hunter's terminal socket: keys typed, or the size it now shows. */
export type TerminalInput = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number }

/** What a hunter's terminal socket sends a map: what the terminal wrote, or that its session ended. */
export type TerminalOutput = { type: "output"; data: string } | { type: "ended"; exitCode: number }

/**
 * A permission a hunter's session asks for through its `PermissionRequest` hook: the tool and
 * the input it would run with, long strings cut short. It waits until you allow or deny it.
 */
export type PermissionPrompt = { id: string; tool: string; input: Record<string, unknown> }

/** Your answer to a permission prompt; a denial may carry words for the session. */
export type PermissionAnswer = { behavior: "allow" } | { behavior: "deny"; message?: string }

/** A hook event as the map sees it: which event, and the tool it is about, if any. */
export type HookSighting = { event: string; tool?: string }

/** What the server broadcasts to every open map. Slots are always in REGION_SLOTS order. */
export type WorldState = { slots: SlotState[]; hunters: Hunter[] }

/**
 * What a map posts to `/api/hunters` to send a hunter: on a ready contract when it names no rite,
 * or else on that rite, with the village and contract the rite is performed on.
 */
export type TakeRequest = {
  slot: RegionSlot
  rite?: Rite
  village?: string
  contract?: string
  permissionMode: PermissionMode
}

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

/** What Guslar answers the hook on a `PermissionRequest`: your decision, or none when there is none to give. */
export type HookReply = { heard: boolean; decision?: PermissionAnswer }

/** What a hunter is out for, as a phrase after "out": `on S3`, or `to post contracts`. */
export function errandOf(hunter: Pick<Hunter, "rite" | "contract">): string {
  switch (hunter.rite) {
    case "implement-slice":
      return `on ${hunter.contract ?? "a contract"}`
    case "sign-off":
      return `to inspect the trophy of ${hunter.contract ?? "a contract"}`
    default:
      return `to ${RITE_NAMES[hunter.rite].toLowerCase()}`
  }
}

/**
 * A village takes one hunter at a time, and so does a region for its own rites; this is what
 * either says to a second one.
 */
export function refusalOf(place: { title: string }, holder: Pick<Hunter, "name" | "rite" | "contract">): string {
  return `${place.title} refuses a second hunter: ${holder.name} is out ${errandOf(holder)}.`
}

export type ServerMessage = { type: "world"; world: WorldState }

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value)
}

export function isRite(value: unknown): value is Rite {
  return typeof value === "string" && (RITES as readonly string[]).includes(value)
}

export function isRegionSlot(value: unknown): value is RegionSlot {
  return typeof value === "string" && (REGION_SLOTS as readonly string[]).includes(value)
}
