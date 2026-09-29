import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Hunter, Refusal, TakeRequest } from "../src/shared/world.js"
import { bogwater, fixtureRegion, type FixtureRegion } from "./fixture-region.js"
import { awaitWorld, fixtures, receiveWorld, runGuslar, startGuslar, tempDir, waitFor, type Running } from "./guslar.js"

const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "Stop",
  "SessionEnd",
]

const SETTINGS = path.join(".claude", "settings.local.json")

/** A settings file the way Claude Code leaves one, with hooks of the user's own. */
const THEIRS = `${JSON.stringify(
  {
    permissions: { allow: ["Bash(npm run check)"], deny: [] },
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "~/bin/audit-bash.sh", timeout: 30 }] },
      ],
      Stop: [{ hooks: [{ type: "command", command: "~/bin/notify-stop.sh" }] }],
    },
    outputStyle: "Explanatory",
  },
  null,
  2,
)}\n`

type Group = { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }
type Settings = { hooks?: Record<string, Group[]> } & Record<string, unknown>

function worldOf(...repos: string[]): string {
  const file = path.join(tempDir(), "world.json")
  const slots = ["forest", "river-town", "marsh"]
  writeFileSync(file, JSON.stringify({ regions: repos.map((repo, i) => ({ slot: slots[i], repo })) }))
  return file
}

function settingsOf(region: FixtureRegion): string {
  return readFileSync(path.join(region.repo, SETTINGS), "utf8")
}

function isGuslars(group: Group): boolean {
  return group.hooks.some((hook) => hook.command.includes("guslar-hook.js"))
}

