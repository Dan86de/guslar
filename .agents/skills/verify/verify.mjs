#!/usr/bin/env node
// The verify skill's helper: starts an isolated Guslar and a headless browser for one run,
// drives and reads them, and logs every call to the run's transcript.log.
// Usage is in SKILL.md next to this file.
import { execFileSync, spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import WebSocket from "ws"

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SKILL_DIR, "../../..")
const RUNS = path.join(ROOT, ".scratch", "verify")
const CLI = path.join(ROOT, "dist", "server", "cli.js")

class Refusal extends Error {}

// ---------------------------------------------------------------- output and transcript

let transcript
let printed = ""
function out(line = "") {
  printed += `${line}\n`
  process.stdout.write(`${line}\n`)
}
function quote(arg) {
  return arg !== "" && /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`
}
function logCall(args, code) {
  if (!transcript) return
  const command = [".agents/skills/verify/verify.mjs", ...args].map(quote).join(" ")
  appendFileSync(transcript, `$ ${command}\n${printed}[exit ${code}]\n\n`)
}

// ---------------------------------------------------------------- run folder and state

function newRunId() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${stamp}-${randomBytes(3).toString("hex")}`
}

function runDir(flags) {
  const dir = flags.run
  if (!dir) {
    throw new Refusal(
      "say which run: --run .scratch/verify/<run> (none was given; an option before it with no value may have taken it)",
    )
  }
  const abs = path.resolve(dir)
  if (path.dirname(abs) !== RUNS || !existsSync(path.join(abs, "state.json"))) {
    throw new Refusal(`${dir} is not a run folder this skill started (expected .scratch/verify/<run>/state.json)`)
  }
  transcript = path.join(abs, "transcript.log")
  return abs
}

const readState = (run) => JSON.parse(readFileSync(path.join(run, "state.json"), "utf8"))
const writeState = (run, state) => writeFileSync(path.join(run, "state.json"), `${JSON.stringify(state, null, 2)}\n`)

