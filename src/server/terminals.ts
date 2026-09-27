import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import type { IPty } from "node-pty"
import type { WebSocket } from "ws"
import type { TerminalInput, TerminalOutput } from "../shared/world.js"

/** The most a terminal keeps of what it wrote, sent to each map that attaches after it did. */
const MAX_SCROLLBACK = 512 * 1024

/** The size a terminal starts at, until a map says what it shows. */
const COLS = 100
const ROWS = 30

/** What a terminal runs, and where. */
export type TerminalLaunch = { program: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }

/**
 * node-pty's prebuilt macOS `spawn-helper` is packed without its execute bit, and its install
 * script, which would set it, does not run under npm's script allowlist. Every PTY is forked
 * through it, so set it here, once, before the first one.
 */
function readySpawnHelper(): void {
  if (process.platform === "win32") return
  const root = path.dirname(createRequire(import.meta.url).resolve("node-pty/package.json"))
  for (const dir of ["build/Release", "build/Debug", `prebuilds/${process.platform}-${process.arch}`]) {
    const helper = path.join(root, dir, "spawn-helper")
    if (!existsSync(helper)) continue
    try {
      accessSync(helper, constants.X_OK)
    } catch {
      chmodSync(helper, statSync(helper).mode | 0o111)
    }
  }
}

let nodePty: Promise<typeof import("node-pty")> | undefined

/** node-pty, loaded on the first terminal, so a Guslar whose native build is missing still serves the map. */
function loadNodePty(): Promise<typeof import("node-pty")> {
  nodePty ??= import("node-pty").then((module) => {
    readySpawnHelper()
    return module
  })
  return nodePty
}

function send(socket: WebSocket, message: TerminalOutput): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function parseInput(data: string): TerminalInput | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return undefined
  }
  if (typeof raw !== "object" || raw === null) return undefined
  const message = raw as Record<string, unknown>
  if (message.type === "input" && typeof message.data === "string") return { type: "input", data: message.data }
  const { cols, rows } = message
  if (
    message.type === "resize" &&
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    (cols as number) > 0 &&
    (rows as number) > 0 &&
    (cols as number) <= 1000 &&
    (rows as number) <= 1000
  ) {
    return { type: "resize", cols: cols as number, rows: rows as number }
  }
  return undefined
}

/**
 * A program running in a pseudo-terminal, as it would in a terminal window: every map attached
 * to it sees what it writes, from the start, and what they type reaches it as keys.
 */
export class Terminal {
  private scrollback = ""
  private readonly sockets = new Set<WebSocket>()
  private exitCode: number | undefined

  private constructor(
    private readonly pty: IPty,
    onEnd: (exitCode: number) => void,
  ) {
    pty.onData((data) => {
      this.scrollback = (this.scrollback + data).slice(-MAX_SCROLLBACK)
      for (const socket of this.sockets) send(socket, { type: "output", data })
    })
    pty.onExit(({ exitCode, signal }) => {
      // A program killed by a signal exits as a shell reports it: 128 plus the signal.
      this.exitCode = signal ? 128 + signal : exitCode
      for (const socket of this.sockets) {
        send(socket, { type: "ended", exitCode: this.exitCode })
        socket.close()
      }
      this.sockets.clear()
      onEnd(this.exitCode)
    })
  }

  /** Starts `launch` in a new pseudo-terminal; `onEnd` hears its exit code once it exits. */
  static async open(launch: TerminalLaunch, onEnd: (exitCode: number) => void): Promise<Terminal> {
    const { spawn } = await loadNodePty()
    const pty = spawn(launch.program, launch.args, {
      name: "xterm-256color",
      cols: COLS,
      rows: ROWS,
      cwd: launch.cwd,
      env: launch.env,
    })
    return new Terminal(pty, onEnd)
  }

  get running(): boolean {
    return this.exitCode === undefined
  }

  /** Shows the terminal to a map: what it wrote so far, then everything it writes, and takes its keys. */
  attach(socket: WebSocket): void {
    if (this.exitCode !== undefined) {
      if (this.scrollback) send(socket, { type: "output", data: this.scrollback })
      send(socket, { type: "ended", exitCode: this.exitCode })
      socket.close()
      return
    }
    this.sockets.add(socket)
    if (this.scrollback) send(socket, { type: "output", data: this.scrollback })
    socket.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary || this.exitCode !== undefined) return
      const input = parseInput(data.toString())
      if (input?.type === "input") this.pty.write(input.data)
      else if (input?.type === "resize") this.pty.resize(input.cols, input.rows)
    })
    socket.once("close", () => this.sockets.delete(socket))
  }

  /** Hangs up on the program, as closing its terminal window does. */
  kill(): void {
    if (this.exitCode !== undefined) return
    try {
      this.pty.kill("SIGHUP")
    } catch {
      // it has just exited by itself
    }
  }
}
