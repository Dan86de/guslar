import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import path from "node:path"
import WebSocket from "ws"
import { afterEach, describe, expect, it } from "vitest"
import { failGuslar, fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const worldFile = path.join(fixtures, "world", "world.json")

describe("opening the world", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("starts the server, opens the browser, and broadcasts one region per listed repo in its slot", async () => {
    guslar = await startGuslar(["--world", worldFile])
    const running = guslar

    const opened = await waitFor(
      () => (existsSync(running.browserLog) ? readFileSync(running.browserLog, "utf8").trim() : undefined),
      "the browser to be opened",
    )
    expect(opened).toBe(running.url)

    const page = await fetch(running.url)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain("<title>Guslar</title>")

    const world = await receiveWorld(running.url)
    const regions = world.slots.filter((slot) => slot.kind === "region")
    expect(regions).toEqual([
      {
        slot: "forest",
        kind: "region",
        name: "Bogwater Reach",
        repo: path.join(fixtures, "world", "repos", "bogwater"),
        villages: [],
      },
      {
        slot: "river-town",
        kind: "region",
        name: "kettle",
        repo: path.join(running.home, "github", "kettle"),
        villages: [],
      },
    ])
  })

  it("broadcasts every slot with no repo as fogged", async () => {
    guslar = await startGuslar(["--world", worldFile])
    const world = await receiveWorld(guslar.url)

    expect(world.slots.map((slot) => [slot.slot, slot.kind])).toEqual([
      ["forest", "region"],
      ["marsh", "fog"],
      ["mountains", "fog"],
      ["river-town", "region"],
      ["mines", "fog"],
      ["ruins", "fog"],
    ])
  })

  it("shows the world only to its own map: not to another site, nor through a rebound name", async () => {
    guslar = await startGuslar(["--no-open", "--world", worldFile])
    const url = new URL(guslar.url)
    const ws = url.href.replace(/^http/, "ws") + "ws"
    const opens = (options: WebSocket.ClientOptions) =>
      new Promise<number>((resolve) => {
        const socket = new WebSocket(ws, options)
        socket.once("open", () => {
          socket.close()
          resolve(101)
        })
        socket.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0))
      })
    expect(await opens({ origin: url.origin })).toBe(101)
    expect(await opens({ origin: "https://evil.example" })).toBe(403)
    expect(await opens({ headers: { host: `evil.example:${url.port}` } })).toBe(403)

    const read = (host?: string) =>
      new Promise<number>((resolve, reject) => {
        const req = request(new URL("/api/world", url), { headers: host ? { host } : {} }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.once("error", reject)
        req.end()
      })
    expect(await read()).toBe(200)
    expect(await read(`evil.example:${url.port}`)).toBe(403)
  })

  it("reads ~/.guslar/world.json by default, and a missing one is a world all under fog", async () => {
    const home = tempDir()
    guslar = await startGuslar([], home)
    const empty = await receiveWorld(guslar.url)
    expect(empty.slots.every((slot) => slot.kind === "fog")).toBe(true)
    expect(guslar.output()).toContain(path.join(home, ".guslar", "world.json"))
    await guslar.stop()

    mkdirSync(path.join(home, ".guslar"))
    writeFileSync(
      path.join(home, ".guslar", "world.json"),
      JSON.stringify({ regions: [{ slot: "marsh", repo: "/tmp/somewhere" }] }),
    )
    guslar = await startGuslar([], home)
    const world = await receiveWorld(guslar.url)
    expect(world.slots.find((slot) => slot.slot === "marsh")).toEqual({
      slot: "marsh",
      kind: "region",
      name: "somewhere",
      repo: "/tmp/somewhere",
      villages: [],
    })
  })

  it("refuses a world.json that puts two repos in one slot, or names an unknown slot", async () => {
    const dir = tempDir()

    const twice = path.join(dir, "twice.json")
    writeFileSync(twice, JSON.stringify({ regions: [{ slot: "ruins", repo: "a" }, { slot: "ruins", repo: "b" }] }))
    const doubled = await failGuslar(["--world", twice])
    expect(doubled.code).toBe(1)
    expect(doubled.output).toContain(`regions[1].slot "ruins" is already taken`)

    const unknown = path.join(dir, "unknown.json")
    writeFileSync(unknown, JSON.stringify({ regions: [{ slot: "desert", repo: "a" }] }))
    const misnamed = await failGuslar(["--world", unknown])
    expect(misnamed.code).toBe(1)
    expect(misnamed.output).toContain("regions[0].slot must be one of forest, marsh")
  })
})
