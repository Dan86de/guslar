import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater, fixtureRegion } from "./fixture-region.js"
import { awaitWorld, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

function worldOf(regions: { slot: string; repo: string; name?: string }[]): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions }))
  return file
}

type ClaudeEvent = { pid: number; started?: { cwd: string; args: string[]; hunterId?: string }; stdin?: string; ended?: true }

function claudeEvents(guslar: Running): ClaudeEvent[] {
  if (!existsSync(guslar.claudeLog)) return []
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ClaudeEvent)
}

/** Takes a contract the way the map does: a JSON POST from the server's own origin. */
async function take(guslar: Running, request: TakeRequest): Promise<{ status: number; body: { hunter?: Hunter; error?: string } }> {
  const res = await fetch(new URL("/api/hunters", guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(guslar.url).origin },
    body: JSON.stringify(request),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; error?: string } }
}

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "acceptEdits" }

describe("sending a hunter on a ready contract", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("starts claude in the region's repo on /implement-slice with the chosen mode, stream-json and a hunter id", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)

    const { status, body } = await take(guslar, S3)
    expect(status).toBe(201)
    const hunter = body.hunter
    if (!hunter) throw new Error(`no hunter: ${body.error}`)

    const running = guslar
    const events = await waitFor(() => {
      const all = claudeEvents(running)
      return all.some((e) => e.stdin) ? all : undefined
    }, "claude to read its first message")
    const started = events.find((e) => e.started)?.started
    expect(started?.cwd).toBe(realpathSync(bog.repo))
    expect(started?.args).toEqual([
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
    ])
    expect(started?.hunterId).toBe(hunter.id)
    expect(JSON.parse(events.find((e) => e.stdin)?.stdin ?? "")).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "/implement-slice .scratch/slices/drain-the-bog.json S3" }] },
    })
  })

  it("broadcasts the new hunter bound to its contract and village", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)

    const broadcast = awaitWorld(guslar.url, (world) => world.hunters.length > 0)
    const { body } = await take(guslar, S3)
    const world = await broadcast

    expect(world.hunters).toEqual([
      {
        id: body.hunter?.id,
        name: "Wojmir",
        slot: "forest",
        village: "drain-the-bog",
        contract: "S3",
        permissionMode: "acceptEdits",
        state: "riding-out",
        journal: [{ kind: "you", text: "/implement-slice .scratch/slices/drain-the-bog.json S3" }],
      },
    ])
    expect(body.hunter?.id).toMatch(/^[0-9a-f-]{36}$/)
    const served = (await (await fetch(new URL("/api/world", guslar.url))).json()) as WorldState
    expect(served.hunters).toEqual(world.hunters)
  })

  it("refuses a second hunter into a village with one out, naming the hunter who holds it", async () => {
    const bog = bogwater()
    bog.commit("Sign off S2: Raise the dyke", "Slice: S2") // S5 is ready too now
    const kettle = fixtureRegion()
    kettle.write(".scratch/specs/mend-the-bridge.md", "# Mend the bridge\n")
    kettle.write(
      ".scratch/slices/mend-the-bridge.json",
      JSON.stringify({ slices: [{ id: "S1", title: "Sink the piles", autonomy: "afk", blocked_by: [] }] }),
    )
    guslar = await startGuslar([
      "--no-open",
      "--world",
      worldOf([
        { slot: "forest", repo: bog.repo },
        { slot: "river-town", repo: kettle.repo },
      ]),
    ])
    await receiveWorld(guslar.url)

    expect((await take(guslar, S3)).status).toBe(201)
    for (const contract of ["S5", "S3"]) {
      expect(await take(guslar, { ...S3, contract, permissionMode: "default" })).toEqual({
        status: 409,
        body: { error: "Drain the bog refuses a second hunter: Wojmir is out on S3." },
      })
    }

    // Another village takes its own hunter while the first is out.
    const other = await take(guslar, { slot: "river-town", village: "mend-the-bridge", contract: "S1", permissionMode: "default" })
    expect(other.status).toBe(201)
    expect(other.body.hunter?.name).toBe("Bogna")

    const world = await receiveWorld(guslar.url)
    expect(world.hunters.map((h) => [h.name, h.village, h.contract])).toEqual([
      ["Wojmir", "drain-the-bog", "S3"],
      ["Bogna", "mend-the-bridge", "S1"],
    ])
    const running = guslar
    await waitFor(() => (claudeEvents(running).filter((e) => e.stdin).length === 2 ? true : undefined), "two claudes")
    expect(claudeEvents(guslar).filter((e) => e.started)).toHaveLength(2)
  })

  it("refuses a contract that is not ready, and starts nothing", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)

    expect(await take(guslar, { ...S3, contract: "S4" })).toEqual({
      status: 409,
      body: { error: "S4 of Drain the bog is sealed, not ready to take." },
    })
    expect(await take(guslar, { ...S3, contract: "S1" })).toEqual({
      status: 409,
      body: { error: "S1 of Drain the bog is done, not ready to take." },
    })
    expect((await take(guslar, { ...S3, village: "ward-the-well", contract: "S1" })).status).toBe(404)
    expect((await take(guslar, { ...S3, permissionMode: "yolo" as TakeRequest["permissionMode"] })).status).toBe(400)
    expect(claudeEvents(guslar)).toEqual([])
    expect((await receiveWorld(guslar.url)).hunters).toEqual([])
  })

  it("takes no order from a page it does not serve", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)
    const url = new URL("/api/hunters", guslar.url)
    const body = JSON.stringify(S3)

    const foreign = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body,
    })
    // A simple cross-site form post, which needs no preflight, is refused for its content type.
    const simple = await fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body })
    // A page on a DNS name rebound to this machine: fetch sets Host itself, so this goes by node:http.
    const rebound = await new Promise<{ status: number }>((resolve, reject) => {
      const req = request(
        url,
        { method: "POST", headers: { "content-type": "application/json", host: `evil.example:${url.port}` } },
        (res) => {
          res.resume()
          resolve({ status: res.statusCode ?? 0 })
        },
      )
      req.once("error", reject)
      req.end(body)
    })

    expect([foreign.status, simple.status, rebound.status]).toEqual([403, 403, 403])
    expect(claudeEvents(guslar)).toEqual([])
  })

  it("lets its hunters go when it stops: each claude's stdin ends", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)
    await take(guslar, S3)

    const running = guslar
    await guslar.stop()
    await waitFor(() => (claudeEvents(running).some((e) => e.ended) ? true : undefined), "claude to end")
  })

  it("says so when claude cannot be started, and sends no hunter", async () => {
    const bog = bogwater()
    const home = tempDir()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])], home, {
      GUSLAR_CLAUDE: path.join(home, "no-such-claude"),
    })
    await receiveWorld(guslar.url)

    const { status, body } = await take(guslar, S3)
    expect(status).toBe(502)
    expect(body.error).toMatch(/^Could not start .*no-such-claude: spawn .* ENOENT$/)
    expect((await receiveWorld(guslar.url)).hunters).toEqual([])
  })
})
