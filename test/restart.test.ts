import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, JournalEntry, TakeRequest } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "journal.jsonl")
const SESSION = "8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "acceptEdits" }

/** What the journal holds when the replay waits at its `read` gate. */
const HELD: JournalEntry[] = [
  { kind: "you", text: "/implement-slice .scratch/slices/drain-the-bog.json S3" },
  { kind: "said", text: "Slice S3: Lay the plank road (also ready: S2)" },
  { kind: "tool", tool: "Bash", input: "git status --short" },
]

const CUT_SHORT: JournalEntry = {
  kind: "result",
  text: "Guslar stopped during this turn. Write to resume the session.",
  error: true,
}

async function post(guslar: Running, where: string, body: unknown): Promise<{ status: number; body: { hunter?: Hunter; error?: string } }> {
  const res = await fetch(new URL(where, guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(guslar.url).origin },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; error?: string } }
}

type Logged = { pid: number; started?: { args: string[]; hunterId?: string }; stdin?: string }

function claudeLog(guslar: Running): Logged[] {
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Logged)
}

describe("a hunter across a restart of Guslar", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  function start(world: string, home: string, gates: string): Promise<Running> {
    return startGuslar(["--no-open", "--world", world], home, { FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT, FAKE_CLAUDE_GATES: gates })
  }

  it("is kept beside world.json, comes back wounded when its turn was cut short, and a reply resumes its session", async () => {
    const world = path.join(tempDir(), "world.json")
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo: bogwater().repo }] }))
    const home = tempDir()
    const gates = tempDir()
    guslar = await start(world, home, gates)

    const id = (await post(guslar, "/api/hunters", S3)).body.hunter?.id ?? ""
    await awaitWorld(guslar.url, (w) => w.hunters[0]?.journal.length === HELD.length && w.hunters[0].sessionId === SESSION)
    await guslar.stop()

    const roll = path.join(path.dirname(world), "hunters.json")
    expect(existsSync(roll)).toBe(true)

    const restarted = await start(world, home, gates)
    guslar = restarted
    const [hunter, ...others] = (await receiveWorld(guslar.url)).hunters
    expect(others).toEqual([])
    expect(hunter).toMatchObject({
      id,
      name: "Wojmir",
      rite: "implement-slice",
      slot: "forest",
      village: "drain-the-bog",
      contract: "S3",
      permissionMode: "acceptEdits",
      state: "returned-wounded",
      sessionId: SESSION,
      journal: [...HELD, CUT_SHORT],
    })
    // Nothing runs for it until it is written to.
    expect(claudeLog(restarted).filter((entry) => entry.started)).toHaveLength(1)

    const sent = await post(guslar, `/api/hunters/${id}/replies`, { text: "Carry on." })
    expect(sent.status).toBe(201)
    const resumed = await waitFor(
      () => claudeLog(restarted).filter((entry) => entry.started)[1],
      "a claude to be started on the hunter's session",
    )
    expect(resumed.started).toMatchObject({
      args: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--resume", SESSION],
      hunterId: id,
    })
    await waitFor(
      () => claudeLog(restarted).find((entry) => entry.pid === resumed.pid && entry.stdin?.includes("Carry on.")),
      "the reply on the resumed claude's stdin",
    )
    const back = await awaitWorld(guslar.url, (w) => w.hunters[0]?.state === "hunting")
    expect(back.hunters[0]?.journal.slice(0, HELD.length + 2)).toEqual([...HELD, CUT_SHORT, { kind: "you", text: "Carry on." }])
  })

  it("keeps a hunter that returned as it returned, and forgets one whose region is gone", async () => {
    const world = path.join(tempDir(), "world.json")
    const repo = bogwater().repo
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo }] }))
    const home = tempDir()
    const gates = tempDir()
    writeFileSync(path.join(gates, "read"), "")
    guslar = await start(world, home, gates)

    await post(guslar, "/api/hunters", S3)
    const returned = (await awaitWorld(guslar.url, (w) => w.hunters[0]?.state === "returned-wounded")).hunters[0]
    await guslar.stop()

    guslar = await start(world, home, gates)
    expect((await receiveWorld(guslar.url)).hunters).toEqual([returned])
    await guslar.stop()

    writeFileSync(world, JSON.stringify({ regions: [{ slot: "marsh", repo }] }))
    guslar = await start(world, home, gates)
    expect((await receiveWorld(guslar.url)).hunters).toEqual([])
  })
})
