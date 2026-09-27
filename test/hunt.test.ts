import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import WebSocket from "ws"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, HunterState, ServerMessage, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater, type FixtureRegion } from "./fixture-region.js"
import { fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "implement-slice.jsonl")
const GATES = ["hunt", "permission", "allow", "question", "answer", "end"] as const
type Gate = (typeof GATES)[number]

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }

/** Follows the broadcast as an open map does, keeping every world it was sent. */
function follow(url: string): { worlds: WorldState[]; close(): void } {
  const socket = new WebSocket(new URL("/ws", url).href.replace(/^http/, "ws"))
  const worlds: WorldState[] = []
  socket.on("message", (data: Buffer) => worlds.push((JSON.parse(data.toString()) as ServerMessage).world))
  return { worlds, close: () => socket.close() }
}

/** The states one hunter was broadcast in, in order, each run of repeats told once. */
function statesOf(worlds: WorldState[], id: string): HunterState[] {
  const states: HunterState[] = []
  for (const world of worlds) {
    const state = world.hunters.find((h) => h.id === id)?.state
    if (state && states.at(-1) !== state) states.push(state)
  }
  return states
}

async function take(guslar: Running, request: TakeRequest): Promise<{ status: number; body: { hunter?: Hunter; error?: string } }> {
  const res = await fetch(new URL("/api/hunters", guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(guslar.url).origin },
    body: JSON.stringify(request),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; error?: string } }
}

