import { readFileSync, realpathSync, writeFileSync } from "node:fs"
import path from "node:path"
import WebSocket from "ws"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, Refusal, TakeRequest, TerminalOutput, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const TRANSCRIPT = path.join(fixtures, "transcripts", "journal.jsonl")

/** The session the transcript's claude says it runs. */
const SESSION = "8c1d6f0a-51b2-4a7e-9e0d-2f4b7c9a1e33"

const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "acceptEdits" }

type Recorded = {
  pid: number
  started?: { cwd: string; args: string[]; hunterId?: string; url?: string }
  tty?: { term?: string }
  typed?: string
  hungUp?: boolean
}

function recorded(guslar: Running): Recorded[] {
  return readFileSync(guslar.claudeLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Recorded)
}

async function post(
  guslar: Running,
  where: string,
  body: unknown,
  origin = new URL(guslar.url).origin,
): Promise<{ status: number; body: { hunter?: Hunter; refusal?: Refusal } }> {
  const res = await fetch(new URL(where, guslar.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as { hunter?: Hunter; refusal?: Refusal } }
}

/** A map's view of a hunter's terminal: everything it was sent, and a way to type into it. */
function attach(
  guslar: Running,
  id: string,
  origin = new URL(guslar.url).origin,
): Promise<{ screen(): string; ended(): number | undefined; type(data: string): void; close(): void }> {
  const url = new URL(`/api/hunters/${id}/terminal`, guslar.url).href.replace(/^http/, "ws")
  const socket = new WebSocket(url, { origin })
  let screen = ""
  let ended: number | undefined
  socket.on("message", (data: Buffer) => {
    const message = JSON.parse(data.toString()) as TerminalOutput
    if (message.type === "output") screen += message.data
    else ended = message.exitCode
  })
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_req, res) => reject(new Error(`refused with ${res.statusCode}`)))
    socket.once("error", reject)
    socket.once("open", () =>
      resolve({
        screen: () => screen,
        ended: () => ended,
        type: (data) => socket.send(JSON.stringify({ type: "input", data })),
        close: () => socket.close(),
      }),
    )
  })
}

describe("open in terminal", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  async function start(): Promise<{ running: Running; repo: string; hunter: Hunter }> {
    const repo = bogwater().repo
    const world = path.join(tempDir(), "world.json")
    writeFileSync(world, JSON.stringify({ regions: [{ slot: "forest", repo }] }))
    const running = await startGuslar(["--no-open", "--world", world], tempDir(), {
      FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT,
      FAKE_CLAUDE_GATES: tempDir(),
    })
    guslar = running
    await receiveWorld(running.url)
    const { body } = await post(running, "/api/hunters", S3)
    if (!body.hunter) throw new Error(`no hunter was sent: ${JSON.stringify(body.refusal)}`)
    return { running, repo, hunter: body.hunter }
  }

  it("resumes the hunter's session in a PTY in its repo, and broadcasts the terminal as the hunter's", async () => {
    const { running, repo, hunter } = await start()
    const withSession = await awaitWorld(running.url, (w) => w.hunters[0]?.sessionId === SESSION)
    expect(withSession.hunters[0]?.terminal).toBeUndefined()

    const opened = await post(running, `/api/hunters/${hunter.id}/terminal`, {})
    expect(opened.status).toBe(201)
    expect(opened.body.hunter?.terminal).toEqual({ state: "open" })
    const world: WorldState = await awaitWorld(running.url, (w) => w.hunters[0]?.terminal?.state === "open")
    expect(world.hunters).toHaveLength(1)
    expect(world.hunters[0]).toMatchObject({ id: hunter.id, sessionId: SESSION, terminal: { state: "open" } })

    const resumed = await waitFor(
      () => recorded(running).find((entry) => entry.started?.args.includes("--resume")),
      "the resumed claude to start",
    )
    expect(resumed.started).toEqual({
      cwd: realpathSync(repo),
      args: ["--resume", SESSION, "--permission-mode", "acceptEdits"],
      url: running.url,
    })
    // It records that it runs in a terminal just after it records its start, so wait for that line.
    const tty = await waitFor(
      () => recorded(running).find((entry) => entry.pid === resumed.pid && entry.tty),
      "the resumed claude to see its terminal",
    )
    expect(tty).toEqual({ pid: resumed.pid, tty: { term: "xterm-256color" } })

    // What it wrote reaches a map, and what the map types reaches it.
    const terminal = await attach(running, hunter.id)
    await waitFor(() => (terminal.screen().includes(`fake claude resumed ${SESSION}`) ? true : undefined), "the banner")
    terminal.type("Oak, from the old grove.\r")
    await waitFor(() => (terminal.screen().includes("heard: Oak, from the old grove.") ? true : undefined), "the answer")
    expect(recorded(running)).toContainEqual({ pid: resumed.pid, typed: "Oak, from the old grove." })

    // A map that attaches later sees it all from the start.
    const later = await attach(running, hunter.id)
    await waitFor(() => (later.screen().includes("heard: Oak") ? true : undefined), "the scrollback")
    expect(later.screen()).toContain(`fake claude resumed ${SESSION}`)
    terminal.close()
    later.close()
  })

  it("gives the open terminal to a second open, and starts no second claude", async () => {
    const { running, hunter } = await start()
    await awaitWorld(running.url, (w) => w.hunters[0]?.sessionId === SESSION)
    const [first, second] = await Promise.all([
      post(running, `/api/hunters/${hunter.id}/terminal`, {}),
      post(running, `/api/hunters/${hunter.id}/terminal`, {}),
    ])
    expect([first.status, second.status].sort()).toEqual([200, 201])
    expect((await post(running, `/api/hunters/${hunter.id}/terminal`, {})).status).toBe(200)
    await waitFor(() => recorded(running).find((entry) => entry.tty), "the resumed claude to start")
    expect(recorded(running).filter((entry) => entry.tty)).toHaveLength(1)
  })

  it("hangs up the terminal when Guslar stops", async () => {
    const { running, hunter } = await start()
    await awaitWorld(running.url, (w) => w.hunters[0]?.sessionId === SESSION)
    await post(running, `/api/hunters/${hunter.id}/terminal`, {})
    const resumed = await waitFor(() => recorded(running).find((entry) => entry.tty), "the resumed claude to start")
    await running.stop()
    await waitFor(
      () => (recorded(running).some((entry) => entry.pid === resumed.pid && entry.hungUp) ? true : undefined),
      "the terminal's claude to be hung up on",
    )
  })

  it("refuses a page elsewhere, a hunter not out, and a terminal not open", async () => {
    const { running, hunter } = await start()
    await awaitWorld(running.url, (w) => w.hunters[0]?.sessionId === SESSION)

    await expect(attach(running, hunter.id)).rejects.toThrow("refused with 404")
    const elsewhere = await post(running, `/api/hunters/${hunter.id}/terminal`, {}, "http://evil.example")
    expect(elsewhere.status).toBe(403)
    const nobody = await post(running, "/api/hunters/00000000-0000-4000-8000-000000000000/terminal", {})
    expect(nobody).toEqual({ status: 404, body: { refusal: { reason: "no-hunter" } } })
    expect(recorded(running).filter((entry) => entry.tty)).toHaveLength(0)

    await post(running, `/api/hunters/${hunter.id}/terminal`, {})
    await expect(attach(running, hunter.id, "http://evil.example")).rejects.toThrow("refused with 403")
  })
})
