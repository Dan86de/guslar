import { existsSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sirv from "sirv"
import { WebSocketServer, type WebSocket } from "ws"
import type { ServerMessage, WorldState } from "../shared/world.js"

export type GuslarServer = {
  url: string
  broadcast(world: WorldState): void
  close(): Promise<void>
}

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

export async function startServer(options: { world: WorldState; host: string; port: number }): Promise<GuslarServer> {
  let world = options.world
  const dir = clientDir()
  const serveClient = existsSync(dir) ? sirv(dir, { single: true, etag: true }) : undefined

  const http: Server = createServer((req, res) => {
    if (req.url === "/api/world") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
      res.end(JSON.stringify(world))
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
    const message: ServerMessage = { type: "world", world }
    socket.send(JSON.stringify(message))
  }
  sockets.on("connection", send)

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject)
    http.listen(options.port, options.host, () => {
      http.off("error", reject)
      resolve()
    })
  })

  const { port } = http.address() as AddressInfo
  const host = options.host.includes(":") ? `[${options.host}]` : options.host

  return {
    url: `http://${host}:${port}/`,
    broadcast(next) {
      world = next
      for (const socket of sockets.clients) send(socket)
    },
    async close() {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve, reject) => http.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
