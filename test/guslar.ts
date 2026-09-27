import { spawn, type ChildProcess } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"
import type { ServerMessage, WorldState } from "../src/shared/world.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const fixtures = path.join(root, "test", "fixtures")

export function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "guslar-test-"))
}

/** The file `npx guslar` runs: the package's own bin entry. */
function binPath(): string {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { bin: { guslar: string } }
  return path.join(root, pkg.bin.guslar)
}

export type Running = {
  url: string
  home: string
  browserLog: string
  process: ChildProcess
  output(): string
  stop(): Promise<void>
}

/** Starts Guslar the way a user does, with a throwaway HOME and a fake browser. */
export async function startGuslar(args: string[], home = tempDir()): Promise<Running> {
  const browserLog = path.join(home, "browser.log")
  const child = spawn(process.execPath, [binPath(), "--port", "0", ...args], {
    env: {
      PATH: process.env.PATH,
      HOME: home,
      BROWSER: path.join(fixtures, "fake-browser.mjs"),
      FAKE_BROWSER_LOG: browserLog,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let output = ""
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))

  const url = await new Promise<string>((resolve, reject) => {
    const check = () => {
      const match = /listening on (http:\/\/\S+)/.exec(output)
      if (match?.[1]) resolve(match[1])
    }
    child.stdout.on("data", check)
    child.once("exit", (code) => reject(new Error(`guslar exited with ${code}:\n${output}`)))
  })

  return {
    url,
    home,
    browserLog,
    process: child,
    output: () => output,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve()
          return
        }
        child.once("exit", () => resolve())
        child.kill("SIGTERM")
      }),
  }
}

/** Runs Guslar expecting it to refuse to start, and returns what it said. */
export function failGuslar(args: string[]): Promise<{ code: number | null; output: string }> {
  const home = tempDir()
  const child = spawn(process.execPath, [binPath(), "--port", "0", "--no-open", ...args], {
    env: { PATH: process.env.PATH, HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
  return new Promise((resolve) => child.once("exit", (code) => resolve({ code, output })))
}

/** The first world state the server broadcasts to a new map. */
export function receiveWorld(url: string): Promise<WorldState> {
  const socket = new WebSocket(new URL("/ws", url).href.replace(/^http/, "ws"))
  return new Promise((resolve, reject) => {
    socket.once("error", reject)
    socket.once("message", (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage
      socket.close()
      resolve(message.world)
    })
  })
}

export async function waitFor<T>(read: () => T | undefined, what: string, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** Follows the broadcast as an open map does, until `until` holds for a world it received. */
export function awaitWorld(url: string, until: (world: WorldState) => boolean, timeoutMs = 8000): Promise<WorldState> {
  const socket = new WebSocket(new URL("/ws", url).href.replace(/^http/, "ws"))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`no broadcast world matched within ${timeoutMs} ms`))
    }, timeoutMs)
    socket.once("error", reject)
    socket.on("message", (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage
      if (!until(message.world)) return
      clearTimeout(timer)
      socket.close()
      resolve(message.world)
    })
  })
}
