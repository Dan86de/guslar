import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import WebSocket from "ws"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, JournalEntry, Refusal, ServerMessage, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "journal.jsonl")

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }

/** The journal the transcript's first turn writes, in order. */
const FIRST_TURN: JournalEntry[] = [
  { kind: "you", text: "/implement-slice .scratch/slices/drain-the-bog.json S3" },
  { kind: "said", text: "Slice S3: Lay the plank road (also ready: S2)" },
  { kind: "tool", tool: "Bash", input: "git status --short" },
  { kind: "tool", tool: "Read", input: "/repo/.scratch/specs/drain-the-bog.md" },
  { kind: "said", text: "The spec does not say what the planks are made of. Oak or pine?" },
  {
    kind: "result",
    text: "The spec does not say what the planks are made of. Oak or pine?",
    error: false,
  },
]

/** What the transcript's second turn writes, once it has your reply. */
const SECOND_TURN: JournalEntry[] = [
  { kind: "said", text: "Oak it is." },
  { kind: "tool", tool: "Edit", input: "/repo/src/road.ts" },
  { kind: "said", text: "The plank road is laid in oak." },
  { kind: "result", text: "The plank road is laid in oak.", error: false },
]

/** Follows the broadcast as an open map does, keeping every world it was sent. */
function follow(url: string): { worlds: WorldState[]; close(): void } {
  const socket = new WebSocket(new URL("/ws", url).href.replace(/^http/, "ws"))
  const worlds: WorldState[] = []
  socket.on("message", (data: Buffer) => worlds.push((JSON.parse(data.toString()) as ServerMessage).world))
  return { worlds, close: () => socket.close() }
}

async function post(
  guslar: Running,
  where: string,
  body: unknown,
  origin = new URL(guslar.url).origin,
): Promise<{ status: number; body: { hunter?: Hunter; sent?: JournalEntry; refusal?: Refusal } }> {
  const res = await fetch(new URL(where, guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; sent?: JournalEntry; refusal?: Refusal } }
}

/** Every line the fake claude was sent on its stdin, in order. */
function stdinOf(guslar: Running): unknown[] {
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { stdin?: string })
    .flatMap((entry) => (entry.stdin === undefined ? [] : [JSON.parse(entry.stdin) as unknown]))
}

describe("a hunter's journal", () => {
  let guslar: Running | undefined
  let feed: { worlds: WorldState[]; close(): void } | undefined
  afterEach(async () => {
    feed?.close()
    feed = undefined
    await guslar?.stop()
    guslar = undefined
  })

  async function start(gates: string): Promise<Running> {
    const world = path.join(tempDir(), "world.json")
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo: bogwater().repo }] }))
    const running = await startGuslar(["--no-open", "--world", world], tempDir(), {
      FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT,
      FAKE_CLAUDE_GATES: gates,
    })
    guslar = running
    await receiveWorld(running.url)
    feed = follow(running.url)
    return running
  }

  function journalNow(id: string): JournalEntry[] | undefined {
    return feed?.worlds.at(-1)?.hunters.find((h) => h.id === id)?.journal
  }

  async function journalReaches(id: string, journal: JournalEntry[]): Promise<void> {
    await waitFor(
      () => (JSON.stringify(journalNow(id)) === JSON.stringify(journal) ? true : undefined),
      `the journal to read ${JSON.stringify(journal)}; it reads ${JSON.stringify(journalNow(id))}`,
    )
  }

  it("broadcasts every assistant message and tool call as it arrives, in order", async () => {
    const gates = tempDir()
    const running = await start(gates)
    const { body } = await post(running, "/api/hunters", S3)
    const id = body.hunter?.id ?? ""
    expect(body.hunter?.journal).toEqual(FIRST_TURN.slice(0, 1))

    // Held at a gate, the journal has what the session has said so far, and nothing it has not.
    await journalReaches(id, FIRST_TURN.slice(0, 3))
    writeFileSync(path.join(gates, "read"), "")
    await journalReaches(id, FIRST_TURN)

    // Each entry reached the map on its own, as it arrived: the journal grew one entry at a time.
    const lengths = new Set(feed?.worlds.map((w) => w.hunters.find((h) => h.id === id)?.journal.length))
    for (let n = 1; n <= FIRST_TURN.length; n++) expect(lengths).toContain(n)
  })

  it("writes a reply to the hunter's stdin as a stream-json user message, and broadcasts the turn it starts", async () => {
    const gates = tempDir()
    writeFileSync(path.join(gates, "read"), "")
    const running = await start(gates)
    const id = (await post(running, "/api/hunters", S3)).body.hunter?.id ?? ""
    await journalReaches(id, FIRST_TURN)

    const sent = await post(running, `/api/hunters/${id}/replies`, { text: "  Oak, from the old grove.\n" })
    expect(sent.status).toBe(201)
    expect(sent.body.sent).toEqual({ kind: "you", text: "Oak, from the old grove." })
    await waitFor(() => (stdinOf(running).length === 2 ? true : undefined), "claude to be sent the reply")
    expect(stdinOf(running)[1]).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "Oak, from the old grove." }] },
    })

    await journalReaches(id, [...FIRST_TURN, { kind: "you", text: "Oak, from the old grove." }, ...SECOND_TURN])
  })

  it("refuses a reply with no words, to no hunter, or from a page elsewhere", async () => {
    const running = await start(tempDir())
    const id = (await post(running, "/api/hunters", S3)).body.hunter?.id ?? ""
    await journalReaches(id, FIRST_TURN.slice(0, 3))

    expect((await post(running, `/api/hunters/${id}/replies`, { text: " \n" })).status).toBe(400)
    expect((await post(running, `/api/hunters/${id}/replies`, { words: "Oak" })).status).toBe(400)
    const nobody = await post(running, "/api/hunters/00000000-0000-4000-8000-000000000000/replies", { text: "Oak" })
    expect(nobody).toEqual({ status: 404, body: { refusal: { reason: "no-hunter" } } })
    const elsewhere = await post(running, `/api/hunters/${id}/replies`, { text: "Oak" }, "http://evil.example")
    expect(elsewhere.status).toBe(403)

    // None of them reached the session: it was sent its opening command and nothing more.
    expect(stdinOf(running)).toHaveLength(1)
    expect((await receiveWorld(running.url)).hunters[0]?.journal).toEqual(FIRST_TURN.slice(0, 3))
  })
})
