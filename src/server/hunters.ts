import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { open } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline"
import { StringDecoder } from "node:string_decoder"
import type {
  Contract,
  ContractState,
  HookRequest,
  HookSighting,
  Hunter,
  HunterState,
  JournalEntry,
  PermissionAnswer,
  PermissionPrompt,
  Rite,
  SlotState,
  TakeRequest,
  Village,
} from "../shared/world.js"
import { isPermissionMode, isReturned, refusalOf, RITE_GROUND } from "../shared/world.js"
import { Terminal } from "./terminals.js"

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

/** What a reply came to: written to the hunter, or why not, with the HTTP status that says so. */
export type ReplyResult = { sent: JournalEntry } | { status: number; error: string }

/** What an answer to a prompt came to: given to the waiting hook, or why not, with the HTTP status that says so. */
export type AnswerResult = { answered: PermissionPrompt } | { status: number; error: string }

/**
 * What opening a hunter's terminal came to: the hunter with its terminal, `opened` when this
 * started it and not when it was already open, or why not, with the HTTP status that says so.
 */
export type TerminalResult = { hunter: Hunter; opened: boolean } | { status: number; error: string }

/** What sending a hunter home came to: the hunter that went, or why it stayed, with the HTTP status that says so. */
export type SendHomeResult = { hunter: Hunter } | { status: number; error: string }

/**
 * A permission request its hunter's hook is waiting on: `decision` settles with your answer, or
 * with none when the prompt goes unanswered (the hook gave up, or the hunter left the map), and
 * `withdraw` takes it back when the hook is no longer there to hear the answer.
 */
export type Asking = { decision: Promise<PermissionAnswer | undefined>; withdraw(): void }

type Pending = { prompt: PermissionPrompt; settle: (answer: PermissionAnswer | undefined) => void }

/** The longest string of a tool's input a prompt shows; a Write's whole file would swamp the map. */
const MAX_PROMPT_STRING = 4000

/** A tool's input as a prompt shows it: every string in it cut to MAX_PROMPT_STRING. */
function promptInput(input: unknown): Record<string, unknown> {
  const clipDeep = (value: unknown): unknown => {
    if (typeof value === "string") return clip(value, MAX_PROMPT_STRING)
    if (Array.isArray(value)) return value.map(clipDeep)
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, clipDeep(field)]))
    }
    return value
  }
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (clipDeep(input) as Record<string, unknown>)
    : {}
}

/** The arguments a hunter's session is resumed with in a terminal: interactive, in the permission mode it rode out with. */
export function resumeArgs(sessionId: string, permissionMode: Hunter["permissionMode"]): string[] {
  return ["--resume", sessionId, "--permission-mode", permissionMode]
}

/**
 * The arguments every hunter's `claude` runs with: headless, stream-json both ways, one process
 * across turns, and on the session it rode out with when it is called back after Guslar restarted.
 */
export function claudeArgs(permissionMode: Hunter["permissionMode"], resume?: string): string[] {
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    permissionMode,
    ...(resume ? ["--resume", resume] : []),
  ]
}

/** What the journal says of a turn cut short because Guslar stopped. */
export const CUT_SHORT = "Guslar stopped during this turn. Write to resume the session."

/** One hunter as Guslar keeps it on disk between runs: the hunter as the map had it, and the repo it was sent into. */
type Kept = { hunter: Hunter; repo: string }

/** How long a change waits before the roll is written, so a busy stream is not written line by line. */
const SAVE_DELAY = 200

/** Reads a hunter's contract as it stands in its repo now, or undefined when it is gone. */
export type ContractLookup = (hunter: Hunter) => Promise<ContractState | undefined>

/**
 * A contract whose rite is fulfilled: a hunt once its commit has landed, done or pending the
 * user's sign-off, and an inspection once the sign-off has made it done.
 */
function paid(rite: Rite | undefined, state: ContractState | undefined): boolean {
  return state === "done" || (rite === "implement-slice" && state === "pending")
}

/** A hunter back with its contract paid stays so, whatever its session says after. */
function settled(hunter: Hunter): boolean {
  return hunter.state === "returned-trophy" && hunter.contract !== undefined
}

/** Why a rite cannot be performed on what it names as the world stands, or undefined when it can. */
function unfitFor(rite: Rite, village: Village | undefined, contract: Contract | undefined): string | undefined {
  if (rite === "implement-slice" && contract && contract.state !== "ready") {
    return `${contract.id} of ${village?.title} is ${contract.state}, not ready to take.`
  }
  if (rite === "sign-off" && contract && contract.state !== "pending") {
    return `${contract.id} of ${village?.title} is ${contract.state}, not awaiting sign-off.`
  }
  if (rite === "write-slices" && village?.slices) return `${village.title} has its contracts posted already.`
  return undefined
}