describe("installing and removing Guslar's hooks", () => {
  it("adds a hook for each event after the user's own, leaving theirs byte-identical", async () => {
    const bog = fixtureRegion()
    bog.write(SETTINGS, THEIRS)
    const world = worldOf(bog.repo)

    const { code, output } = await runGuslar(["hooks", "install", "--world", world])
    expect(code).toBe(0)
    expect(output).toBe(
      `Guslar reads ${world} (1 region)\nGuslar's hooks installed in ${path.join(bog.repo, SETTINGS)}\n`,
    )

    const text = settingsOf(bog)
    const installed = JSON.parse(text) as Settings
    const before = JSON.parse(THEIRS) as Settings
    // Every setting but hooks is untouched, and each of the user's groups keeps its place and bytes.
    expect({ ...installed, hooks: undefined }).toEqual({ ...before, hooks: undefined })
    for (const [event, groups] of Object.entries(before.hooks ?? {})) {
      expect(installed.hooks?.[event]?.slice(0, groups.length)).toEqual(groups)
      for (const group of groups) expect(text).toContain(JSON.stringify(group, null, 2).replaceAll("\n", "\n      "))
    }
    const script = path.resolve("dist/server/guslar-hook.js")
    for (const event of EVENTS) {
      // A permission request waits on your answer on the map; every other event is posted and done.
      const timeout = event === "PermissionRequest" ? 300 : 10
      expect(installed.hooks?.[event]?.filter(isGuslars)).toEqual([
        { hooks: [{ type: "command", command: `node '${script}'`, timeout }] },
      ])
    }
  })

  it("leaves the file exactly as it was when they are removed", async () => {
    const bog = fixtureRegion()
    bog.write(SETTINGS, THEIRS)
    const world = worldOf(bog.repo)
    await runGuslar(["hooks", "install", "--world", world])

    const { code, output } = await runGuslar(["hooks", "remove", "--world", world])
    expect(code).toBe(0)
    expect(output).toContain(`Guslar's hooks removed from ${path.join(bog.repo, SETTINGS)}\n`)
    expect(settingsOf(bog)).toBe(THEIRS)

    const again = await runGuslar(["hooks", "remove", "--world", world])
    expect(again.output).toContain(`No Guslar hooks in ${path.join(bog.repo, SETTINGS)}\n`)
    expect(settingsOf(bog)).toBe(THEIRS)
  })

  it("adds nothing when installed twice", async () => {
    const bog = fixtureRegion()
    bog.write(SETTINGS, THEIRS)
    const world = worldOf(bog.repo)
    await runGuslar(["hooks", "install", "--world", world])
    const once = settingsOf(bog)

    const { code, output } = await runGuslar(["hooks", "install", "--world", world])
    expect(code).toBe(0)
    expect(output).toContain(`Guslar's hooks are already in ${path.join(bog.repo, SETTINGS)}\n`)
    expect(settingsOf(bog)).toBe(once)
  })

  it("keeps a one-line settings file on one line", async () => {
    const bog = fixtureRegion()
    const compact = '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"~/bin/notify-stop.sh"}]}]},"model":"opus"}'
    bog.write(SETTINGS, compact)
    const world = worldOf(bog.repo)

    await runGuslar(["hooks", "install", "--world", world])
    expect(settingsOf(bog)).not.toContain("\n")
    await runGuslar(["hooks", "remove", "--world", world])
    expect(settingsOf(bog)).toBe(compact)
  })

  it("makes a settings file git does not see, and takes it and the exclude line away again", async () => {
    const kettle = fixtureRegion()
    kettle.write("README.md", "Kettle\n")
    kettle.git("add", ".")
    kettle.commit("Found the town")
    const exclude = path.join(kettle.repo, ".git", "info", "exclude")
    const excludeBefore = readFileSync(exclude, "utf8")
    const world = worldOf(kettle.repo)

    const { output } = await runGuslar(["hooks", "install", "--world", world])
    expect(output).toContain(`Guslar's hooks installed in ${path.join(kettle.repo, SETTINGS)}\n`)
    const installed = JSON.parse(settingsOf(kettle)) as Settings
    expect(Object.keys(installed)).toEqual(["hooks"])
    expect(Object.keys(installed.hooks ?? {})).toEqual(EVENTS)
    // implement-slice needs a clean tree, so git must not show the new file.
    expect(kettle.git("status", "--porcelain")).toBe("")

    const removed = await runGuslar(["hooks", "remove", "--world", world])
    expect(removed.output).toContain(
      `Guslar's hooks removed from ${path.join(kettle.repo, SETTINGS)}, which held nothing else and is gone\n`,
    )
    expect(existsSync(path.join(kettle.repo, ".claude"))).toBe(false)
    expect(readFileSync(exclude, "utf8")).toBe(excludeBefore)
    expect(kettle.git("status", "--porcelain")).toBe("")
  })

  it("installs into every region's repo, and refuses a broken settings file before writing any", async () => {
    const bog = fixtureRegion()
    const kettle = fixtureRegion()
    kettle.write(SETTINGS, '{"hooks": [')
    const world = worldOf(bog.repo, kettle.repo)

    const refused = await runGuslar(["hooks", "install", "--world", world])
    expect(refused.code).toBe(1)
    expect(refused.output).toContain(`guslar: ${path.join(kettle.repo, SETTINGS)} is not valid JSON:`)
    expect(existsSync(path.join(bog.repo, SETTINGS))).toBe(false)
    expect(settingsOf(kettle)).toBe('{"hooks": [')

    kettle.write(SETTINGS, "{}\n")
    const { code, output } = await runGuslar(["hooks", "install", "--world", world])
    expect(code).toBe(0)
    expect(output).toContain(`Guslar reads ${world} (2 regions)\n`)
    expect(output).toContain(`Guslar's hooks installed in ${path.join(bog.repo, SETTINGS)}\n`)
    expect(output).toContain(`Guslar's hooks installed in ${path.join(kettle.repo, SETTINGS)}\n`)
  })

  it("refuses a region whose repo is not a folder, and a hooks command it does not know", async () => {
    const gone = path.join(tempDir(), "gone")
    const world = worldOf(gone)
    expect(await runGuslar(["hooks", "install", "--world", world])).toEqual({
      code: 1,
      output: `Guslar reads ${world} (1 region)\nguslar: ${gone} is not a folder\n`,
    })

    expect(await runGuslar(["hooks", "mend", "--world", world])).toEqual({
      code: 1,
      output: 'guslar: hooks takes install or remove, got "mend"\n',
    })
    expect(await runGuslar(["summon"])).toEqual({
      code: 1,
      output: 'guslar: there is no command "summon". See guslar --help.\n',
    })
  })
})

