import { execFile } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, PermissionAnswer, PermissionPrompt, Refusal, TakeRequest, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, runGuslar, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const run = promisify(execFile)

const TRANSCRIPT = path.join(fixtures, "transcripts", "permission.jsonl")
const HOOK = path.resolve("dist/server/guslar-hook.js")
const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "default" }

type Ran = { event: string; command: string; status: number; stdout: string }

function worldOf(repo: string): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions: [{ slot: "forest", repo }] }))
  return file
}

function post(running: Running, route: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(new URL(route, running.url), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(running.url).origin, ...headers },
    body: JSON.stringify(body),
  })
}

async function take(running: Running): Promise<Hunter> {
  const body = (await (await post(running, "/api/hunters", S3)).json()) as { hunter?: Hunter; refusal?: Refusal }
  if (!body.hunter) throw new Error(`no hunter: ${JSON.stringify(body.refusal)}`)
  return body.hunter
}

/** The prompt the first hunter shows in this world. */
function promptOf(world: WorldState): PermissionPrompt {
  const prompt = world.hunters[0]?.prompt
  if (!prompt) throw new Error("the hunter shows no prompt")
  return prompt
}

function answer(running: Running, hunter: Hunter, prompt: PermissionPrompt, decision: PermissionAnswer): Promise<Response> {
  return post(running, `/api/hunters/${hunter.id}/prompts/${prompt.id}`, decision)
}

/** The PermissionRequest hooks the fake claude has run so far, with what each printed. */
function permissionHooks(running: Running): Ran[] {
  const lines = existsSync(running.claudeLog) ? readFileSync(running.claudeLog, "utf8").split("\n").filter(Boolean) : []
  return lines
    .map((line) => (JSON.parse(line) as { hook?: Ran }).hook)
    .filter((hook): hook is Ran => hook?.event === "PermissionRequest")
}

/** Runs the installed hook as Claude Code would, with this event on its stdin, and returns what it printed. */
async function runHook(event: object, env: Record<string, string>): Promise<string> {
  const child = run(process.execPath, [HOOK], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } })
  child.child.stdin?.end(JSON.stringify(event))
  return (await child).stdout
}

const BASH_REQUEST = {
  session_id: "s",
  cwd: "/repo",
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: { command: "rm -rf build" },
}