describe("a hunter's states, from its stream to its return", () => {
  let guslar: Running | undefined
  let feed: { worlds: WorldState[]; close(): void } | undefined
  afterEach(async () => {
    feed?.close()
    feed = undefined
    await guslar?.stop()
    guslar = undefined
  })

  /** Starts Guslar on Bogwater with claude replaying the transcript, its gates in `gates`, and follows the broadcast. */
  async function start(bog: FixtureRegion, gates: string): Promise<Running> {
    const world = path.join(tempDir(), "world.json")
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo: bog.repo }] }))
    const running = await startGuslar(["--no-open", "--world", world], tempDir(), {
      FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT,
      FAKE_CLAUDE_GATES: gates,
    })
    guslar = running
    await receiveWorld(running.url)
    feed = follow(running.url)
    return running
  }

  function open(gates: string, ...names: Gate[]): void {
    for (const name of names) writeFileSync(path.join(gates, name), "")
  }

  function stateNow(id: string): HunterState | undefined {
    return feed?.worlds.at(-1)?.hunters.find((h) => h.id === id)?.state
  }

  /** Waits until the hunter has been broadcast in exactly these states, in this order. */
  async function pass(id: string, states: HunterState[]): Promise<void> {
    await waitFor(
      () => (JSON.stringify(statesOf(feed?.worlds ?? [], id)) === JSON.stringify(states) ? true : undefined),
      `the hunter to pass ${states.join(", ")}; it passed ${statesOf(feed?.worlds ?? [], id).join(", ")}`,
    )
  }

  async function reach(id: string, state: HunterState, timeoutMs = 5000): Promise<void> {
    await waitFor(() => (stateNow(id) === state ? true : undefined), `the hunter to be ${state}`, timeoutMs)
  }

  it("rides out, hunts, awaits you on a permission request and on a question, and hunts again after each", async () => {
    const gates = tempDir()
    const running = await start(bogwater(), gates)
    const { body } = await take(running, S3)
    const id = body.hunter?.id ?? ""
    expect(body.hunter?.state).toBe("riding-out")
    await reach(id, "riding-out")

    const passed: HunterState[] = ["riding-out"]
    const steps: [Gate, HunterState][] = [
      ["hunt", "hunting"],
      ["permission", "awaiting-you"], // its npm run check waits on a permission
      ["allow", "hunting"],
      ["question", "awaiting-you"], // an AskUserQuestion
      ["answer", "hunting"],
    ]
    for (const [gate, state] of steps) {
      open(gates, gate)
      passed.push(state)
      await pass(id, passed)
    }

    // A village with its hunter out, awaiting you or not, still takes no second one.
    expect((await take(running, { ...S3, contract: "S2" })).status).toBe(409)
  })

  it("returns with a trophy as soon as its contract's Slice: commit lands, and keeps it when its turn ends", async () => {
    const gates = tempDir()
    const bog = bogwater()
    const running = await start(bog, gates)
    const id = (await take(running, S3)).body.hunter?.id ?? ""
    open(gates, "hunt", "permission", "allow", "question", "answer")
    await reach(id, "hunting")

    bog.commit("Lay the plank road", "Slice S3 of .scratch/specs/drain-the-bog.md.", "Slice: S3")
    await reach(id, "returned-trophy", 4000)
    const world = feed?.worlds.at(-1)
    const board = world?.slots.find((s) => s.slot === "forest")
    expect(board?.kind === "region" && board.villages[0]?.contracts.find((c) => c.id === "S3")?.state).toBe("done")

    open(gates, "end")
    await waitFor(() => (sentResult(running) ? true : undefined), "claude to end its turn")
    await new Promise((resolve) => setTimeout(resolve, 300)) // time for Guslar to judge the result
    const states = statesOf(feed?.worlds ?? [], id)
    expect(states.at(-1)).toBe("returned-trophy")
    expect(states).not.toContain("returned-wounded")
  })

  it("returns with a trophy when the commit lands just before its turn ends, before any poll sees it", async () => {
    const gates = tempDir()
    const bog = bogwater()
    const running = await start(bog, gates)
    const id = (await take(running, S3)).body.hunter?.id ?? ""
    open(gates, "hunt", "permission", "allow", "question", "answer")
    await reach(id, "hunting")

    bog.commit("Lay the plank road", "Slice: S3")
    open(gates, "end")
    await reach(id, "returned-trophy")
    expect(statesOf(feed?.worlds ?? [], id)).not.toContain("returned-wounded")
  })

  it("counts a Slice-Pending: commit awaiting sign-off as a trophy", async () => {
    const gates = tempDir()
    const bog = bogwater()
    const running = await start(bog, gates)
    const id = (await take(running, S3)).body.hunter?.id ?? ""
    open(gates, "hunt", "permission", "allow", "question", "answer")
    await reach(id, "hunting")

    bog.commit("Lay the plank road", "Awaiting sign-off:\n- the planks hold", "Slice-Pending: S3")
    await reach(id, "returned-trophy", 4000)
  })

  it("returns wounded when its turn ends with no commit, and no longer holds the village", async () => {
    const gates = tempDir()
    open(gates, ...GATES)
    const running = await start(bogwater(), gates)
    const first = (await take(running, S3)).body.hunter
    const id = first?.id ?? ""

    await reach(id, "returned-wounded")
    expect(statesOf(feed?.worlds ?? [], id)).toEqual([
      "riding-out",
      "hunting",
      "awaiting-you",
      "hunting",
      "awaiting-you",
      "hunting",
      "returned-wounded",
    ])
    const board = feed?.worlds.at(-1)?.slots.find((s) => s.slot === "forest")
    expect(board?.kind === "region" && board.villages[0]?.contracts.find((c) => c.id === "S3")?.state).toBe("ready")

    // The wounded hunter makes way: the contract is taken again, and the new hunter is the only one out.
    const again = await take(running, S3)
    expect(again.status).toBe(201)
    expect(again.body.hunter?.name).toBe("Wojmir")
    const world = await receiveWorld(running.url)
    expect(world.hunters.map((h) => h.id)).toEqual([again.body.hunter?.id])
  })
})

/** Whether the fake claude has sent its turn's `result`. */
function sentResult(guslar: Running): boolean {
  return existsSync(guslar.claudeLog) && readFileSync(guslar.claudeLog, "utf8").includes('"sent":"result"')
}