describe("a hook event from a hunter's session", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  const S3: TakeRequest = { slot: "forest", village: "drain-the-bog", contract: "S3", permissionMode: "acceptEdits" }

  async function take(running: Running): Promise<Hunter> {
    const res = await fetch(new URL("/api/hunters", running.url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(running.url).origin },
      body: JSON.stringify(S3),
    })
    const body = (await res.json()) as { hunter?: Hunter; refusal?: Refusal }
    if (!body.hunter) throw new Error(`no hunter: ${JSON.stringify(body.refusal)}`)
    return body.hunter
  }

  it("reaches the broadcast state of that hunter, through the installed hook", async () => {
    const bog = bogwater()
    const world = worldOf(bog.repo)
    expect((await runGuslar(["hooks", "install", "--world", world])).code).toBe(0)
    const gates = tempDir()
    guslar = await startGuslar(["--no-open", "--world", world], tempDir(), {
      FAKE_CLAUDE_TRANSCRIPT: path.join(fixtures, "transcripts", "hooks.jsonl"),
      FAKE_CLAUDE_GATES: gates,
    })
    await receiveWorld(guslar.url)

    const tool = awaitWorld(guslar.url, (w) => w.hunters[0]?.lastHook?.event === "PreToolUse")
    const hunter = await take(guslar)
    expect((await tool).hunters[0]).toMatchObject({ id: hunter.id, lastHook: { event: "PreToolUse", tool: "Bash" } })

    const stopped = awaitWorld(guslar.url, (w) => w.hunters[0]?.lastHook?.event === "Stop")
    writeFileSync(path.join(gates, "stop"), "open")
    expect((await stopped).hunters[0]?.lastHook).toEqual({ event: "Stop" })

    // The claude was told where Guslar listens, and every hook it ran exited 0 and printed nothing.
    const running = guslar
    const log = await waitFor(() => {
      const lines = existsSync(running.claudeLog) ? readFileSync(running.claudeLog, "utf8") : ""
      return lines.includes('"event":"Stop"') ? lines : undefined
    }, "the Stop hook to run")
    const events = log
      .split("\n")
      .filter(Boolean)
      .map(
        (line) =>
          JSON.parse(line) as {
            started?: { url?: string }
            hook?: { event: string; command: string; status: number; stdout: string }
          },
      )
    expect(events.find((e) => e.started)?.started?.url).toBe(guslar.url)
    const ran = events.flatMap((e) => (e.hook ? [e.hook] : []))
    expect(ran.map(({ event, status, stdout }) => ({ event, status, stdout }))).toEqual(
      ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"].map((event) => ({ event, status: 0, stdout: "" })),
    )
    for (const { command } of ran) expect(command).toContain("guslar-hook.js")
  })

  it("is posted only by this machine, and one naming no hunter from no region is not heard", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf(bog.repo)])
    await receiveWorld(guslar.url)
    const url = new URL("/api/hooks", guslar.url)
    const input = { hook_event_name: "SessionStart", session_id: "outside", cwd: tempDir() }

    const outside = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input }) })
    expect([outside.status, await outside.json()]).toEqual([202, { heard: false }])
    const foreign = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ hunterId: "x", input }),
    })
    expect(foreign.status).toBe(403)
    const garbled = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: '{"input": 3}' })
    expect(garbled.status).toBe(400)
    expect((await receiveWorld(guslar.url)).hunters).toEqual([])
  })

  it("never stops a session: with no Guslar to post to, the hook exits 0 and prints nothing", () => {
    const script = path.resolve("dist/server/guslar-hook.js")
    const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash" })
    for (const env of [{}, { GUSLAR_URL: "http://127.0.0.1:9/", GUSLAR_HUNTER_ID: "gone" }]) {
      const out = execFileSync(process.execPath, [script], { input, encoding: "utf8", env: { PATH: process.env.PATH, ...env } })
      expect(out).toBe("")
    }
  })
})