function inside(child, parent) {
  const rel = path.relative(parent, child)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

// ---------------------------------------------------------------- processes

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function commandOf(pid) {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

async function waitFor(check, what, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** The environment Guslar runs with: this run's HOME, browser opener and claude, and none of the user's settings. */
function guslarEnv(run) {
  return {
    PATH: process.env.PATH,
    HOME: path.join(run, "home"),
    BROWSER: path.join(SKILL_DIR, "record-browser.mjs"),
    VERIFY_BROWSER_LOG: path.join(run, "browser.log"),
    GUSLAR_CLAUDE: RECORD_CLAUDE,
    VERIFY_CLAUDE_LOG: path.join(run, "claude.log"),
  }
}

const RECORD_CLAUDE = path.join(SKILL_DIR, "record-claude.mjs")

/** The recorder claudes this run's Guslar started, by the pids they logged. */
function recordedClaudes(run) {
  const log = path.join(run, "claude.log")
  if (!existsSync(log)) return []
  const pids = new Set()
  for (const match of readFileSync(log, "utf8").matchAll(/^\[pid (\d+)\] started in /gm)) pids.add(Number(match[1]))
  return [...pids]
}

/** Starts Guslar for this run, on `port` (0 picks a free one), and waits for its ready line. */
async function startGuslar(run, state, port) {
  const logFile = path.join(run, "guslar.log")
  const offset = existsSync(logFile) ? statSync(logFile).size : 0
  const log = openSync(logFile, "a")
  const args = [CLI, "--port", String(port), ...(state.world ? ["--world", state.world] : [])]
  const child = spawn(process.execPath, args, {
    cwd: run,
    env: guslarEnv(run),
    stdio: ["ignore", log, log],
    detached: true,
  })
  child.unref()
  const url = await waitFor(() => {
    const text = readFileSync(logFile, "utf8").slice(offset)
    if (child.exitCode !== null) throw new Error(`guslar exited with ${child.exitCode}:\n${text}`)
    return /Guslar is listening on (http:\/\/\S+)/.exec(text)?.[1]
  }, "guslar's ready line")
  return { pid: child.pid, url }
}

async function stopPid(pid, what, signal = "SIGTERM") {
  if (!alive(pid)) {
    out(`${what} (pid ${pid}) was not running`)
    return
  }
  process.kill(pid, signal)
  try {
    await waitFor(() => !alive(pid), `${what} to exit`, 5000)
  } catch {
    process.kill(pid, "SIGKILL")
    await waitFor(() => !alive(pid), `${what} to die`, 5000)
  }
  out(`stopped ${what} (pid ${pid}) with ${signal}`)
}

// ---------------------------------------------------------------- browser

async function withPage(run, fn) {
  const state = readState(run)
  if (!alive(state.chromePid)) throw new Refusal("this run's browser is not running; start a new run")
  const browser = await chromium.connectOverCDP(state.cdp)
  try {
    const context = browser.contexts()[0]
    const page = context.pages()[0] ?? (await context.newPage())
    // The viewport is the run's, set on every command: a CDP override does not outlive its connection.
    const [width, height] = (state.viewport ?? DEFAULT_VIEWPORT).split("x").map(Number)
    const current = await page.evaluate(() => [globalThis.innerWidth, globalThis.innerHeight])
    if (current[0] !== width || current[1] !== height) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(300)
    }
    return await fn(page, state)
  } finally {
    // Disconnects this command; the browser and its page stay up for the next one.
    await browser.close()
  }
}

function ownUrl(state, target) {
  const url = new URL(target ?? "/", state.url)
  if (url.origin !== new URL(state.url).origin) {
    throw new Refusal(`${url.href} is not this run's Guslar (${state.url}); a run drives only what it started`)
  }
  return url.href
}

// ---------------------------------------------------------------- commands

const DEFAULT_VIEWPORT = "1440x900"

/** What a check needs to lay down a region's history: make commits and branches, and read them back. */
const GIT_SUBCOMMANDS = ["init", "add", "commit", "switch", "branch", "log", "rev-parse", "status"]

async function accessibleName(locator) {
  const snapshot = await locator.ariaSnapshot()
  return /^- button "(.*)"/.exec(snapshot)?.[1] ?? snapshot
}

const DEFAULT_WORLD = {
  regions: [
    { slot: "forest", repo: "./repos/bogwater", name: "Bogwater Reach" },
    { slot: "river-town", repo: "./repos/kettle" },
  ],
}

const commands = {
  async start(flags) {
    if (!existsSync(path.join(ROOT, "node_modules", "playwright"))) {
      throw new Refusal("playwright is not installed: run `npm install` in the repo first")
    }
    const id = newRunId()
    const run = path.join(RUNS, id)
    mkdirSync(path.join(run, "home"), { recursive: true })
    transcript = path.join(run, "transcript.log")

    // The world: the default fixture, a copied file, or none at all (a world all under fog).
    let world
    if (flags.world === "none") {
      world = undefined
    } else {
      world = path.join(run, "world.json")
      if (flags.world) cpSync(path.resolve(flags.world), world)
      else writeFileSync(world, `${JSON.stringify(DEFAULT_WORLD, null, 2)}\n`)
      const regions = JSON.parse(readFileSync(world, "utf8")).regions ?? []
      for (const region of regions) {
        const repo = path.resolve(run, String(region.repo).replace(/^~(?=\/|$)/, path.join(run, "home")))
        if (!inside(repo, run)) {
          throw new Refusal(`world repo ${region.repo} is outside the run folder; a run never touches the user's repos`)
        }
        mkdirSync(repo, { recursive: true })
      }
    }

    out(`run folder: ${path.relative(ROOT, run)}`)
    out("building: npm run build")
    try {
      execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] })
    } catch (error) {
      out(String(error.stdout ?? ""))
      out(String(error.stderr ?? ""))
      throw new Error("npm run build failed", { cause: error })
    }

    const state = { run: id, world, head: git("rev-parse", "HEAD"), builtAt: Date.now() }
    const { pid, url } = await startGuslar(run, state, 0)
    Object.assign(state, { guslarPid: pid, url })
    writeState(run, state)

    const chrome = spawn(
      chromium.executablePath(),
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${path.join(run, "chrome")}`,
        "--window-size=1440,900",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"], detached: true },
    )
    let chromeErr = ""
    chrome.stderr.on("data", (chunk) => (chromeErr += chunk))
    const cdp = await waitFor(() => /DevTools listening on (ws:\/\/\S+)/.exec(chromeErr)?.[1], "the browser")
    chrome.stderr.destroy()
    chrome.unref()
    Object.assign(state, { chromePid: chrome.pid, cdp })
    writeState(run, state)

    writeEvidenceSkeleton(run, state)
    out(`guslar: ${url} (pid ${pid})`)
    out(`browser: pid ${chrome.pid}`)
    out(`world: ${world ? path.relative(ROOT, world) : "none (no world.json)"}`)
    out(`next: .agents/skills/verify/verify.mjs doctor --run ${path.relative(ROOT, run)}`)
    return run
  },

  async doctor(flags) {
    const run = runDir(flags)
    const state = readState(run)
    const problems = []

    const command = commandOf(state.guslarPid)
    if (!alive(state.guslarPid)) problems.push(`guslar (pid ${state.guslarPid}) is not running`)
    else if (!command.includes(CLI)) problems.push(`pid ${state.guslarPid} is not this run's guslar: ${command}`)
    else if (state.world && !command.includes(state.world)) problems.push(`pid ${state.guslarPid} reads another world`)

    if (problems.length === 0) {
      try {
        const res = await fetch(new URL("/api/world", state.url), { signal: AbortSignal.timeout(3000) })
        const world = await res.json()
        const foreign = world.slots.filter((s) => s.kind === "region" && !inside(s.repo, run))
        if (foreign.length) problems.push(`serves repos outside the run: ${foreign.map((s) => s.repo).join(", ")}`)
      } catch (error) {
        problems.push(`${state.url} does not answer: ${error.message}`)
      }
    }

    const stale = newerThanBuild(state.builtAt)
    if (stale.length) problems.push(`not the current build; changed since start: ${stale.slice(0, 5).join(", ")}`)

    if (!alive(state.chromePid)) problems.push(`browser (pid ${state.chromePid}) is not running`)

    if (problems.length) {
      out("unfit")
      for (const problem of problems) out(`- ${problem}`)
      return 1
    }
    out(`fit: guslar pid ${state.guslarPid} at ${state.url}, browser pid ${state.chromePid}, build is current`)
    return 0
  },

  async open(flags, [target]) {
    const run = runDir(flags)
    return withPage(run, async (page, state) => {
      const messages = []
      page.on("console", (m) => messages.push(`[${m.type()}] ${m.text()}`))
      page.on("pageerror", (e) => messages.push(`[pageerror] ${e.message}`))
      const url = ownUrl(state, target)
      const res = await page.goto(url, { waitUntil: "load" })
      out(`opened ${url}: HTTP ${res?.status()}`)
      out(`title: ${await page.title()}`)
      // The map is ready when its region list renders and the map stops being busy.
      await page.locator('.map[aria-busy="false"]').waitFor({ timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(1000)
      out(`map busy: ${await page.locator(".map").getAttribute("aria-busy")}`)
      out("console:")
      for (const m of messages) out(`  ${m}`)
      if (messages.length === 0) out("  (nothing)")
      out("page:")
      out(await page.locator("body").ariaSnapshot())
    })
  },

  async snapshot(flags) {
    const run = runDir(flags)
    return withPage(run, async (page) => {
      out(`url: ${page.url()}`)
      out(await page.locator("body").ariaSnapshot())
    })
  },

  async "wait-for"(flags, [text]) {
    const run = runDir(flags)
    if (!text) throw new Refusal("say what to wait for: wait-for <text> [--gone] [--timeout ms]")
    const timeout = Number(flags.timeout ?? 15000)
    return withPage(run, async (page) => {
      const locator = page.getByText(text, { exact: false }).first()
      const started = Date.now()
      try {
        await locator.waitFor({ state: flags.gone ? "detached" : "visible", timeout })
      } catch {
        out(`"${text}" ${flags.gone ? "is still there" : "did not appear"} after ${timeout} ms`)
        return 1
      }
      out(`"${text}" ${flags.gone ? "is gone" : "is visible"} after ${Date.now() - started} ms`)
      return 0
    })
  },

  async screenshot(flags, [name]) {
    const run = runDir(flags)
    if (!name) throw new Refusal("name the screenshot: screenshot <name>")
    if (!/^[\w-]+$/.test(name)) throw new Refusal(`invalid screenshot name "${name}": use letters, digits, - and _`)
    if (flags.size) {
      if (!/^\d+x\d+$/.test(flags.size)) throw new Refusal(`--size takes WIDTHxHEIGHT, like 800x1000, not ${flags.size}`)
      writeState(run, { ...readState(run), viewport: flags.size })
    }
    return withPage(run, async (page) => {
      const file = path.join(run, `${name}.png`)
      let clip
      if (flags.clip) {
        const [x, y, width, height] = flags.clip.split(",").map(Number)
        if ([x, y, width, height].some((n) => !Number.isFinite(n))) throw new Refusal("--clip takes x,y,width,height")
        clip = { x, y, width, height }
      }
      const zoom = Number(flags.zoom ?? 1)
      if (!(zoom >= 1 && zoom <= 4)) throw new Refusal("--zoom takes a number from 1 to 4")
      if (zoom !== 1 && !clip) throw new Refusal("--zoom needs --clip: it magnifies a detail")
      if (clip) {
        // Captured through CDP, which can render the clipped area at a higher scale.
        const cdp = await page.context().newCDPSession(page)
        const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: zoom } })
        writeFileSync(file, Buffer.from(data, "base64"))
        const size = `${Math.round(clip.width * zoom)}x${Math.round(clip.height * zoom)}`
        out(`saved ${path.relative(ROOT, file)} (${size}: ${clip.width}x${clip.height} at ${clip.x},${clip.y}, zoom ${zoom})`)
        return
      }
      await page.screenshot({ path: file })
      const [width, height] = await page.evaluate(() => [globalThis.innerWidth, globalThis.innerHeight])
      out(`saved ${path.relative(ROOT, file)} (${width}x${height})`)
    })
  },

  async world(flags) {
    const run = runDir(flags)
    const state = readState(run)
    const socket = new WebSocket(ownUrl(state, "/ws").replace(/^http/, "ws"))
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no broadcast within 5 s")), 5000)
      socket.once("error", reject)
      socket.once("message", (data) => {
        clearTimeout(timer)
        resolve(JSON.parse(String(data)))
      })
    })
    socket.close()
    out(JSON.stringify(message, null, 2))
  },

  async http(flags, [target]) {
    const run = runDir(flags)
    const state = readState(run)
    const res = await fetch(ownUrl(state, target))
    const body = await res.text()
    out(`HTTP ${res.status} ${res.headers.get("content-type") ?? ""}`)
    out(body.length > 4000 ? `${body.slice(0, 4000)}\n… (${body.length} bytes)` : body)
  },

  async guslar(flags, args) {
    const run = runDir(flags)
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--world" && args[i + 1] && !inside(path.resolve(run, args[i + 1]), run)) {
        throw new Refusal(`--world ${args[i + 1]} is outside the run folder`)
      }
    }
    const env = guslarEnv(run)
    if (flags.env) {
      const [key, value = ""] = flags.env.split(/=(.*)/s)
      if (key !== "GUSLAR_WORLD") throw new Refusal(`--env takes only GUSLAR_WORLD, not ${key}`)
      if (!inside(path.resolve(run, value), run)) throw new Refusal(`GUSLAR_WORLD=${value} is outside the run folder`)
      env.GUSLAR_WORLD = value
    }
    // A one-off `guslar` with this run's environment, for what the CLI says and its exit code.
    // It never opens a browser and never takes the run's port.
    const child = spawn(process.execPath, [CLI, "--port", "0", "--no-open", ...args], {
      cwd: run,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (c) => (output += c))
    child.stderr.on("data", (c) => (output += c))
    out(`one-off guslar pid ${child.pid}`)
    // If it starts, read the world it serves, then stop it.
    const exited = new Promise((resolve) => child.once("exit", (c) => resolve(c)))
    const timeout = Number(flags.timeout ?? 5000)
    const started = await Promise.race([
      exited.then(() => undefined),
      waitFor(() => /Guslar is listening on (http:\/\/\S+)/.exec(output)?.[1], "guslar's ready line", timeout).catch(
        () => undefined,
      ),
    ])
    let served
    if (started) {
      const res = await fetch(new URL("/api/world", started))
      served = await res.text()
      child.kill("SIGTERM")
    } else if (child.exitCode === null) {
      child.kill("SIGTERM")
    }
    const code = await exited
    out(output.trimEnd())
    if (started) {
      out(`it started; world served at /api/world: ${served}`)
      out("stopped it")
    } else {
      out(`guslar exited by itself: ${code}`)
    }
    out(alive(child.pid) ? `pid ${child.pid} is still running` : `pid ${child.pid} has ended`)
  },

  async click(flags, [name]) {
    const run = runDir(flags)
    if (!name) throw new Refusal("say what to click: click <accessible name of a button>")
    return withPage(run, async (page) => {
      const buttons = page.getByRole("button", { name, exact: false })
      const count = await buttons.count()
      if (count !== 1) {
        out(count === 0 ? `no button named "${name}"` : `${count} buttons match "${name}"; name one of them fully`)
        for (const button of await page.getByRole("button").all()) out(`  button: ${await accessibleName(button)}`)
        return 1
      }
      const full = await accessibleName(buttons)
      await buttons.click()
      await page.waitForTimeout(500)
      out(`clicked button "${full}"`)
    })
  },

  async press(flags, [key]) {
    const run = runDir(flags)
    if (!key) throw new Refusal("say which key: press <key>, like Escape or Tab")
    return withPage(run, async (page) => {
      await page.keyboard.press(key)
      await page.waitForTimeout(500)
      out(`pressed ${key}`)
    })
  },

  async git(flags, [repo, subcommand, ...args]) {
    const run = runDir(flags)
    if (!repo || !subcommand) throw new Refusal("git <repo in run folder> <subcommand> [args…]")
    const dir = path.resolve(run, repo)
    if (!inside(dir, run) || dir === run) throw new Refusal(`${repo} is outside the run folder`)
    if (!GIT_SUBCOMMANDS.includes(subcommand)) {
      throw new Refusal(`git ${subcommand} is not one a run needs; use one of ${GIT_SUBCOMMANDS.join(", ")}`)
    }
    mkdirSync(dir, { recursive: true })
    // The run's own identity and HOME, and none of the user's git config: nothing here signs or pushes.
    const child = spawn("git", [subcommand, ...args], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        HOME: path.join(run, "home"),
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CEILING_DIRECTORIES: path.dirname(dir),
        GIT_AUTHOR_NAME: "Verify",
        GIT_AUTHOR_EMAIL: "verify@guslar.invalid",
        GIT_COMMITTER_NAME: "Verify",
        GIT_COMMITTER_EMAIL: "verify@guslar.invalid",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (c) => (output += c))
    child.stderr.on("data", (c) => (output += c))
    const code = await new Promise((resolve) => child.once("exit", resolve))
    if (output.trimEnd()) out(output.trimEnd())
    out(`git exited: ${code}`)
    return code === 0 ? 0 : 1
  },

  async "server-stop"(flags) {
    const run = runDir(flags)
    const state = readState(run)
    const signal = `SIG${String(flags.signal ?? "TERM").toUpperCase().replace(/^SIG/, "")}`
    if (!["SIGINT", "SIGHUP", "SIGTERM", "SIGKILL"].includes(signal)) {
      throw new Refusal(`--signal takes INT (Ctrl-C), HUP (terminal closed), TERM or KILL (a crash), not ${flags.signal}`)
    }
    await stopPid(state.guslarPid, "guslar", signal)
  },

  async "server-start"(flags) {
    const run = runDir(flags)
    const state = readState(run)
    if (alive(state.guslarPid)) throw new Refusal(`guslar is already running (pid ${state.guslarPid})`)
    const port = Number(new URL(state.url).port)
    const { pid, url } = await startGuslar(run, state, port)
    Object.assign(state, { guslarPid: pid, url })
    writeState(run, state)
    out(`guslar: ${url} (pid ${pid}), same port as before`)
  },

  async read(flags, [file]) {
    const run = runDir(flags)
    const target = path.resolve(run, file ?? ".")
    if (!inside(target, run)) throw new Refusal(`${file} is outside the run folder`)
    if (!existsSync(target)) {
      out(`${file} does not exist`)
      return 1
    }
    if (statSync(target).isDirectory()) {
      const entries = readdirSync(target, { withFileTypes: true })
      if (entries.length === 0) out("(empty)")
      for (const entry of entries) out(`${entry.name}${entry.isDirectory() ? "/" : ""}`)
    } else {
      out(readFileSync(target, "utf8").trimEnd())
    }
  },

  async write(flags, [file, content]) {
    const run = runDir(flags)
    if (!file || content === undefined) throw new Refusal("write <path in run folder> <content>")
    const target = path.resolve(run, file)
    if (!inside(target, run) || target === run) throw new Refusal(`${file} is outside the run folder`)
    if (["state.json", "transcript.log", "evidence.md"].includes(path.relative(run, target))) {
      throw new Refusal(`${file} belongs to the skill; write it by other means`)
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`)
    out(`wrote ${path.relative(ROOT, target)}:`)
    out(readFileSync(target, "utf8").trimEnd())
  },

  async stop(flags) {
    const run = runDir(flags)
    const state = readState(run)
    await stopPid(state.guslarPid, "guslar")
    // A stopped Guslar ends its hunters' stdin, so each recorder claude exits by itself; wait for it.
    const claudes = recordedClaudes(run)
    for (const pid of claudes) {
      if (!alive(pid) || !commandOf(pid).includes(RECORD_CLAUDE)) continue
      try {
        await waitFor(() => !alive(pid), "claude to exit", 5000)
      } catch {
        await stopPid(pid, "claude")
      }
    }
    if (claudes.length) out(`claudes ended: ${claudes.filter((pid) => !alive(pid)).length} of ${claudes.length}`)
    await stopPid(state.chromePid, "browser")
    const left = [state.guslarPid, state.chromePid, ...claudes].filter(alive)
    if (left.length) {
      out(`still running: ${left.join(", ")}`)
      return 1
    }
    out(`evidence stays in ${path.relative(ROOT, run)}`)
  },
}

// ---------------------------------------------------------------- evidence and build freshness

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).replace(/\n+$/, "")
}

function newerThanBuild(builtAt) {
  const changed = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (statSync(file).mtimeMs > builtAt) changed.push(path.relative(ROOT, file))
    }
  }
  walk(path.join(ROOT, "src"))
  const art = readdirSync(path.join(ROOT, "art")).filter((file) => file.endsWith(".png")).map((file) => `art/${file}`)
  for (const file of ["index.html", "package.json", "vite.config.ts", ...art]) {
    if (statSync(path.join(ROOT, file)).mtimeMs > builtAt) changed.push(file)
  }
  return changed
}

function writeEvidenceSkeleton(run, state) {
  const dirty = git("status", "--porcelain")
  const lines = [
    `# Verify run ${state.run}`,
    "",
    `- Commit: ${state.head} on \`${git("rev-parse", "--abbrev-ref", "HEAD")}\``,
    `- Uncommitted changes: ${dirty ? `yes\n\n\`\`\`text\n${dirty}\n\`\`\`` : "no"}`,
    "",
    "## Setup",
    "",
    "<!-- start, the first doctor, and the feature's preconditions, copied from transcript.log. Not checks. -->",
    "",
    "## Checks",
    "",
    "<!-- One section per check:",
    "### <feature file>: <step name>",
    "- Verdict: pass | fail | manual | not driven",
    "- Note: what happened",
    "- Captured: screenshots and files read, by name in the run folder, or none",
    "",
    "```text",
    "<every command run for this check, with its output, copied from transcript.log>",
    "```",
    "-->",
    "",
    "## Stop",
    "",
    "<!-- stop and the final doctor, which must say unfit, copied from transcript.log. Not checks. -->",
    "",
    "## Verdict",
    "",
    "PLACEHOLDER: replace with Done / Done, with n not driven (name them) / Not done (name the failed checks) / Done once the map changes in this PR.",
    "",
  ]
  writeFileSync(path.join(run, "evidence.md"), lines.join("\n"))
}

