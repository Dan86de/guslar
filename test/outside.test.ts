import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, runGuslar, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const SESSION = "c3d9e0a4-7b2f-4e61-8d15-2a9f6b7c4e83"

function worldOf(repo: string): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions: [{ slot: "forest", repo, name: "Bogwater Reach" }] }))
  return file
}

/**
 * Starts a claude in `cwd` the way a user does in a terminal: their HOME, and nothing of Guslar's
 * in its environment. It replays the outside session's transcript, running the repo's hooks.
 */
function startOutside(guslar: Running, cwd: string, gates: string): ChildProcess {
  return spawn(process.execPath, [path.join(fixtures, "fake-claude.mjs")], {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: guslar.home,
      FAKE_CLAUDE_LOG: guslar.claudeLog,
      FAKE_CLAUDE_TRANSCRIPT: path.join(fixtures, "transcripts", "outside.jsonl"),
      FAKE_CLAUDE_GATES: gates,
      FAKE_CLAUDE_PROMPT: "/implement-slice .scratch/slices/drain-the-bog.json",
    },
    stdio: "ignore",
  })
}

function outsider(world: WorldState): Hunter | undefined {
  return world.hunters.find((h) => h.outside)
}

describe("a session started outside Guslar", () => {
  let guslar: Running | undefined
  let session: ChildProcess | undefined
  afterEach(async () => {
    session?.kill()
    session = undefined
    await guslar?.stop()
    guslar = undefined
  })

  async function start(): Promise<{ running: Running; bog: ReturnType<typeof bogwater>; gates: string }> {
    const bog = bogwater()
    const world = worldOf(bog.repo)
    expect((await runGuslar(["hooks", "install", "--world", world])).code).toBe(0)
    guslar = await startGuslar(["--no-open", "--world", world])
    await receiveWorld(guslar.url)
    return { running: guslar, bog, gates: tempDir() }
  }

  it("says where Guslar listens while it runs, and no longer once it stops", async () => {
    const { running } = await start()
    const dir = path.join(running.home, ".guslar", "running")
    const [file] = readdirSync(dir)
    expect(file).toBe(`${running.process.pid}.json`)
    expect(JSON.parse(readFileSync(path.join(dir, file ?? ""), "utf8"))).toEqual({ url: running.url })
    await running.stop()
    expect(existsSync(path.join(running.home, ".guslar"))).toBe(false)
  })

  it("appears as a hunter in its region on its SessionStart, with no journal to type into", async () => {
    const { running, bog, gates } = await start()
    const seen = awaitWorld(running.url, (w) => outsider(w) !== undefined)
    session = startOutside(running, bog.repo, gates)
    const hunter = outsider(await seen)
    expect(hunter).toMatchObject({
      name: "Wojmir",
      outside: true,
      slot: "forest",
      state: "riding-out",
      permissionMode: "default",
      sessionId: SESSION,
      lastHook: { event: "SessionStart" },
      journal: [],
    })
    expect(hunter).not.toHaveProperty("rite")
    expect(hunter).not.toHaveProperty("village")

    const origin = { "content-type": "application/json", origin: new URL(running.url).origin }
    const reply = await fetch(new URL(`/api/hunters/${hunter?.id}/replies`, running.url), {
      method: "POST",
      headers: origin,
      body: JSON.stringify({ text: "Carry on" }),
    })
    expect([reply.status, await reply.json()]).toEqual([
      409,
      { error: "Wojmir was started outside Guslar: write to it in its own terminal." },
    ])
    const terminal = await fetch(new URL(`/api/hunters/${hunter?.id}/terminal`, running.url), {
      method: "POST",
      headers: origin,
      body: "{}",
    })
    expect(terminal.status).toBe(409)
  })

  it("is not seen from a folder no region holds, nor as a hunter's own session resumed", async () => {
    const { running } = await start()
    const post = (input: Record<string, unknown>) =>
      fetch(new URL("/api/hooks", running.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      }).then(async (res) => [res.status, await res.json()] as const)
    expect(await post({ hook_event_name: "SessionStart", session_id: "elsewhere", cwd: tempDir() })).toEqual([
      202,
      { heard: false },
    ])
    expect((await receiveWorld(running.url)).hunters).toEqual([])
  })

  it("is bound to the contract its first reply line names, and follows a spawned hunter's states", async () => {
    const { running, bog, gates } = await start()
    const at = (until: (hunter: Hunter) => boolean) =>
      awaitWorld(running.url, (w) => {
        const hunter = outsider(w)
        return hunter !== undefined && until(hunter)
      }).then((w) => outsider(w) as Hunter)
    const open = (gate: string) => writeFileSync(path.join(gates, gate), "open")

    const riding = at((h) => h.state === "riding-out")
    session = startOutside(running, bog.repo, gates)
    expect((await riding).contract).toBeUndefined()

    // Its first reply line names S3, and the prompt's slices file says which village's.
    const bound = at((h) => h.contract === "S3" && h.lastHook?.event === "PreToolUse")
    open("prompt")
    expect(await bound).toMatchObject({
      rite: "implement-slice",
      village: "drain-the-bog",
      contract: "S3",
      state: "hunting",
      journal: [
        { kind: "you", text: "/implement-slice .scratch/slices/drain-the-bog.json" },
        { kind: "said", text: "Slice S3: Lay the plank road (also ready: S2)" },
        { kind: "tool", tool: "Bash", input: "git status --short" },
      ],
    })

    // It holds its village as a spawned hunter does.
    const refused = await fetch(new URL("/api/hunters", running.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(running.url).origin },
      body: JSON.stringify({ slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }),
    })
    expect([refused.status, await refused.json()]).toEqual([
      409,
      { error: "Drain the bog refuses a second hunter: Wojmir is out on S3." },
    ])

    const awaiting = at((h) => h.state === "awaiting-you")
    open("permission")
    // Asked in its own terminal: the map shows it waits on you, and holds no prompt of its own.
    expect(await awaiting).toMatchObject({ lastHook: { event: "PermissionRequest", tool: "Bash" } })
    expect(await awaiting).not.toHaveProperty("prompt")

    const hunting = at((h) => h.state === "hunting" && h.lastHook?.event === "PostToolUse")
    open("allow")
    await hunting

    const trophy = at((h) => h.state === "returned-trophy")
    bog.commit("Lay the plank road", "Slice: S3")
    await trophy

    const stopped = at((h) => h.lastHook?.event === "Stop")
    open("stop")
    expect(await stopped).toMatchObject({ state: "returned-trophy", journal: expect.arrayContaining([{ kind: "result", text: "", error: false }]) as unknown })

    const gone = awaitWorld(running.url, (w) => outsider(w) === undefined)
    open("end")
    await gone
    // Every hook it ran exited 0 and printed nothing into the session.
    const log = await waitFor(() => {
      const text = existsSync(running.claudeLog) ? readFileSync(running.claudeLog, "utf8") : ""
      return text.includes('"ended":true') ? text : undefined
    }, "the outside claude to end")
    const hooks = log
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const { hook } = JSON.parse(line) as { hook?: { event: string; status: number; stdout: string } }
        return hook ? [{ event: hook.event, status: hook.status, stdout: hook.stdout }] : []
      })
    expect(hooks).toEqual(
      ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop", "SessionEnd"].map(
        (event) => ({ event, status: 0, stdout: "" }),
      ),
    )
  })

  it("returns wounded when its turn ends with no commit", async () => {
    const { running, bog, gates } = await start()
    for (const gate of ["prompt", "permission", "allow", "stop"]) writeFileSync(path.join(gates, gate), "open")
    const wounded = awaitWorld(running.url, (w) => outsider(w)?.state === "returned-wounded")
    session = startOutside(running, bog.repo, gates)
    expect(outsider(await wounded)).toMatchObject({ contract: "S3", lastHook: { event: "Stop" } })
    const [s3] = (await receiveWorld(running.url)).slots.flatMap((slot) =>
      slot.kind === "region" ? slot.villages.flatMap((v) => v.contracts.filter((c) => v.slug === "drain-the-bog" && c.id === "S3")) : [],
    )
    expect(s3?.state).toBe("ready")
  })
})
