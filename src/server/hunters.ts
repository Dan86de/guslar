import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { Hunter, SlotState, TakeRequest } from "../shared/world.js"
import { refusalOf } from "../shared/world.js"

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

/** A stream-json user message, one line on the hunter's stdin. */
function userMessage(text: string): string {
  return `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } })}\n`
}

/**
 * The hunters out in the world: one `claude` process each, started in its region's repo on
 * one ready contract, with its id in `GUSLAR_HUNTER_ID`. A village takes one hunter at a time.
 * A hunter is out while its process runs.
 */
export class Hunters {
  private readonly out = new Map<string, { hunter: Hunter; process: ChildProcessWithoutNullStreams }>()
  private readonly listeners = new Set<() => void>()

  /** `claude` is the program each hunter runs: `GUSLAR_CLAUDE`, or `claude` on the PATH. */
  constructor(private readonly claude: string) {}

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

    const holder = this.list().find((h) => h.slot === request.slot && h.village === request.village)
    if (holder) return { status: 409, error: refusalOf(village, holder) }
    if (contract.state !== "ready") {
      return { status: 409, error: `${contract.id} of ${village.title} is ${contract.state}, not ready to take.` }
    }

    const hunter: Hunter = {
      id: randomUUID(),
      name: this.freeName(),
      slot: request.slot,
      village: village.slug,
      contract: contract.id,
      permissionMode: request.permissionMode,
    }

    const child = spawn(this.claude, claudeArgs(request.permissionMode), {
      cwd: region.repo,
      env: { ...process.env, GUSLAR_HUNTER_ID: hunter.id },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined))
      child.once("error", resolve)
    })
    if (started) return { status: 502, error: `Could not start ${this.claude}: ${started.message}` }

    // The stream is read by the journal later; until then it is drained so claude never blocks on it.
    child.stdout.resume()
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
