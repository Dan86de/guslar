import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, Refusal, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

type ClaudeEvent = { pid: number; started?: { cwd: string; args: string[]; hunterId?: string }; stdin?: string }

function claudeEvents(guslar: Running): ClaudeEvent[] {
  if (!existsSync(guslar.claudeLog)) return []
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ClaudeEvent)
}

/** How the claude of one hunter was started, and the first message it read, once it has read it. */
async function startedFor(guslar: Running, hunterId: string): Promise<{ cwd: string; args: string[]; opening: string }> {
  return waitFor(() => {
    const events = claudeEvents(guslar)
    const started = events.find((e) => e.started?.hunterId === hunterId)
    const stdin = events.find((e) => e.pid === started?.pid && e.stdin)?.stdin
    if (!started?.started || !stdin) return undefined
    const text = (JSON.parse(stdin) as { message: { content: { text: string }[] } }).message.content[0]?.text ?? ""
    return { cwd: started.started.cwd, args: started.started.args, opening: text }
  }, `the claude of hunter ${hunterId} to read its first message`)
}

/** Sends a hunter the way the map does: a JSON POST from the server's own origin. */
async function take(guslar: Running, request: TakeRequest): Promise<{ status: number; body: { hunter?: Hunter; refusal?: Refusal } }> {
  const res = await fetch(new URL("/api/hunters", guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(guslar.url).origin },
    body: JSON.stringify(request),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; refusal?: Refusal } }
}

async function sent(guslar: Running, request: TakeRequest): Promise<Hunter> {
  const { status, body } = await take(guslar, request)
  if (status !== 201 || !body.hunter) throw new Error(`no hunter (${status}): ${JSON.stringify(body.refusal)}`)
  return body.hunter
}

function worldFile(repo: string): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions: [{ slot: "forest", repo, name: "Bogwater Reach" }] }))
  return file
}