/** The slash command a hunter opens its session with, which runs its rite's skill. */
function openingOf(rite: Rite, village: Village | undefined, contract: Contract | undefined): string {
  switch (rite) {
    case "implement-slice":
      return `/implement-slice ${village?.slices} ${contract?.id}`
    case "sign-off":
      return `/implement-slice ${village?.slices} --signoff ${contract?.id}`
    case "write-slices":
      return `/write-slices ${village?.spec}`
    default:
      return `/${rite}`
  }
}

type StreamMessage = {
  type?: unknown
  session_id?: unknown
  subtype?: unknown
  message?: { content?: unknown }
  request?: { subtype?: unknown }
  result?: unknown
  is_error?: unknown
}

/** A hook event as the map shows it: the event, and the tool it is about when it names one. */
function sightingOf(event: string, tool: unknown): HookSighting {
  return typeof tool === "string" && tool !== "" ? { event, tool } : { event }
}

/** The tool whose call means the session is asking you a question. */
const ASK_TOOL = "AskUserQuestion"

/** The most of one text a journal entry keeps, and of a tool call's input; longer ones are cut short. */
const MAX_TEXT = 8000
const MAX_INPUT = 400

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** The input fields that say what a tool call is about, most telling first. */
const GIST_FIELDS = ["command", "file_path", "path", "pattern", "url", "query", "skill", "prompt", "description"]

/** The gist of a tool call's input: its questions, or the command, path or pattern it names, or else its JSON. */
function gistOf(tool: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return ""
  const fields = input as Record<string, unknown>
  if (tool === ASK_TOOL && Array.isArray(fields.questions)) {
    const questions = (fields.questions as unknown[]).flatMap((q) => {
      const text = typeof q === "object" && q !== null ? (q as { question?: unknown }).question : undefined
      return typeof text === "string" ? [text] : []
    })
    if (questions.length > 0) return clip(questions.join(" "), MAX_INPUT)
  }
  for (const field of GIST_FIELDS) {
    const value = fields[field]
    if (typeof value === "string" && value.trim() !== "") return clip(value.trim(), MAX_INPUT)
  }
  return clip(JSON.stringify(input), MAX_INPUT)
}

/**
 * What one stream-json line from a hunter's claude adds to its journal: each text and tool call
 * of an assistant message, and the result that closes a turn. Tool results, thinking and the
 * session's own bookkeeping add nothing.
 */
export function journalOf(message: StreamMessage): JournalEntry[] {
  switch (message.type) {
    case "assistant": {
      const content = Array.isArray(message.message?.content) ? (message.message.content as unknown[]) : []
      return content.flatMap((block): JournalEntry[] => {
        if (typeof block !== "object" || block === null) return []
        const { type, text, name, input } = block as { type?: unknown; text?: unknown; name?: unknown; input?: unknown }
        if (type === "text" && typeof text === "string" && text.trim() !== "") {
          return [{ kind: "said", text: clip(text.trim(), MAX_TEXT) }]
        }
        if (type === "tool_use" && typeof name === "string") return [{ kind: "tool", tool: name, input: gistOf(name, input) }]
        return []
      })
    }
    case "result":
      return [
        {
          kind: "result",
          text: typeof message.result === "string" ? clip(message.result.trim(), MAX_TEXT) : "",
          error: message.is_error === true || message.subtype !== "success",
        },
      ]
    default:
      return []
  }
}

/**
 * What one stream-json line from a hunter's claude does to its state, or `"turn-ended"` for
 * the `result` that closes a turn, whose outcome depends on the repo. Lines that say nothing
 * about the hunt (hooks, init, rate limits, thinking tokens) leave it where it is.
 */
export function afterMessage(state: HunterState, message: StreamMessage): HunterState | "turn-ended" {
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

/**
 * The line `/implement-slice` opens its first reply with, naming the contract it took:
 * `Slice S3: Lay the plank road (also ready: S5)`.
 */
const SLICE_LINE = /^Slice (\S+): (.*)$/

/** The most of a session's transcript read at one go. */
const TRANSCRIPT_CHUNK = 1024 * 1024

/**
 * A session started outside Guslar, seen on the map through the hooks it runs: its hunter, its
 * transcript as far as it has been read, and what the user last asked it.
 */
type Outsider = {
  hunter: Hunter
  transcript?: { path: string; offset: number; decoder: StringDecoder; partial: string }
  /** The last prompt, which names the slices file when a contract's id alone does not say which. */
  prompt?: string
  /** Whether the session's next text is the first of its reply to a prompt, the one that names a contract. */
  firstReply: boolean
  /** Its hook events, taken one at a time, in the order they came. */
  queue: Promise<void>
}

/** A path as the filesystem has it, links followed, so a repo and a cwd inside it compare. */
function real(file: string): string {
  try {
    return realpathSync.native(file)
  } catch {
    return path.resolve(file)
  }
}

/** The region whose repo a session's working directory lies in, if any. */
function regionAt(cwd: unknown, slots: SlotState[]): Extract<SlotState, { kind: "region" }> | undefined {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) return undefined
  const at = real(cwd)
  for (const slot of slots) {
    if (slot.kind !== "region") continue
    const repo = real(slot.repo)
    if (at === repo || at.startsWith(`${repo}${path.sep}`)) return slot
  }
  return undefined
}

