import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater, type FixtureRegion } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "implement-slice.jsonl")

/** The gates the replay waits at on its way to hunting; `end` stays shut, so its turn is still under way. */
const UNDER_WAY = ["hunt", "permission", "allow", "question", "answer"]

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }

type Logged = { pid: number; started?: { hunterId?: string }; ended?: boolean }

function claudeLog(guslar: Running): Logged[] {
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Logged)
}

/** The headers an open map sends, so the server takes the request for one of its own. */
function asTheMap(guslar: Running): Record<string, string> {
  return { "content-type": "application/json", origin: new URL(guslar.url).origin }
}

async function take(guslar: Running, request: TakeRequest): Promise<Hunter | undefined> {
  const res = await fetch(new URL("/api/hunters", guslar.url), {
    method: "POST",
    headers: asTheMap(guslar),
    body: JSON.stringify(request),
  })
  return ((await res.json()) as { hunter?: Hunter }).hunter
}

/** Sends a hunter home the way the map does: a DELETE on the hunter itself, carrying nothing. */
async function sendHome(guslar: Running, id: string): Promise<{ status: number; body: { hunter?: Hunter; error?: string } }> {
  const res = await fetch(new URL(`/api/hunters/${id}`, guslar.url), { method: "DELETE", headers: asTheMap(guslar) })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; error?: string } }
}

/** The world as the map reads it over HTTP, beside the broadcast it follows. */
async function readWorld(guslar: Running): Promise<WorldState> {
  const res = await fetch(new URL("/api/world", guslar.url), { headers: { origin: new URL(guslar.url).origin } })
  return (await res.json()) as WorldState
}

describe("send a hunter home", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  function start(world: string, home: string, gates: string): Promise<Running> {
    return startGuslar(["--no-open", "--world", world], home, { FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT, FAKE_CLAUDE_GATES: gates })
  }

  /** A world of one region, Bogwater in the forest slot, with the roll kept beside it. */
  function layDown(bog: FixtureRegion): string {
    const world = path.join(tempDir(), "world.json")
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo: bog.repo }] }))
    return world
  }

  /** Sends a hunter on S3 and lands its contract's commit, so it is back with its trophy, its turn still open. */
  async function backWithATrophy(running: Running, bog: FixtureRegion, gates: string): Promise<string> {
    const id = (await take(running, S3))?.id ?? ""
    for (const name of UNDER_WAY) writeFileSync(path.join(gates, name), "")
    await awaitWorld(running.url, (w) => w.hunters.some((h) => h.id === id && h.state === "hunting"))
    bog.commit("Lay the plank road", "Slice S3 of .scratch/specs/drain-the-bog.md.", "Slice: S3")
    await awaitWorld(running.url, (w) => w.hunters.some((h) => h.id === id && h.state === "returned-trophy"))
    return id
  }

  it("takes a returned hunter out of the world and the broadcast, and lets its session go", async () => {
    const bog = bogwater()
    const gates = tempDir()
    const running = await start(layDown(bog), tempDir(), gates)
    guslar = running

    const id = await backWithATrophy(running, bog, gates)
    const hunting = claudeLog(running).find((entry) => entry.started?.hunterId === id)
    expect(hunting?.pid).toBeDefined()

    const sent = await sendHome(running, id)
    expect(sent.status).toBe(200)
    expect(sent.body.hunter).toMatchObject({ id, name: "Wojmir", state: "returned-trophy" })

    // Gone from the broadcast every open map follows, and from the world read over HTTP.
    await awaitWorld(running.url, (w) => w.hunters.length === 0)
    expect((await readWorld(running)).hunters).toEqual([])

    // Its stdin ended, so its claude finished the turn it was on and exited.
    await waitFor(
      () => claudeLog(running).find((entry) => entry.pid === hunting?.pid && entry.ended),
      "the sent-home hunter's claude to exit",
    )
  })

  it("leaves nothing in the roll, so a restart does not bring it back", async () => {
    const bog = bogwater()
    const world = layDown(bog)
    const home = tempDir()
    const gates = tempDir()
    let running = await start(world, home, gates)
    guslar = running

    const id = await backWithATrophy(running, bog, gates)
    const roll = path.join(path.dirname(world), "hunters.json")
    await waitFor(() => (existsSync(roll) ? true : undefined), "the roll to be written with the hunter on it")

    expect((await sendHome(running, id)).status).toBe(200)
    // With no hunter left to keep there is no roll, rather than one still holding the hunter that went.
    await waitFor(() => (existsSync(roll) ? undefined : true), "the roll to be written without the hunter")

    await running.stop()
    running = await start(world, home, gates)
    guslar = running
    expect((await receiveWorld(running.url)).hunters).toEqual([])
  })
})
