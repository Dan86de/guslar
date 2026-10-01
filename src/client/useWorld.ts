import { useEffect, useState } from "react"
import { heardFrom, type Heard } from "./heard.js"
import type { ServerMessage, WorldState } from "../shared/world.js"

export type Connection = {
  world: WorldState | undefined
  connected: boolean
  /** When each hunter of that world was last heard, stamped as its words arrived here. */
  heard: Map<string, Heard>
}

/** Follows the server's broadcast world, reconnecting with backoff when the server goes away. */
export function useWorld(): Connection {
  const [connection, setConnection] = useState<Connection>({ world: undefined, connected: false, heard: new Map() })

  useEffect(() => {
    let socket: WebSocket | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    let delay = 250
    let stopped = false

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:"
      socket = new WebSocket(`${protocol}//${location.host}/ws`)
      socket.onopen = () => {
        delay = 250
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as ServerMessage
        // Stamped here, where the world arrives: this is the moment the map heard what it carries.
        setConnection((previous) => ({
          world: message.world,
          connected: true,
          heard: heardFrom(previous.heard, message.world.hunters, Date.now()),
        }))
      }
      socket.onclose = () => {
        if (stopped) return
        setConnection((previous) => ({ ...previous, connected: false }))
        retry = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 5000)
      }
    }
    connect()

    return () => {
      stopped = true
      clearTimeout(retry)
      socket?.close()
    }
  }, [])

  return connection
}
