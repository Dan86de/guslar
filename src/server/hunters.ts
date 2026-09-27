import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"
import type { ContractState, Hunter, HunterState, SlotState, TakeRequest } from "../shared/world.js"
import { isReturned, refusalOf } from "../shared/world.js"

/** Names handed out in order, the first one no hunter out is using. Original, from Slavic naming, none from the Witcher. */
const NAMES = [
  "Wojmir",
  "Bogna",
  "Dobromir",
  "Jaromila",
  "Radzim",
  "Wiesława",
  "Sulimir",
  "Dobrawa",
  "Ratibor",
  "Zlata",
  "Mściwoj",
  "Bolesta",
]

/** What a take came to: the hunter sent out, or why none was, with the HTTP status that says so. */
export type TakeResult = { hunter: Hunter } | { status: number; error: string }

/** The arguments every hunter's `claude` runs with: headless, stream-json both ways, one process across turns. */
export function claudeArgs(permissionMode: Hunter["permissionMode"]): string[] {
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    permissionMode,
  ]
}

/** Reads a hunter's contract as it stands in its repo now, or undefined when it is gone. */
export type ContractLookup = (hunter: Hunter) => Promise<ContractState | undefined>

/** A contract whose commit has landed: done, or pending the user's sign-off. */
function paid(state: ContractState | undefined): boolean {
  return state === "done" || state === "pending"
}

type StreamMessage = {
  type?: unknown
  subtype?: unknown
  message?: { content?: unknown }
  request?: { subtype?: unknown }
}

/** The tool whose call means the session is asking you a question. */
const ASK_TOOL = "AskUserQuestion"

/**
 * What one stream-json line from a hunter's claude does to its state, or `"turn-ended"` for
 * the `result` that closes a turn, whose outcome depends on the repo. Lines that say nothing
 * about the hunt (hooks, init, rate limits, thinking tokens) leave it where it is.
 */
export function afterMessage(state: HunterState, message: StreamMessage): HunterState | "turn-ended" {
  if (state === "returned-trophy") return state
  switch (message.type) {
    case "assistant": {
      const content = Array.isArray(message.message?.content) ? (message.message.content as unknown[]) : []
      const asks = content.some(
        (block) =>
          typeof block === "object" &&
          block !== null &&
          (block as { type?: unknown }).type === "tool_use" &&
          (block as { name?: unknown }).name === ASK_TOOL,
      )
      return asks ? "awaiting-you" : "hunting"
    }
    case "control_request":
      return message.request?.subtype === "can_use_tool" ? "awaiting-you" : state
    case "user":
      // A tool's result: whatever it waited on has been answered.
      return "hunting"
    case "result":
      return "turn-ended"
    default:
      return state
  }
}

