import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createInterface } from "node:readline"
import type {
  ContractState,
  HookRequest,
  HookSighting,
  Hunter,
  HunterState,
  JournalEntry,
  PermissionAnswer,
  PermissionPrompt,
  SlotState,
  TakeRequest,
} from "../shared/world.js"
import { isReturned, refusalOf } from "../shared/world.js"
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
  session_id?: unknown
  subtype?: unknown
  message?: { content?: unknown }
  request?: { subtype?: unknown }
  result?: unknown
  is_error?: unknown
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
  private readonly out = new Map<
    string,
    {
      hunter: Hunter
      process: ChildProcessWithoutNullStreams
      /** The repo it was sent into, where its session is resumed too. */
      repo: string
      asking: Pending[]
      /** Its session resumed in a terminal, while that is being opened or once it has been. */
      terminal?: Promise<Terminal | Error>
    }
  >()
  private readonly listeners = new Set<() => void>()
  /** Where this Guslar listens, given to each hunter as `GUSLAR_URL` so its hooks can reach it. */
  private url: string | undefined

  /**
   * `claude` is the program each hunter runs: `GUSLAR_CLAUDE`, or `claude` on the PATH.
   * `lookup` reads a hunter's contract from its repo, to judge how it came back.
   */
  constructor(
    private readonly claude: string,
    private readonly lookup: ContractLookup,
  ) {}

  /** Tells the hunters sent from now on where this Guslar listens. */
  listenAt(url: string): void {
    this.url = url
  }

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
      env: { ...process.env, GUSLAR_HUNTER_ID: id, ...(this.url ? { GUSLAR_URL: this.url } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const started = await new Promise<Error | undefined>((resolve) => {
      child.once("spawn", () => resolve(undefined))
      child.once("error", resolve)
    })
    if (started) return { status: 502, error: `Could not start ${this.claude}: ${started.message}` }

    // A hunter back in this village makes way for the new one, and its name is free again.
    for (const returned of inVillage) this.dismiss(returned.id)
    const opening = `/implement-slice ${village.slices} ${contract.id}`
    const hunter: Hunter = {
      id,
      name: this.freeName(),
      slot: request.slot,
      village: village.slug,
      contract: contract.id,
      permissionMode: request.permissionMode,
      state: "riding-out",
      journal: [{ kind: "you", text: opening }],
    }

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    lines.on("line", (line) => this.heard(hunter.id, line))
    let stderr = ""
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)))
    child.stdin.on("error", () => {}) // a claude that exits early closes its stdin under us
    child.once("exit", (code, signal) => {
      this.release(hunter.id)
      this.hangUp(hunter.id)
      this.out.delete(hunter.id)
      if (code !== 0 && code !== null) {
        const last = stderr.trim().split("\n").pop()
        console.error(`guslar: ${hunter.name}'s claude exited with ${code}${last ? `: ${last}` : ""}`)
      } else if (signal) {
        console.error(`guslar: ${hunter.name}'s claude was stopped by ${signal}`)
      }
      this.changed()
    })

    child.stdin.write(userMessage(opening))
    this.out.set(hunter.id, { hunter, process: child, repo: region.repo, asking: [] })
    this.changed()
    return { hunter }
  }

  /** Writes what you typed in a hunter's journal to its session, as the next user message. */
  reply(id: string, text: string): ReplyResult {
    const entry = this.out.get(id)
    if (!entry) return { status: 404, error: "No such hunter is out." }
    const trimmed = text.trim()
    if (trimmed === "") return { status: 400, error: "A reply needs words." }
    if (!entry.process.stdin.writable) return { status: 409, error: `${entry.hunter.name} no longer listens.` }
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
   * Takes a hook event its session posted: the hunter it names shows it as its last. Says
   * whether a hunter heard it; an event from a session Guslar did not start is not heard yet.
   */
  hooked(request: HookRequest): boolean {
    const entry = request.hunterId ? this.out.get(request.hunterId) : undefined
    const event = request.input.hook_event_name
    if (!entry || typeof event !== "string" || event === "") return false
    const tool = request.input.tool_name
    const sighting: HookSighting = typeof tool === "string" && tool !== "" ? { event, tool } : { event }
    entry.hunter.lastHook = sighting
    this.changed()
    return true
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
    entry.hunter.lastHook = { event: "PermissionRequest", tool }
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
      void this.cameBack(id)
      return
    }
    if (!this.move(id, next) && written.length > 0) this.changed()
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

  /** Moves a hunter to a new state and says so to the map; returns whether it moved. */
  private move(id: string, state: HunterState): boolean {
    const hunter = this.out.get(id)?.hunter
    if (!hunter || hunter.state === state || hunter.state === "returned-trophy") return false
    // A hunter with a prompt out waits on you, whatever else its session says meanwhile.
    if (hunter.prompt && state === "hunting") return false
    hunter.state = state
    this.changed()
    return true
  }

  /** Sends a returned hunter home: it leaves the map now, and its claude exits once its stdin ends. */
  private dismiss(id: string): void {
    const entry = this.out.get(id)
    if (!entry) return
    this.release(id)
    this.hangUp(id)
    this.out.delete(id)
    entry.process.stdin.end()
  }

  /** Lets every hunter go: its stdin ends, so its claude finishes the turn it is on and exits. */
  close(): void {
    for (const [id, { process }] of this.out) {
      this.release(id)
      this.hangUp(id)
      process.stdin.end()
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
    for (const listener of this.listeners) listener()
  }
}
