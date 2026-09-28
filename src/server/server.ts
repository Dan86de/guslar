import { existsSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { AddressInfo, Socket } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sirv from "sirv"
import { WebSocketServer, type WebSocket } from "ws"
import {
  type HookReply,
  type HookRequest,
  isPermissionMode,
  isRegionSlot,
  isRite,
  type PermissionAnswer,
  RITE_GROUND,
  RITES,
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

/** The largest request body the server reads: a take is a few hundred bytes, a reply a few pages at most. */
const MAX_BODY = 64 * 1024

/**
 * The largest hook event the server reads. A permission request carries the tool's whole input,
 * a Write's file included, and one refused for its size would leave the hunter without an answer.
 */
const MAX_HOOK_BODY = 16 * 1024 * 1024

/** Where a map writes to one hunter: `/api/hunters/<id>/replies`. */
const REPLIES = /^\/api\/hunters\/([0-9a-f-]{36})\/replies$/

/** Where a map opens one hunter's terminal (POST), and shows and types into it (a WebSocket): `/api/hunters/<id>/terminal`. */
const TERMINAL = /^\/api\/hunters\/([0-9a-f-]{36})\/terminal$/

/** Where a map answers one hunter's prompt: `/api/hunters/<id>/prompts/<prompt id>`. */
const PROMPTS = /^\/api\/hunters\/([0-9a-f-]{36})\/prompts\/([0-9a-f-]{36})$/

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

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk: string) => {
      body += chunk
      if (body.length > max) reject(new Error("the request is too large"))
    })
    req.once("end", () => resolve(body))
    req.once("error", reject)
  })
}

function parseTake(raw: unknown): TakeRequest | string {
  if (typeof raw !== "object" || raw === null) return "expected { slot, rite?, village?, contract?, permissionMode }"
  const { slot, rite = "implement-slice", village, contract, permissionMode } = raw as Record<string, unknown>
  if (!isRegionSlot(slot)) return "slot must be a region slot"
  if (!isRite(rite)) return `rite must be one of ${RITES.join(", ")}`
  const ground = RITE_GROUND[rite]
  if (!isPermissionMode(permissionMode)) return "permissionMode must be default, acceptEdits, auto or bypassPermissions"
  if (ground === "region") return { slot, rite, permissionMode }
  if (typeof village !== "string" || village === "") return `village must be a slug for ${rite}`
  if (ground === "village") return { slot, rite, village, permissionMode }
  if (typeof contract !== "string" || contract === "") return `contract must be an id for ${rite}`
  return { slot, rite, village, contract, permissionMode }
}

function parseHook(raw: unknown): HookRequest | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const { hunterId, input } = raw as Record<string, unknown>
  if (hunterId !== undefined && typeof hunterId !== "string") return undefined
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined
  return { hunterId, input: input as HookRequest["input"] }
}

function parseAnswer(raw: unknown): PermissionAnswer | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const { behavior, message } = raw as Record<string, unknown>
  if (behavior === "allow") return { behavior }
  if (behavior !== "deny") return undefined
  if (message === undefined) return { behavior }
  if (typeof message !== "string") return undefined
  return message.trim() === "" ? { behavior } : { behavior, message: message.trim() }
}