/** A stream-json user message, one line on the hunter's stdin. */
function userMessage(text: string): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } })}\n`
}

/**
 * The hunters out in the world: one `claude` process each, started in its region's repo on
 * one ready contract, with its id in `GUSLAR_HUNTER_ID`, and moved through its states by what
 * that process streams. A village takes one hunter at a time; one that has returned no longer
 * holds it. A hunter stays on the map while its process runs.
 */
export class Hunters {
  private readonly out = new Map<string, { hunter: Hunter; process: ChildProcessWithoutNullStreams }>()
  private readonly listeners = new Set<() => void>()

  /**
   * `claude` is the program each hunter runs: `GUSLAR_CLAUDE`, or `claude` on the PATH.
   * `lookup` reads a hunter's contract from its repo, to judge how it came back.
   */
  constructor(
    private readonly claude: string,
    private readonly lookup: ContractLookup,
  ) {}

  list(): Hunter[] {
    return [...this.out.values()].map((entry) => entry.hunter)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Sends a hunter on a ready contract of the world as it stands in `slots`, or says why not. */
  async take(request: TakeRequest, slots: SlotState[]): Promise<TakeResult> {
    const region = slots.find((slot) => slot.slot === request.slot)
    if (region?.kind !== "region") return { status: 404, error: `No region stands in the ${request.slot} slot.` }
    const village = region.villages.find((v) => v.slug === request.village)
    if (!village) return { status: 404, error: `${region.name} has no village ${request.village}.` }
    const contract = village.contracts.find((c) => c.id === request.contract)
    if (!village.slices || !contract) {
      return { status: 404, error: `${village.title} has no contract ${request.contract} posted.` }
    }

    const inVillage = this.list().filter((h) => h.slot === request.slot && h.village === request.village)
    const holder = inVillage.find((h) => !isReturned(h))
    if (holder) return { status: 409, error: refusalOf(village, holder) }
    if (contract.state !== "ready") {
      return { status: 409, error: `${contract.id} of ${village.title} is ${contract.state}, not ready to take.` }
    }

    const id = randomUUID()
    const child = spawn(this.claude, claudeArgs(request.permissionMode), {
      cwd: region.repo,
      env: { ...process.env, GUSLAR_HUNTER_ID: id },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined))
      child.once("error", resolve)
    })
    if (started) return { status: 502, error: `Could not start ${this.claude}: ${started.message}` }

    // A hunter back in this village makes way for the new one, and its name is free again.
    for (const returned of inVillage) this.dismiss(returned.id)
    const hunter: Hunter = {
      id,
      name: this.freeName(),
      slot: request.slot,
      village: village.slug,
      contract: contract.id,
      permissionMode: request.permissionMode,
      state: "riding-out",
    }

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    lines.on("line", (line) => this.heard(hunter.id, line))
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)))
    child.stdin.on("error", () => {}) // a claude that exits early closes its stdin under us
    child.once("exit", (code, signal) => {
      this.out.delete(hunter.id)
      if (code !== 0 && code !== null) {
        const last = stderr.trim().split("\n").pop()
        console.error(`guslar: ${hunter.name}'s claude exited with ${code}${last ? `: ${last}` : ""}`)
      } else if (signal) {
        console.error(`guslar: ${hunter.name}'s claude was stopped by ${signal}`)
      }
      this.changed()
    })

    child.stdin.write(userMessage(`/implement-slice ${village.slices} ${contract.id}`))
    this.out.set(hunter.id, { hunter, process: child })
    this.changed()
    return { hunter }
  }

  /**
   * Takes the world as the repos have it now: a hunter whose contract has been paid, done or
   * pending sign-off, has returned with its trophy. Says whether any hunter changed.
   */
  see(slots: SlotState[]): boolean {
    let changed = false
    for (const { hunter } of this.out.values()) {
      if (hunter.state === "returned-trophy") continue
      const region = slots.find((slot) => slot.slot === hunter.slot)
      if (region?.kind !== "region") continue
      const village = region.villages.find((v) => v.slug === hunter.village)
      const contract = village?.contracts.find((c) => c.id === hunter.contract)
      if (paid(contract?.state)) {
        hunter.state = "returned-trophy"
        changed = true
      }
    }
    return changed
  }

  /** One line of a hunter's stream-json, as its claude wrote it. */
  private heard(id: string, line: string): void {
    const entry = this.out.get(id)
    if (!entry) return
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      return // not stream-json: claude says nothing to the map outside it
    }
    if (typeof message !== "object" || message === null) return
    const next = afterMessage(entry.hunter.state, message)
    if (next === "turn-ended") {
      void this.cameBack(id)
      return
    }
    this.move(id, next)
  }

  /**
   * The turn is over: the hunter comes back with a trophy if its contract's commit has
   * landed, read from the repo now rather than from the last poll, or wounded if not.
   */
  private async cameBack(id: string): Promise<void> {
    const entry = this.out.get(id)
    if (!entry) return
    let state: ContractState | undefined
    try {
      state = await this.lookup(entry.hunter)
    } catch (error) {
      console.error(`guslar: could not read ${entry.hunter.name}'s contract: ${(error as Error).message}`)
    }
    this.move(id, paid(state) ? "returned-trophy" : "returned-wounded")
  }

  private move(id: string, state: HunterState): void {
    const hunter = this.out.get(id)?.hunter
    if (!hunter || hunter.state === state || hunter.state === "returned-trophy") return
    hunter.state = state
    this.changed()
  }

  /** Sends a returned hunter home: it leaves the map now, and its claude exits once its stdin ends. */
  private dismiss(id: string): void {
    const entry = this.out.get(id)
    if (!entry) return
    this.out.delete(id)
    entry.process.stdin.end()
  }

  /** Lets every hunter go: its stdin ends, so its claude finishes the turn it is on and exits. */
  close(): void {
    for (const { process } of this.out.values()) process.stdin.end()
  }

  private freeName(): string {
    const taken = new Set(this.list().map((h) => h.name))
    const free = NAMES.find((name) => !taken.has(name))
    if (free) return free
    let n = 2
    while (taken.has(`${NAMES[0]} ${n}`)) n++
    return `${NAMES[0]} ${n}`
  }

  private changed(): void {
    for (const listener of this.listeners) listener()
  }
}