describe("the other rites", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("starts each region's rite with its skill in the region's repo, bound to the region", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)])
    await receiveWorld(guslar.url)
    const repo = realpathSync(bog.repo)

    for (const [rite, opening] of [
      ["interview", "/interview"],
      ["write-spec", "/write-spec"],
      ["make-verify", "/make-verify"],
    ] as const) {
      const hunter = await sent(guslar, { slot: "forest", rite, permissionMode: "acceptEdits" })
      const started = await startedFor(guslar, hunter.id)
      expect(started).toEqual({
        cwd: repo,
        args: ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits"],
        opening,
      })
      const world = await receiveWorld(guslar.url)
      expect(world.hunters.find((h) => h.id === hunter.id)).toMatchObject({ rite, slot: "forest", state: "riding-out" })
      expect(world.hunters.find((h) => h.id === hunter.id)).not.toHaveProperty("village")
      expect(world.hunters.find((h) => h.id === hunter.id)).not.toHaveProperty("contract")

      // A region takes one hunter at a time for its own rites; this one has not come back yet.
      expect(await take(guslar, { slot: "forest", rite: "write-spec", permissionMode: "default" })).toEqual({
        status: 409,
        body: { refusal: { reason: "busy", place: "Bogwater Reach", holder: { name: hunter.name, rite } } },
      })
      // Its villages take their own hunters meanwhile.
      const inVillage = await sent(guslar, { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" })
      await startedFor(guslar, inVillage.id)

      // Make way for the next rite: stop Guslar, which lets every hunter go, and start it again.
      await guslar.stop()
      guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)], guslar.home)
      await receiveWorld(guslar.url)
    }
  })

  it("posts a village's contracts with /write-slices on its spec, bound to the village", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)])
    await receiveWorld(guslar.url)

    const hunter = await sent(guslar, { slot: "forest", rite: "write-slices", village: "ward-the-well", permissionMode: "default" })
    expect((await startedFor(guslar, hunter.id)).opening).toBe("/write-slices .scratch/specs/ward-the-well.md")
    const world = await receiveWorld(guslar.url)
    expect(world.hunters).toEqual([
      {
        id: hunter.id,
        name: "Wojmir",
        rite: "write-slices",
        slot: "forest",
        village: "ward-the-well",
        permissionMode: "default",
        state: "riding-out",
        journal: [{ kind: "you", text: "/write-slices .scratch/specs/ward-the-well.md" }],
      },
    ])

    // The village is held: no other rite goes there while its hunter is out.
    expect(await take(guslar, { slot: "forest", rite: "write-slices", village: "ward-the-well", permissionMode: "default" })).toEqual({
      status: 409,
      body: { refusal: { reason: "busy", place: "Ward the well", holder: { name: "Wojmir", rite: "write-slices" } } },
    })
    // A village whose contracts are posted has none to post.
    expect(await take(guslar, { slot: "forest", rite: "write-slices", village: "drain-the-bog", permissionMode: "default" })).toEqual({
      status: 409,
      body: { refusal: { reason: "contracts-posted", village: "Drain the bog" } },
    })
  })

  it("inspects the trophy of a pending contract with /implement-slice --signoff, bound to the contract", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)])
    await receiveWorld(guslar.url)

    // Only a pending contract has a trophy to inspect; S2 is pending, S1 done and S3 ready.
    for (const [contract, state] of [
      ["S1", "done"],
      ["S3", "ready"],
    ]) {
      expect(await take(guslar, { slot: "forest", rite: "sign-off", village: "drain-the-bog", contract, permissionMode: "default" })).toEqual({
        status: 409,
        body: { refusal: { reason: "not-pending", village: "Drain the bog", contract, state } },
      })
    }

    const hunter = await sent(guslar, { slot: "forest", rite: "sign-off", village: "drain-the-bog", contract: "S2", permissionMode: "default" })
    expect((await startedFor(guslar, hunter.id)).opening).toBe("/implement-slice .scratch/slices/drain-the-bog.json --signoff S2")
    const world = await receiveWorld(guslar.url)
    expect(world.hunters.find((h) => h.id === hunter.id)).toMatchObject({
      rite: "sign-off",
      slot: "forest",
      village: "drain-the-bog",
      contract: "S2",
      state: "riding-out",
    })
    expect(await take(guslar, { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" })).toEqual({
      status: 409,
      body: { refusal: { reason: "busy", place: "Drain the bog", holder: { name: hunter.name, rite: "sign-off", contract: "S2" } } },
    })

    // The inspection is paid once the sign-off lands and the contract is done.
    bog.commit("Sign off S2: Raise the dyke", "Slice: S2")
    await awaitWorld(guslar.url, (w) => w.hunters.some((h) => h.id === hunter.id && h.state === "returned-trophy"))
  })

  it("brings a rite with no contract back with a trophy when its turn ends well, and wounded when it fails", async () => {
    const bog = bogwater()
    const gates = tempDir()
    mkdirSync(gates, { recursive: true })
    guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)], tempDir(), {
      FAKE_CLAUDE_TRANSCRIPT: path.join(fixtures, "transcripts", "rite.jsonl"),
      FAKE_CLAUDE_GATES: gates,
    })
    await receiveWorld(guslar.url)
    const open = (gate: string) => writeFileSync(path.join(gates, gate), "open")
    const stateIs = (id: string, state: Hunter["state"]) => (w: WorldState) =>
      w.hunters.some((h) => h.id === id && h.state === state)

    const hunter = await sent(guslar, { slot: "forest", rite: "interview", permissionMode: "default" })
    open("rite")
    await awaitWorld(guslar.url, stateIs(hunter.id, "hunting"))
    open("end")
    await awaitWorld(guslar.url, stateIs(hunter.id, "returned-trophy"))

    // Back with its trophy, it no longer holds the region, and a reply sends it out again.
    const res = await fetch(new URL(`/api/hunters/${hunter.id}/replies`, guslar.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(guslar.url).origin },
      body: JSON.stringify({ text: "One more question." }),
    })
    expect(res.status).toBe(201)
    await awaitWorld(guslar.url, stateIs(hunter.id, "hunting"))
    open("fail")
    await awaitWorld(guslar.url, stateIs(hunter.id, "returned-wounded"))

    // A new rite in the region sends the returned hunter home and rides out in its place.
    const next = await sent(guslar, { slot: "forest", rite: "make-verify", permissionMode: "default" })
    const world = await receiveWorld(guslar.url)
    expect(world.hunters.map((h) => [h.name, h.rite])).toEqual([[next.name, "make-verify"]])
  })

  it("refuses a rite it does not know, or one missing what it is performed on", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldFile(bog.repo)])
    await receiveWorld(guslar.url)

    const bad = [
      { slot: "forest", rite: "summon-the-leszy", permissionMode: "default" },
      { slot: "forest", rite: "write-slices", permissionMode: "default" },
      { slot: "forest", rite: "sign-off", village: "drain-the-bog", permissionMode: "default" },
    ] as unknown as TakeRequest[]
    for (const request of bad) expect((await take(guslar, request)).status).toBe(400)
    expect((await take(guslar, { slot: "forest", rite: "write-slices", village: "no-such", permissionMode: "default" })).status).toBe(404)
    expect(claudeEvents(guslar)).toEqual([])
  })
})