describe("a permission request from a hunter", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  async function start(): Promise<Running> {
    const bog = bogwater()
    const world = worldOf(bog.repo)
    expect((await runGuslar(["hooks", "install", "--world", world])).code).toBe(0)
    guslar = await startGuslar(["--no-open", "--world", world], tempDir(), { FAKE_CLAUDE_TRANSCRIPT: TRANSCRIPT })
    await receiveWorld(guslar.url)
    return guslar
  }

  it("awaits you with the tool and its input, and the hook runs what you allow or deny", async () => {
    const running = await start()

    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt?.input.command === "npm run check")
    const hunter = await take(running)
    const first = (await asked).hunters[0]
    expect(first).toMatchObject({
      id: hunter.id,
      state: "awaiting-you",
      prompt: { tool: "Bash", input: { command: "npm run check", description: "Run the project checks" } },
      lastHook: { event: "PermissionRequest", tool: "Bash" },
    })
    // The hook is still waiting on you: nothing has come back to the session yet.
    expect(permissionHooks(running)).toEqual([])

    const second = awaitWorld(running.url, (w) => w.hunters[0]?.prompt?.input.command === "git push --force origin main")
    const allowed = await answer(running, hunter, promptOf(await asked), { behavior: "allow" })
    expect(allowed.status).toBe(200)
    const allowedHook = await waitFor(() => permissionHooks(running)[0], "the first PermissionRequest hook to end")
    expect(allowedHook).toMatchObject({ status: 0 })
    expect(JSON.parse(allowedHook.stdout)).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
    })

    expect((await second).hunters[0]?.state).toBe("awaiting-you")
    const next = promptOf(await second)
    const back = awaitWorld(running.url, (w) => w.hunters[0]?.prompt === undefined && w.hunters[0]?.state !== "awaiting-you")
    const denied = await answer(running, hunter, next, {
      behavior: "deny",
      message: "Push to the slices branch, never to main.",
    })
    expect(denied.status).toBe(200)
    expect((await back).hunters[0]?.prompt).toBeUndefined()
    const deniedHook = await waitFor(() => permissionHooks(running)[1], "the second PermissionRequest hook to end")
    expect(JSON.parse(deniedHook.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: "Push to the slices branch, never to main." },
      },
    })

    // An answer to a prompt already answered finds no one waiting.
    expect((await answer(running, hunter, next, { behavior: "allow" })).status).toBe(409)
  })

  it("leaves awaiting you the moment you allow it", async () => {
    const running = await start()
    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt !== undefined)
    const hunter = await take(running)
    const prompt = promptOf(await asked)

    const left = awaitWorld(running.url, (w) => w.hunters[0]?.state === "hunting" && w.hunters[0].prompt === undefined)
    await answer(running, hunter, prompt, { behavior: "allow" })
    await left
  })

  it("takes answers only from its own map, and only answers it can read", async () => {
    const running = await start()
    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt !== undefined)
    const hunter = await take(running)
    const route = `/api/hunters/${hunter.id}/prompts/${promptOf(await asked).id}`

    expect((await post(running, route, { behavior: "allow" }, { origin: "https://evil.example" })).status).toBe(403)
    expect((await post(running, route, { behavior: "maybe" })).status).toBe(400)
    expect((await post(running, route, { behavior: "deny", message: 3 })).status).toBe(400)
    expect(permissionHooks(running)).toEqual([])
    expect((await receiveWorld(running.url)).hunters[0]?.state).toBe("awaiting-you")
  })

  it("keeps the hook waiting on you for as long as you take", { timeout: 20_000 }, async () => {
    // No transcript: the hunter's claude only listens, and this test runs its hook.
    const bog = bogwater()
    const running = (guslar = await startGuslar(["--no-open", "--world", worldOf(bog.repo)]))
    await receiveWorld(running.url)
    const hunter = await take(running)

    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt !== undefined)
    let printed: string | undefined
    const hook = runHook(BASH_REQUEST, { GUSLAR_URL: running.url, GUSLAR_HUNTER_ID: hunter.id }).then((out) => (printed = out))
    const prompt = promptOf(await asked)

    // Longer than any socket timeout on the way: the hook must still be waiting, not deciding for you.
    await new Promise((resolve) => setTimeout(resolve, 7000))
    expect(printed).toBeUndefined()
    expect((await receiveWorld(running.url)).hunters[0]?.state).toBe("awaiting-you")

    await answer(running, hunter, prompt, { behavior: "deny" })
    expect(JSON.parse(await hook)).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny" } },
    })
  })

  it("goes with the hook when the hook stops waiting", async () => {
    // No transcript: the hunter's claude only listens, and this test is its hook.
    const bog = bogwater()
    const running = (guslar = await startGuslar(["--no-open", "--world", worldOf(bog.repo)]))
    await receiveWorld(running.url)
    const hunter = await take(running)

    const hook = new AbortController()
    const asked = awaitWorld(running.url, (w) => w.hunters[0]?.prompt?.input.command === "rm -rf build")
    const waiting = fetch(new URL("/api/hooks", running.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hunterId: hunter.id, input: BASH_REQUEST }),
      signal: hook.signal,
    }).catch(() => "gave up")
    expect((await asked).hunters[0]?.state).toBe("awaiting-you")

    const gone = awaitWorld(running.url, (w) => w.hunters.length === 1 && w.hunters[0]?.prompt === undefined)
    hook.abort()
    expect(await waiting).toBe("gave up")
    expect((await gone).hunters[0]?.state).toBe("hunting")
  })
})

describe("the hook's decision when Guslar cannot answer", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("allows a Guslar hunter whose server is unreachable, and decides nothing for any other session", async () => {
    const unreachable = "http://127.0.0.1:9/"
    const allow = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }

    expect(JSON.parse(await runHook(BASH_REQUEST, { GUSLAR_URL: unreachable, GUSLAR_HUNTER_ID: "a-hunter" }))).toEqual(allow)
    expect(JSON.parse(await runHook(BASH_REQUEST, { GUSLAR_HUNTER_ID: "a-hunter" }))).toEqual(allow)
    expect(await runHook(BASH_REQUEST, { GUSLAR_URL: unreachable })).toBe("")
    expect(await runHook(BASH_REQUEST, {})).toBe("")
  })

  it("decides nothing when Guslar is there but holds no such hunter", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf(bog.repo)])
    await receiveWorld(guslar.url)
    expect(await runHook(BASH_REQUEST, { GUSLAR_URL: guslar.url, GUSLAR_HUNTER_ID: "not-out" })).toBe("")
    expect(await runHook(BASH_REQUEST, { GUSLAR_URL: guslar.url })).toBe("")
    expect((await receiveWorld(guslar.url)).hunters).toEqual([])
  })
})