/** Whether a transcript's user line is a prompt, rather than a tool's result coming back. */
function isPrompt(message: { message?: { content?: unknown } }): boolean {
  const content = message.message?.content
  if (typeof content === "string") return true
  return (
    Array.isArray(content) &&
    content.some((block) => typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text")
  )
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
  private readonly out = new Map<
    string,
    {
      hunter: Hunter
      /** Its claude, while one runs; a hunter brought back after Guslar restarted has none until you write to it. */
      process?: ChildProcessWithoutNullStreams
      /** Its claude being started again on its session, while that is under way. */
      waking?: Promise<Error | undefined>
      /** The repo it was sent into, where its session is resumed too. */
      repo: string
      asking: Pending[]
      /** Its session resumed in a terminal, while that is being opened or once it has been. */
      terminal?: Promise<Terminal | Error>
    }
  >()
  /** The places, `<slot>/<village slug>`, a hunter is being sent to while its claude starts. */
  private readonly sending = new Set<string>()
  /** The sessions started outside Guslar, by their session id. */
  private readonly outsiders = new Map<string, Outsider>()
  private readonly listeners = new Set<() => void>()
  /** Where this Guslar listens, given to each hunter as `GUSLAR_URL` so its hooks can reach it. */
  private url: string | undefined
  /** The roll waiting to be written, while a change is. */
  private saving: NodeJS.Timeout | undefined
  /** Once Guslar is stopping, its hunters' claudes exit, and the roll keeps them as they were. */
  private closing = false

  /**
   * `claude` is the program each hunter runs: `GUSLAR_CLAUDE`, or `claude` on the PATH.
   * `lookup` reads a hunter's contract from its repo, to judge how it came back.
   * `roll` is the file Guslar's own hunters are kept in, so they are on the map again after it restarts.
   */
  constructor(
    private readonly claude: string,
    private readonly lookup: ContractLookup,
    private readonly roll?: string,
  ) {}

  /**
   * Brings back the hunters the roll kept, each in a region that still stands on the same repo and
   * with a session to resume. None has a claude running: a hunter that was out when Guslar stopped
   * comes back wounded, its turn cut short, and writing to it resumes its session.
   */
  restore(slots: SlotState[]): void {
    if (!this.roll) return
    let kept: unknown
    try {
      kept = JSON.parse(readFileSync(this.roll, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`guslar: could not read the hunters kept in ${this.roll}: ${(error as Error).message}`)
      }
      return
    }
    for (const { hunter, repo } of Array.isArray(kept) ? (kept as Partial<Kept>[]) : []) {
      if (typeof hunter?.id !== "string" || typeof hunter.sessionId !== "string" || typeof repo !== "string") continue
      if (this.out.has(hunter.id) || !Array.isArray(hunter.journal)) continue
      const region = slots.find((slot) => slot.slot === hunter.slot)
      if (region?.kind !== "region" || real(region.repo) !== real(repo)) continue
      delete hunter.prompt
      delete hunter.terminal
      delete hunter.lastHook
      if (!isReturned(hunter)) {
        hunter.state = "returned-wounded"
        hunter.journal.push({ kind: "result", text: CUT_SHORT, error: true })
      }
      if (this.list().some((h) => h.name === hunter.name)) hunter.name = this.freeName()
      this.out.set(hunter.id, { hunter, repo: region.repo, asking: [] })
    }
    this.see(slots)
    this.save()
  }

  /** Tells the hunters sent from now on where this Guslar listens. */
  listenAt(url: string): void {
    this.url = url
  }

  list(): Hunter[] {
    return [...this.out.values(), ...this.outsiders.values()].map((entry) => entry.hunter)
  }

  /** A hunter on the map by its id, Guslar's own or an outside one. */
  private find(id: string): Hunter | undefined {
    return this.out.get(id)?.hunter ?? this.outsiderOf(id)?.hunter
  }

  private outsiderOf(id: string): Outsider | undefined {
    for (const outsider of this.outsiders.values()) if (outsider.hunter.id === id) return outsider
    return undefined
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Sends a hunter on a rite, on a ready contract when the request names none, in the world as
   * it stands in `slots`, or says why not. A village takes one hunter at a time, and so does a
   * region for the rites performed in it rather than in one of its villages.
   */
  async take(request: TakeRequest, slots: SlotState[]): Promise<TakeResult> {
    const rite = request.rite ?? "implement-slice"
    const ground = RITE_GROUND[rite]
    const region = slots.find((slot) => slot.slot === request.slot)
    if (region?.kind !== "region") return { status: 404, error: `No region stands in the ${request.slot} slot.` }
    let village: Village | undefined
    let contract: Contract | undefined
    if (ground !== "region") {
      village = region.villages.find((v) => v.slug === request.village)
      if (!village) return { status: 404, error: `${region.name} has no village ${request.village ?? "named"}.` }
    }
    if (ground === "contract") {
      contract = village?.contracts.find((c) => c.id === request.contract)
      if (!village?.slices || !contract) {
        return { status: 404, error: `${village?.title} has no contract ${request.contract ?? "named"} posted.` }
      }
    }

    // An outside session holds a village once it is seen on one of its contracts, and never a region.
    const around = this.list().filter(
      (h) => h.slot === request.slot && h.village === village?.slug && !(h.outside && h.village === undefined),
    )
    const title = village?.title ?? region.name
    const holder = around.find((h) => !isReturned(h))
    if (holder) return { status: 409, error: refusalOf({ title }, holder) }
    // A hunter being sent holds its place too, while its claude starts.
    const place = `${request.slot}/${village?.slug ?? ""}`
    if (this.sending.has(place)) return { status: 409, error: `${title} refuses a second hunter: one is being sent already.` }
    const unfit = unfitFor(rite, village, contract)
    if (unfit) return { status: 409, error: unfit }
    this.sending.add(place)
    try {
      return await this.send(request, rite, region, village, contract, around)
    } finally {
      this.sending.delete(place)
    }
  }

  /** Starts a hunter's claude on a rite the world lets it take, and puts the hunter on the map. */
  private async send(
    request: TakeRequest,
    rite: Rite,
    region: Extract<SlotState, { kind: "region" }>,
    village: Village | undefined,
    contract: Contract | undefined,
    around: Hunter[],
  ): Promise<TakeResult> {
    const id = randomUUID()
    const child = await this.launch(id, region.repo, claudeArgs(request.permissionMode))
    if (child instanceof Error) return { status: 502, error: `Could not start ${this.claude}: ${child.message}` }

    // A hunter back in this village or region makes way for the new one, and its name is free again.
    for (const returned of around) this.dismiss(returned.id)
    const opening = openingOf(rite, village, contract)
    const hunter: Hunter = {
      id,
      name: this.freeName(),
      rite,
      slot: request.slot,
      ...(village ? { village: village.slug } : {}),
      ...(contract ? { contract: contract.id } : {}),
      permissionMode: request.permissionMode,
      state: "riding-out",
      journal: [{ kind: "you", text: opening }],
    }

    child.stdin.write(userMessage(opening))
    this.out.set(hunter.id, { hunter, process: child, repo: region.repo, asking: [] })
    this.changed()
    return { hunter }
  }

  /**
   * Starts a hunter's claude in its repo, with its id in `GUSLAR_HUNTER_ID`: what it streams moves
   * the hunter, and once it exits the hunter leaves the map. Says why when it cannot start.
   *
   * It runs in a process group of its own, so Ctrl-C or closing Guslar's terminal reaches Guslar
   * alone: Guslar keeps its hunters first, then ends each claude's stdin, and the claude finishes
   * the turn it is on and exits.
   */
  private async launch(id: string, repo: string, args: string[]): Promise<ChildProcessWithoutNullStreams | Error> {
    const child = spawn(this.claude, args, {
      cwd: repo,
      env: { ...process.env, GUSLAR_HUNTER_ID: id, ...(this.url ? { GUSLAR_URL: this.url } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    })
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined))
      child.once("error", resolve)
    })
    if (started) return started

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    lines.on("line", (line) => this.heard(id, line))
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)))
    child.stdin.on("error", () => {}) // a claude that exits early closes its stdin under us
    child.once("exit", (code, signal) => {
      const entry = this.out.get(id)
      if (entry?.process !== child) return
      const { name } = entry.hunter
      this.release(id)
      this.hangUp(id)
      this.out.delete(id)
      if (code !== 0 && code !== null) {
        const last = stderr.trim().split("\n").pop()
        console.error(`guslar: ${name}'s claude exited with ${code}${last ? `: ${last}` : ""}`)
      } else if (signal) {
        console.error(`guslar: ${name}'s claude was stopped by ${signal}`)
      }
      this.changed()
    })
    return child
  }

  /**
   * Writes what you typed in a hunter's journal to its session, as the next user message. A hunter
   * brought back after Guslar restarted has no claude running: its session is resumed for it first.
   */
  async reply(id: string, text: string): Promise<ReplyResult> {
    const entry = this.out.get(id)
    const outsider = this.outsiderOf(id)?.hunter
    if (outsider) return { status: 409, error: `${outsider.name} was started outside Guslar: write to it in its own terminal.` }
    if (!entry) return { status: 404, error: "No such hunter is out." }
    const trimmed = text.trim()
    if (trimmed === "") return { status: 400, error: "A reply needs words." }
    if (!entry.process) {
      const sessionId = entry.hunter.sessionId
      if (!sessionId) return { status: 409, error: `${entry.hunter.name} has no session to resume.` }
      entry.waking ??= this.launch(id, entry.repo, claudeArgs(entry.hunter.permissionMode, sessionId)).then((child) => {
        delete entry.waking
        if (child instanceof Error) return child
        if (this.out.get(id) === entry) entry.process = child
        else child.stdin.end() // sent home while it woke
        return undefined
      })
      const failed = await entry.waking
      if (failed) return { status: 502, error: `Could not resume ${entry.hunter.name}'s session: ${failed.message}` }
      if (this.out.get(id) !== entry) return { status: 404, error: "No such hunter is out." }
    }
    if (!entry.process?.stdin.writable) return { status: 409, error: `${entry.hunter.name} no longer listens.` }
    entry.process.stdin.write(userMessage(trimmed))
    const sent: JournalEntry = { kind: "you", text: trimmed }
    entry.hunter.journal.push(sent)
    this.changed()
    return { sent }
  }

  /**
   * Resumes a hunter's session in a terminal: `claude --resume <its session id>` in a
   * pseudo-terminal in its repo. A hunter has one terminal at a time: while it runs, opening it
   * again gives that one, and once it has ended, opening it starts another.
   *
   * The terminal's session is yours, not the hunter's: it runs without `GUSLAR_HUNTER_ID`, so
   * Guslar's hooks leave its permission requests to the terminal, where you are.
   */
  async openTerminal(id: string): Promise<TerminalResult> {
    const entry = this.out.get(id)
    const outsider = this.outsiderOf(id)?.hunter
    if (outsider) return { status: 409, error: `${outsider.name} was started outside Guslar, in a terminal of its own.` }
    if (!entry) return { status: 404, error: "No such hunter is out." }
    const { hunter } = entry
    const sessionId = hunter.sessionId
    if (!sessionId) return { status: 409, error: `${hunter.name}'s session has not begun yet.` }

    const previous = entry.terminal
    if (previous) {
      const terminal = await previous
      if (this.out.get(id) !== entry) return { status: 404, error: "No such hunter is out." }
      // Another open started a terminal while this one waited: that one is the hunter's.
      if (entry.terminal !== previous) return this.openTerminal(id)
      if (terminal instanceof Terminal && terminal.running) return { hunter, opened: false }
    }

    const env: NodeJS.ProcessEnv = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
    delete env.GUSLAR_HUNTER_ID
    if (this.url) env.GUSLAR_URL = this.url
    const opening = Terminal.open(
      { program: this.claude, args: resumeArgs(sessionId, hunter.permissionMode), cwd: entry.repo, env },
      (exitCode) => {
        if (this.out.get(id) !== entry || entry.terminal !== opening) return
        hunter.terminal = { state: "ended", exitCode }
        this.changed()
      },
    ).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
    entry.terminal = opening

    const terminal = await opening
    if (terminal instanceof Error) {
      if (entry.terminal === opening) delete entry.terminal
      return { status: 502, error: `Could not open a terminal for ${hunter.name}: ${terminal.message}` }
    }
    if (this.out.get(id) !== entry) {
      // The hunter left the map while its terminal opened.
      terminal.kill()
      return { status: 404, error: "No such hunter is out." }
    }
    hunter.terminal = { state: "open" }
    this.changed()
    return { hunter, opened: true }
  }

  /** The terminal a hunter's session was last resumed in, once it has opened. */
  async terminalOf(id: string): Promise<Terminal | undefined> {
    const terminal = await this.out.get(id)?.terminal
    return terminal instanceof Terminal ? terminal : undefined
  }

  /** Hangs up a hunter's terminal, if it has one. */
  private hangUp(id: string): void {
    void this.out
      .get(id)
      ?.terminal?.then((terminal) => {
        if (terminal instanceof Terminal) terminal.kill()
      })
  }

  /**
   * Takes a hook event a session posted, and says whether a hunter heard it. The hunter it names
   * shows it as its last. One naming no hunter comes from a session started outside Guslar: in a
   * registered repo, it is that session's hunter, made the first time the session is seen.
   */
  hooked(request: HookRequest, slots: SlotState[]): Promise<boolean> {
    if (request.hunterId === undefined) return this.sighted(request, slots)
    const entry = this.out.get(request.hunterId)
    const event = request.input.hook_event_name
    if (!entry || typeof event !== "string" || event === "") return Promise.resolve(false)
    entry.hunter.lastHook = sightingOf(event, request.input.tool_name)
    this.changed()
    return Promise.resolve(true)
  }

  /**
   * A hook event from a session Guslar did not start. Its first event in a registered repo puts it
   * on the map, bar its last ones (a notification, or its end); a hunter's own session, resumed in
   * a terminal, stays that hunter's. Its events are taken one at a time, in order.
   */
  private sighted(request: HookRequest, slots: SlotState[]): Promise<boolean> {
    const { input } = request
    const session = input.session_id
    const event = input.hook_event_name
    if (typeof session !== "string" || session === "" || typeof event !== "string" || event === "") {
      return Promise.resolve(false)
    }
    if ([...this.out.values()].some((entry) => entry.hunter.sessionId === session)) return Promise.resolve(false)
    let outsider = this.outsiders.get(session)
    if (!outsider) {
      if (event === "SessionEnd" || event === "Notification") return Promise.resolve(false)
      const region = regionAt(input.cwd, slots)
      if (!region) return Promise.resolve(false)
      outsider = {
        hunter: {
          id: randomUUID(),
          name: this.freeName(),
          outside: true,
          slot: region.slot,
          permissionMode: isPermissionMode(input.permission_mode) ? input.permission_mode : "default",
          state: "riding-out",
          journal: [],
          sessionId: session,
        },
        firstReply: true,
        queue: Promise.resolve(),
      }
      this.outsiders.set(session, outsider)
    }
    const seen = outsider
    const done = seen.queue.then(() => this.seenOutside(seen, event, input, slots))
    seen.queue = done.catch((error: unknown) => {
      console.error(`guslar: could not follow ${seen.hunter.name}: ${(error as Error).message}`)
    })
    return seen.queue.then(() => true)
  }

  /** What one hook event of an outside session does to its hunter: the same states a spawned one goes through. */
  private async seenOutside(outsider: Outsider, event: string, input: HookRequest["input"], slots: SlotState[]): Promise<void> {
    const { hunter } = outsider
    if (this.outsiders.get(hunter.sessionId ?? "") !== outsider) return
    hunter.lastHook = sightingOf(event, input.tool_name)
    if (isPermissionMode(input.permission_mode)) hunter.permissionMode = input.permission_mode
    await this.readTranscript(outsider, input.transcript_path, slots)
    switch (event) {
      case "UserPromptSubmit": {
        // A hunter back from its errand is on a new one: which contract, if any, its reply will say.
        if (isReturned(hunter)) {
          delete hunter.rite
          delete hunter.village
          delete hunter.contract
        }
        const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
        if (prompt !== "") {
          outsider.prompt = prompt
          hunter.journal.push({ kind: "you", text: clip(prompt, MAX_TEXT) })
        }
        outsider.firstReply = true
        hunter.state = "hunting"
        break
      }
      case "PreToolUse":
        this.move(hunter.id, input.tool_name === ASK_TOOL ? "awaiting-you" : "hunting")
        break
      case "PostToolUse":
        this.move(hunter.id, "hunting")
        break
      case "PermissionRequest":
        // Asked in its own terminal: the map shows it waits on you, and leaves the answer there.
        this.move(hunter.id, "awaiting-you")
        break
      case "Stop":
        hunter.journal.push({ kind: "result", text: "", error: false })
        await this.cameBack(hunter.id, false)
        break
      case "SessionEnd":
        this.outsiders.delete(hunter.sessionId ?? "")
        break
    }
    this.changed()
  }

  /**
   * Reads what an outside session's transcript gained since the last read: its texts and tool
   * calls go to the journal, and the first line of its reply to a prompt, when it names a
   * contract of its region, binds the hunter to that contract.
   */
  private async readTranscript(outsider: Outsider, file: unknown, slots: SlotState[]): Promise<void> {
    if (typeof file !== "string" || !path.isAbsolute(file) || !file.endsWith(".jsonl")) return
    if (outsider.transcript?.path !== file) {
      outsider.transcript = { path: file, offset: 0, decoder: new StringDecoder("utf8"), partial: "" }
    }
    const transcript = outsider.transcript
    const handle = await open(file, "r").catch(() => undefined)
    if (!handle) return
    try {
      const { size } = await handle.stat()
      if (size < transcript.offset) Object.assign(transcript, { offset: 0, decoder: new StringDecoder("utf8"), partial: "" })
      const chunk = Buffer.alloc(Math.min(TRANSCRIPT_CHUNK, Math.max(0, size - transcript.offset)))
      while (transcript.offset < size) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - transcript.offset), transcript.offset)
        if (bytesRead === 0) break
        transcript.offset += bytesRead
        const lines = (transcript.partial + transcript.decoder.write(chunk.subarray(0, bytesRead))).split("\n")
        transcript.partial = lines.pop() ?? ""
        for (const line of lines) this.readLine(outsider, line, slots)
      }
    } finally {
      await handle.close()
    }
  }

  /** One line of an outside session's transcript. */
  private readLine(outsider: Outsider, line: string, slots: SlotState[]): void {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (typeof message !== "object" || message === null) return
    const { type, isSidechain } = message as { type?: unknown; isSidechain?: unknown }
    if (isSidechain === true) return
    if (type === "user") {
      if (isPrompt(message)) outsider.firstReply = true
      return
    }
    // The turn's end comes from the Stop hook; a transcript has no result lines of its own.
    const written = journalOf(message as StreamMessage).filter((entry) => entry.kind !== "result")
    for (const entry of written) {
      outsider.hunter.journal.push(entry)
      if (entry.kind !== "said" || !outsider.firstReply) continue
      outsider.firstReply = false
      this.bind(outsider, entry.text.split("\n")[0]?.trim() ?? "", slots)
    }
  }

  /**
   * Binds an outside hunter to the contract its reply's first line names, as `/implement-slice`
   * says it: `Slice S3: Lay the plank road`. When several villages of its region have that
   * contract, the title picks, and then the slices file its prompt named.
   */
  private bind(outsider: Outsider, line: string, slots: SlotState[]): void {
    const [, id, rest = ""] = SLICE_LINE.exec(line) ?? []
    const region = slots.find((slot) => slot.slot === outsider.hunter.slot)
    if (!id || region?.kind !== "region") return
    let villages = region.villages.filter((v) => v.slices && v.contracts.some((c) => c.id === id))
    const narrow = (keep: (village: Village) => boolean) => {
      const kept = villages.filter(keep)
      if (kept.length > 0) villages = kept
    }
    if (villages.length > 1) narrow((v) => rest.startsWith(v.contracts.find((c) => c.id === id)?.title ?? "\0"))
    const prompt = outsider.prompt
    if (villages.length > 1 && prompt) narrow((v) => v.slices !== undefined && prompt.includes(v.slices))
    const [village] = villages
    if (!village || villages.length > 1) return
    Object.assign(outsider.hunter, { rite: "implement-slice", village: village.slug, contract: id })
  }

  /**
   * Takes a `PermissionRequest` its hunter's hook posted and holds it as a prompt, putting the
   * hunter in awaiting you until you answer. Undefined when it names no hunter out, whose hook
   * gets no decision from Guslar.
   */
  asked(request: HookRequest): Asking | undefined {
    const id = request.hunterId
    const entry = id ? this.out.get(id) : undefined
    const tool = request.input.tool_name
    if (!id || !entry || typeof tool !== "string" || tool === "") return undefined
    entry.hunter.lastHook = sightingOf("PermissionRequest", tool)
    const prompt: PermissionPrompt = { id: randomUUID(), tool, input: promptInput(request.input.tool_input) }
    const decision = new Promise<PermissionAnswer | undefined>((settle) => entry.asking.push({ prompt, settle }))
    this.showPrompt(id)
    this.changed()
    return { decision, withdraw: () => this.settle(id, prompt.id, undefined) }
  }

  /** Gives your answer to a hunter's prompt to the hook waiting on it. */
  answer(id: string, promptId: string, answer: PermissionAnswer): AnswerResult {
    const entry = this.out.get(id)
    if (!entry) return { status: 404, error: "No such hunter is out." }
    const pending = entry.asking.find((p) => p.prompt.id === promptId)
    if (!pending) return { status: 409, error: `${entry.hunter.name} is no longer waiting on that.` }
    this.settle(id, promptId, answer)
    return { answered: pending.prompt }
  }

  /** Settles one prompt of a hunter; once none is left, the hunter goes back to its hunt. */
  private settle(id: string, promptId: string, answer: PermissionAnswer | undefined): void {
    const entry = this.out.get(id)
    const index = entry?.asking.findIndex((p) => p.prompt.id === promptId) ?? -1
    if (!entry || index < 0) return
    const [pending] = entry.asking.splice(index, 1)
    pending?.settle(answer)
    this.showPrompt(id)
    if (!entry.hunter.prompt && entry.hunter.state === "awaiting-you") entry.hunter.state = "hunting"
    this.changed()
  }

  /** Shows a hunter's oldest prompt, awaiting you, or none. */
  private showPrompt(id: string): void {
    const entry = this.out.get(id)
    if (!entry) return
    const oldest = entry.asking[0]?.prompt
    if (oldest) {
      entry.hunter.prompt = oldest
      if (!isReturned(entry.hunter)) entry.hunter.state = "awaiting-you"
    } else {
      delete entry.hunter.prompt
    }
  }

  /** Lets go every prompt a hunter holds, unanswered, so no hook waits on a hunter that is gone. */
  private release(id: string): void {
    const entry = this.out.get(id)
    if (!entry) return
    for (const pending of entry.asking.splice(0)) pending.settle(undefined)
    delete entry.hunter.prompt
  }

  /**
   * Takes the world as the repos have it now: a hunter whose contract has been paid has
   * returned with its trophy. Says whether any hunter changed.
   */
  see(slots: SlotState[]): boolean {
    let changed = false
    for (const hunter of this.list()) {
      if (hunter.state === "returned-trophy" || hunter.contract === undefined) continue
      const region = slots.find((slot) => slot.slot === hunter.slot)
      if (region?.kind !== "region") continue
      const village = region.villages.find((v) => v.slug === hunter.village)
      const contract = village?.contracts.find((c) => c.id === hunter.contract)
      if (paid(hunter.rite, contract?.state)) {
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
    const session = (message as StreamMessage).session_id
    if (typeof session === "string" && session !== "" && session !== entry.hunter.sessionId) {
      entry.hunter.sessionId = session
      this.changed()
    }
    const written = journalOf(message)
    entry.hunter.journal.push(...written)
    const next = afterMessage(entry.hunter.state, message)
    if (next === "turn-ended") {
      if (written.length > 0) this.changed()
      void this.cameBack(id, written.some((e) => e.kind === "result" && e.error))
      return
    }
    if (!this.move(id, next) && written.length > 0) this.changed()
  }

  /**
   * The turn is over: the hunter comes back with a trophy if its contract has been paid, read
   * from the repo now rather than from the last poll, or wounded if not. A rite with no contract
   * comes back with a trophy unless its turn `failed`.
   */
  private async cameBack(id: string, failed: boolean): Promise<void> {
    const hunter = this.find(id)
    if (!hunter) return
    if (hunter.contract === undefined) {
      this.move(id, failed ? "returned-wounded" : "returned-trophy")
      return
    }
    let state: ContractState | undefined
    try {
      state = await this.lookup(hunter)
    } catch (error) {
      console.error(`guslar: could not read ${hunter.name}'s contract: ${(error as Error).message}`)
    }
    this.move(id, paid(hunter.rite, state) ? "returned-trophy" : "returned-wounded")
  }

  /** Moves a hunter to a new state and says so to the map; returns whether it moved. */
  private move(id: string, state: HunterState): boolean {
    const hunter = this.find(id)
    if (!hunter || hunter.state === state || settled(hunter)) return false
    // A hunter with a prompt out waits on you, whatever else its session says meanwhile.
    if (hunter.prompt && state === "hunting") return false
    hunter.state = state
    this.changed()
    return true
  }

  /**
   * Sends a hunter home at your asking: it leaves the map now, and its session is let go. Sending
   * another hunter to its village is the only other thing that clears one, and a village whose
   * contracts are all taken is never sent to again, so its last hunter has no other way off the map.
   *
   * Only a hunter that has come back goes. A hunter still out may hold a permission request, and
   * `release` settles it with no decision, which its hook reads as Guslar being unreachable and
   * allows the call: sending home a hunter awaiting you would grant what you were about to deny.
   */
  sendHome(id: string): SendHomeResult {
    const hunter = this.find(id)
    if (!hunter) return { status: 404, error: "No such hunter is out." }
    if (!isReturned(hunter)) {
      return { status: 409, error: `${hunter.name} is still out: it can only be sent home once it is back.` }
    }
    this.dismiss(id)
    // `dismiss` keeps the roll; every open map hears of it here.
    this.changed()
    return { hunter }
  }

  /**
   * Sends a returned hunter home: it leaves the map now, and its claude exits once its stdin ends.
   * An outside session goes on in its own terminal, and is seen afresh at its next prompt.
   */
  private dismiss(id: string): void {
    const outsider = this.outsiderOf(id)
    if (outsider) {
      this.outsiders.delete(outsider.hunter.sessionId ?? "")
      return
    }
    const entry = this.out.get(id)
    if (!entry) return
    this.release(id)
    this.hangUp(id)
    this.out.delete(id)
    entry.process?.stdin.end()
    this.save()
  }

  /**
   * Lets every hunter go: its stdin ends, so its claude finishes the turn it is on and exits. The
   * roll is written first, and no more after, so the hunters are on the map again when Guslar is.
   */
  close(): void {
    this.flush()
    this.closing = true
    for (const [id, { process }] of this.out) {
      this.release(id)
      this.hangUp(id)
      process?.stdin.end()
    }
  }

  /** Writes the roll soon, once changes have settled. */
  private save(): void {
    if (!this.roll || this.closing || this.saving) return
    this.saving = setTimeout(() => this.flush(), SAVE_DELAY)
  }

  /** Writes the roll now: Guslar's own hunters, as the map has them, each with its repo. With none, there is no roll. */
  private flush(): void {
    clearTimeout(this.saving)
    this.saving = undefined
    if (!this.roll || this.closing) return
    const kept: Kept[] = [...this.out.values()].map(({ hunter, repo }) => {
      const still = { ...hunter }
      delete still.prompt
      delete still.terminal
      return { hunter: still, repo }
    })
    try {
      if (kept.length === 0) {
        rmSync(this.roll, { force: true })
        return
      }
      mkdirSync(path.dirname(this.roll), { recursive: true })
      const next = `${this.roll}.${process.pid}.tmp`
      writeFileSync(next, `${JSON.stringify(kept)}\n`)
      renameSync(next, this.roll)
    } catch (error) {
      console.error(`guslar: could not keep the hunters in ${this.roll}: ${(error as Error).message}`)
    }
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
    this.save()
    for (const listener of this.listeners) listener()
  }
}