// ---------------------------------------------------------------- main

function parse(argv) {
  const [name, ...rest] = argv
  const flags = {}
  const positional = []
  // `guslar` and `git` pass their own options through; only --run (and --env for guslar) is the helper's.
  const passthrough = name === "guslar" || name === "git"
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === "--run" || (name === "guslar" && arg === "--env") || (!passthrough && ["--world", "--timeout", "--size", "--signal", "--clip", "--zoom"].includes(arg))) {
      flags[arg.slice(2)] = rest[++i]
    } else if (!passthrough && arg === "--gone") {
      flags.gone = true
    } else {
      positional.push(arg)
    }
  }
  return { name, flags, positional }
}

const argv = process.argv.slice(2)
const { name, flags, positional } = parse(argv)
const command = commands[name]
let code
try {
  if (flags.run && existsSync(path.join(path.resolve(flags.run), "state.json")) && inside(path.resolve(flags.run), RUNS)) {
    transcript = path.join(path.resolve(flags.run), "transcript.log")
  }
  if (!command) {
    out(`usage: verify.mjs <${Object.keys(commands).join("|")}> [--run <run folder>] ...`)
    code = 2
  } else {
    const result = await command(flags, positional)
    code = typeof result === "number" ? result : 0
  }
} catch (error) {
  if (error instanceof Refusal) {
    out(`refused: ${error.message}`)
    code = 3
  } else {
    out(`error: ${error.message}`)
    code = 1
  }
}
logCall(argv, code)
process.exit(code)