function parseReply(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const { text } = raw as Record<string, unknown>
  return typeof text === "string" ? text : undefined
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
   * A take starts a program on the user's machine, and a reply tells it what to do, so only the
   * map this server serves may ask for either: a JSON body (which a page elsewhere cannot send without a preflight this server
   * never answers), from this server's own origin, addressed to this machine by a name it
   * answers to (which a rebound DNS name is not). A hook event moves a hunter on the map, so it
   * passes the same test; Guslar's hook runs outside any page and sends no origin.
   */
  const fromOwnMap = (req: IncomingMessage): boolean =>
    Boolean(req.headers["content-type"]?.startsWith("application/json")) && fromOwnOrigin(req)

  /**
   * Addressed to this machine by a name this server answers to, from this server's own origin or
   * from no page at all. A WebSocket carries no content type, so this is the whole test for one:
   * every browser sends the page's origin with it.
   */
  const fromOwnOrigin = (req: IncomingMessage): boolean => {
    const own = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${host}:${port}`])
    const addressed = req.headers.host ?? ""
    if (!own.has(addressed)) return false
    const origin = req.headers.origin
    if (origin === undefined) return true
    try {
      return new URL(origin).host === addressed
    } catch {
      return false
    }
  }

  /** The JSON a request from the map carries, or undefined once it has been answered with why not. */
  const bodyOf = async (req: IncomingMessage, res: ServerResponse, forbidden: string, max = MAX_BODY): Promise<unknown> => {
    if (!fromOwnMap(req)) {
      sendJson(res, 403, { error: forbidden })
      return undefined
    }
    try {
      return JSON.parse(await readBody(req, max)) as unknown
    } catch (error) {
      sendJson(res, 400, { error: `The request cannot be read: ${(error as Error).message}` })
      return undefined
    }
  }

  const take = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await bodyOf(req, res, "Only the map this Guslar serves may send a hunter.")
    if (raw === undefined) return
    const request = parseTake(raw)
    if (typeof request === "string") {
      sendJson(res, 400, { error: `The request cannot be read: ${request}` })
      return
    }
    const result = await hunters.take(request, slots)
    if ("hunter" in result) sendJson(res, 201, result)
    else sendJson(res, result.status, { error: result.error })
  }

  const reply = async (id: string, req: IncomingMessage, res: ServerResponse) => {
    const raw = await bodyOf(req, res, "Only the map this Guslar serves may write to a hunter.")
    if (raw === undefined) return
    const text = parseReply(raw)
    if (text === undefined) {
      sendJson(res, 400, { error: "The request cannot be read: expected { text }" })
      return
    }
    const result = hunters.reply(id, text)
    if ("sent" in result) sendJson(res, 201, result)
    else sendJson(res, result.status, { error: result.error })
  }

  const answer = async (id: string, promptId: string, req: IncomingMessage, res: ServerResponse) => {
    const raw = await bodyOf(req, res, "Only the map this Guslar serves may answer a hunter.")
    if (raw === undefined) return
    const decision = parseAnswer(raw)
    if (!decision) {
      sendJson(res, 400, { error: 'The request cannot be read: expected { behavior: "allow" } or { behavior: "deny", message? }' })
      return
    }
    const result = hunters.answer(id, promptId, decision)
    if ("answered" in result) sendJson(res, 200, result)
    else sendJson(res, result.status, { error: result.error })
  }

  const openTerminal = async (id: string, req: IncomingMessage, res: ServerResponse) => {
    const raw = await bodyOf(req, res, "Only the map this Guslar serves may open a hunter's terminal.")
    if (raw === undefined) return
    const result = await hunters.openTerminal(id)
    if ("hunter" in result) sendJson(res, result.opened ? 201 : 200, { hunter: result.hunter })
    else sendJson(res, result.status, { error: result.error })
  }

  /**
   * A hook event from a session. A permission request from a hunter is held open until you
   * answer it on the map, and its hook gets your decision; if the hook goes before you answer,
   * the prompt goes with it.
   */
  const hook = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await bodyOf(req, res, "Only a hook on this machine may post to Guslar.", MAX_HOOK_BODY)
    if (raw === undefined) return
    const request = parseHook(raw)
    if (!request) {
      sendJson(res, 400, { error: "The request cannot be read: expected { hunterId?, input }" })
      return
    }
    const asking = request.input.hook_event_name === "PermissionRequest" ? hunters.asked(request) : undefined
    if (!asking) {
      const reply: HookReply = { heard: await hunters.hooked(request, slots) }
      sendJson(res, 202, reply)
      return
    }
    res.once("close", () => {
      if (!res.writableFinished) asking.withdraw()
    })
    const decision = await asking.decision
    if (res.destroyed) return
    const reply: HookReply = decision ? { heard: true, decision } : { heard: true }
    sendJson(res, 200, reply)
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
    if (req.url === "/api/hooks") {
      if (req.method === "POST") {
        hook(req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }))
        return
      }
      res.writeHead(405, { allow: "POST" })
      res.end()
      return
    }
    const terminalOf = TERMINAL.exec(req.url ?? "")?.[1]
    if (terminalOf) {
      if (req.method === "POST") {
        openTerminal(terminalOf, req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }))
        return
      }
      res.writeHead(405, { allow: "POST" })
      res.end()
      return
    }
    const prompt = PROMPTS.exec(req.url ?? "")
    if (prompt?.[1] && prompt[2]) {
      if (req.method === "POST") {
        answer(prompt[1], prompt[2], req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }))
        return
      }
      res.writeHead(405, { allow: "POST" })
      res.end()
      return
    }
    const replyTo = REPLIES.exec(req.url ?? "")?.[1]
    if (replyTo) {
      if (req.method === "POST") {
        reply(replyTo, req, res).catch((error: unknown) => sendJson(res, 500, { error: String(error) }))
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

  const sockets = new WebSocketServer({ noServer: true })
  const terminalSockets = new WebSocketServer({ noServer: true })

  /** Refuses a WebSocket before it opens, with a plain HTTP answer. */
  const refuseUpgrade = (socket: Socket, status: number, reason: string) => {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`)
  }

  /**
   * `/ws` follows the world. A hunter's terminal socket runs keys in a program on this machine,
   * so only the map this server serves may open one, and only onto a terminal that is open.
   */
  http.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    if (req.url === "/ws") {
      sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws, req))
      return
    }
    const id = TERMINAL.exec(req.url ?? "")?.[1]
    if (!id) {
      refuseUpgrade(socket, 404, "Not Found")
      return
    }
    if (!fromOwnOrigin(req)) {
      refuseUpgrade(socket, 403, "Forbidden")
      return
    }
    hunters
      .terminalOf(id)
      .then((terminal) => {
        if (!terminal) {
          refuseUpgrade(socket, 404, "Not Found")
          return
        }
        terminalSockets.handleUpgrade(req, socket, head, (ws) => terminal.attach(ws))
      })
      .catch(() => refuseUpgrade(socket, 500, "Internal Server Error"))
  })

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
      for (const socket of [...sockets.clients, ...terminalSockets.clients]) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve) => terminalSockets.close(() => resolve()))
      await new Promise<void>((resolve, reject) => http.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
