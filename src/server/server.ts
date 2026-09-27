import { existsSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sirv from "sirv"
import { WebSocketServer, type WebSocket } from "ws"
import {
  isPermissionMode,
  isRegionSlot,
  type ServerMessage,
  type SlotState,
  type TakeRequest,
  type WorldState,
} from "../shared/world.js"
import type { Hunters } from "./hunters.js"

export type GuslarServer = {
  url: string
  /** Takes the regions as read from the repos, and sends every open map the new world. */
  update(slots: SlotState[]): void
  close(): Promise<void>
}

/** The largest request body the server reads: a take is a few hundred bytes. */
const MAX_BODY = 64 * 1024

/** The built map lives in dist/client, next to this file's dist/server. */
function clientDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  while (!existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error("guslar: cannot find its own package.json")
    dir = parent
  }
  return path.join(dir, "dist", "client")
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk: string) => {
      body += chunk
      if (body.length > MAX_BODY) reject(new Error("the request is too large"))
    })
    req.once("end", () => resolve(body))
    req.once("error", reject)
  })
}

function parseTake(raw: unknown): TakeRequest | string {
  if (typeof raw !== "object" || raw === null) return "expected { slot, village, contract, permissionMode }"
  const { slot, village, contract, permissionMode } = raw as Record<string, unknown>
  if (!isRegionSlot(slot)) return "slot must be a region slot"
  if (typeof village !== "string" || village === "") return "village must be a slug"
  if (typeof contract !== "string" || contract === "") return "contract must be an id"
  if (!isPermissionMode(permissionMode)) return "permissionMode must be default, acceptEdits, auto or bypassPermissions"
  return { slot, village, contract, permissionMode }
}

export async function startServer(options: {
  slots: SlotState[]
  hunters: Hunters
  host: string
  port: number
}): Promise<GuslarServer> {
  let slots = options.slots
  const { hunters } = options
  const world = (): WorldState => ({ slots, hunters: hunters.list() })
  const dir = clientDir()
  const serveClient = existsSync(dir) ? sirv(dir, { single: true, etag: true }) : undefined
  const host = options.host.includes(":") ? `[${options.host}]` : options.host
  let port = 0

  /**
   * A take starts a program on the user's machine, so only the map this server serves may ask
   * for one: a JSON body (which a page elsewhere cannot send without a preflight this server
   * never answers), from this server's own origin, addressed to this machine by a name it
   * answers to (which a rebound DNS name is not).
   */
  const fromOwnMap = (req: IncomingMessage): boolean => {
    const own = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${host}:${port}`])
    const addressed = req.headers.host ?? ""
    if (!own.has(addressed)) return false
    if (!req.headers["content-type"]?.startsWith("application/json")) return false
    const origin = req.headers.origin
    if (origin === undefined) return true
    try {
      return new URL(origin).host === addressed
    } catch {
      return false
    }
  }

  const take = async (req: IncomingMessage, res: ServerResponse) => {
    if (!fromOwnMap(req)) {
      sendJson(res, 403, { error: "Only the map this Guslar serves may send a hunter." })
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { error: `The request cannot be read: ${(error as Error).message}` })
      return
    }
    const request = parseTake(raw)
    if (typeof request === "string") {
      sendJson(res, 400, { error: `The request cannot be read: ${request}` })
      return
    }
    const result = await hunters.take(request, slots)
    if ("hunter" in result) sendJson(res, 201, result)
    else sendJson(res, result.status, { error: result.error })
  }

  const http: Server = createServer((req, res) => {
    if (req.url === "/api/world") {
      sendJson(res, 200, world())
      return
    }
    if (req.url === "/api/hunters") {
      if (req.method === "POST") {
        take(req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }))
        return
      }
      res.writeHead(405, { allow: "POST" })
      res.end()
      return
    }
    if (serveClient) {
      serveClient(req, res)
      return
    }
    res.writeHead(503, { "content-type": "text/plain" })
    res.end("The map is not built. Run `npm run build` in the guslar package.\n")
  })

  const sockets = new WebSocketServer({ server: http, path: "/ws" })
  const send = (socket: WebSocket) => {
    const message: ServerMessage = { type: "world", world: world() }
    socket.send(JSON.stringify(message))
  }
  const broadcast = () => {
    for (const socket of sockets.clients) send(socket)
  }
  sockets.on("connection", send)
  const unsubscribe = hunters.subscribe(broadcast)

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject)
    http.listen(options.port, options.host, () => {
      http.off("error", reject)
      resolve()
    })
  })

  port = (http.address() as AddressInfo).port

  return {
    url: `http://${host}:${port}/`,
    update(next) {
      slots = next
      broadcast()
    },
    async close() {
      unsubscribe()
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve, reject) => http.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
