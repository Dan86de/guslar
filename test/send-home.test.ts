import { randomUUID } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater, type FixtureRegion } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, runGuslar, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "implement-slice.jsonl")

/** A transcript that stops at a permission request, so its hunter awaits you with the request still out. */
const ASKING = path.join(fixtures, "transcripts", "permission.jsonl")

/** The gates the replay waits at on its way to hunting; `end` stays shut, so its turn is still under way. */
const UNDER_WAY = ["hunt", "permission", "allow", "question", "answer"]

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }

type Logged = { pid: number; started?: { hunterId?: string }; ended?: boolean; hook?: { event: string } }

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

  /** Sends a hunter on S3 and lets it get to work, so it is still out with its turn under way. */
  async function stillHunting(running: Running, gates: string): Promise<string> {
    const id = (await take(running, S3))?.id ?? ""
    writeFileSync(path.join(gates, "hunt"), "")
    await awaitWorld(running.url, (w) => w.hunters.some((h) => h.id === id && h.state === "hunting"))
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

  it("refuses a hunter that is still out, which stays on the map with its journal", async () => {
    const bog = bogwater()
    const gates = tempDir()
    const running = await start(layDown(bog), tempDir(), gates)
    guslar = running

    const id = await stillHunting(running, gates)
    // Its turn is under way and its journal already holds the tool it reached for.
    const settled = await awaitWorld(running.url, (w) =>
      w.hunters.some((h) => h.id === id && h.journal.some((entry) => entry.kind === "tool")),
    )
    const kept = settled.hunters[0]
    expect(kept).toMatchObject({ id, name: "Wojmir", state: "hunting" })

    const refused = await sendHome(running, id)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe("Wojmir is still out: it can only be sent home once it is back.")

    // Still on the map: in the broadcast every open map follows, and in the world read over HTTP,
    // with the journal it had before the refusal.
    expect((await receiveWorld(running.url)).hunters).toEqual([kept])
    expect((await readWorld(running)).hunters).toEqual([kept])
  })

  it("refuses a hunter awaiting you, so its request is still yours to answer", async () => {
    const bog = bogwater()
    const world = layDown(bog)
    expect((await runGuslar(["hooks", "install", "--world", world])).code).toBe(0)
    const running = await startGuslar(["--no-open", "--world", world], tempDir(), { FAKE_CLAUDE_TRANSCRIPT: ASKING })
    guslar = running

    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt !== undefined)
    const id = (await take(running, S3))?.id ?? ""
    const waiting = (await asked).hunters[0]
    expect(waiting).toMatchObject({ id, state: "awaiting-you", prompt: { tool: "Bash" } })

    const refused = await sendHome(running, id)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toBe("Wojmir is still out: it can only be sent home once it is back.")

    // The request is still out, and its hook has had nothing back. Letting go of an unanswered
    // request tells the hook Guslar is gone, whose fallback is to allow: sending this hunter home
    // would grant the very call you were about to deny.
    expect((await readWorld(running)).hunters).toEqual([waiting])
    expect(claudeLog(running).filter((entry) => entry.hook?.event === "PermissionRequest")).toEqual([])
  })

  it("refuses an id no hunter on the map has, one already sent home included", async () => {
    const bog = bogwater()
    const gates = tempDir()
    const running = await start(layDown(bog), tempDir(), gates)
    guslar = running

    const unknown = await sendHome(running, randomUUID())
    expect(unknown.status).toBe(404)
    expect(unknown.body.error).toBe("No such hunter is out.")

    // Pressing twice is how this happens: the second press finds nothing left to send.
    const id = await backWithATrophy(running, bog, gates)
    expect((await sendHome(running, id)).status).toBe(200)
    const again = await sendHome(running, id)
    expect(again.status).toBe(404)
    expect(again.body.error).toBe("No such hunter is out.")
  })

  it("refuses a request that did not come from the map this Guslar serves", async () => {
    const bog = bogwater()
    const gates = tempDir()
    const running = await start(layDown(bog), tempDir(), gates)
    guslar = running

    const id = await backWithATrophy(running, bog, gates)
    const url = new URL(`/api/hunters/${id}`, running.url)

    const foreign = await fetch(url, {
      method: "DELETE",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
    })
    expect(foreign.status).toBe(403)
    expect(((await foreign.json()) as { error?: string }).error).toBe(
      "Only the map this Guslar serves may send a hunter home.",
    )
    // A cross-site request that needs no preflight carries no JSON content type, and is refused for it.
    const plain = await fetch(url, { method: "DELETE" })
    // A page on a DNS name rebound to this machine: fetch sets Host itself, so this goes by node:http.
    const rebound = await new Promise<{ status: number }>((resolve, reject) => {
      const req = request(
        url,
        { method: "DELETE", headers: { "content-type": "application/json", host: `evil.example:${url.port}` } },
        (res) => {
          res.resume()
          resolve({ status: res.statusCode ?? 0 })
        },
      )
      req.once("error", reject)
      req.end()
    })

    expect([plain.status, rebound.status]).toEqual([403, 403])
    // The hunter stayed, and the map this Guslar does serve still sends it home.
    expect((await readWorld(running)).hunters.map((h) => h.id)).toEqual([id])
    expect((await sendHome(running, id)).status).toBe(200)
  })
})
