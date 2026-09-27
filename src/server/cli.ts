#!/usr/bin/env node
import { parseArgs } from "node:util"
import { openBrowser } from "./browser.js"
import { defaultWorldPath, loadWorld, WorldConfigError } from "./config.js"
import { Hunters } from "./hunters.js"
import { startServer } from "./server.js"
import { WorldReader } from "./world.js"

const DEFAULT_PORT = 4747

const USAGE = `Usage: guslar [options]

  --world <file>   world.json to read (default: $GUSLAR_WORLD or ~/.guslar/world.json)
  --port <n>       port to listen on (default: ${DEFAULT_PORT}, 0 picks a free one)
  --host <addr>    address to listen on (default: 127.0.0.1)
  --no-open        do not open the browser
  -h, --help       show this help

Environment:
  GUSLAR_WORLD     world.json to read when --world is not given
  GUSLAR_CLAUDE    the claude program hunters run (default: claude on the PATH)
  BROWSER          the program to open the map with, or none
`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: "string" },
      port: { type: "string" },
      host: { type: "string", default: "127.0.0.1" },
      open: { type: "boolean", default: true },
      help: { type: "boolean", short: "h" },
    },
    allowNegative: true,
  })

  if (values.help) {
    process.stdout.write(USAGE)
    return
  }

  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new WorldConfigError(`--port must be a whole number from 0 to 65535, got "${values.port}"`)
  }

  const worldFile = values.world ?? process.env.GUSLAR_WORLD ?? defaultWorldPath()
  const world = await loadWorld(worldFile)

  const reader = new WorldReader(world)
  const initial = await reader.read()

  const hunters = new Hunters(process.env.GUSLAR_CLAUDE?.trim() || "claude")

  let server
  try {
    server = await startServer({ slots: initial, hunters, host: values.host, port })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new WorldConfigError(`port ${port} is taken. Is Guslar already running? Pick another with --port.`)
    }
    throw error
  }

  const regions = world.regions.length
  console.log(`Guslar reads ${worldFile} (${regions} ${regions === 1 ? "region" : "regions"})`)
  console.log(`Guslar is listening on ${server.url}`)

  const running = server
  const unfollow = reader.follow(initial, (next) => running.update(next))

  if (values.open) openBrowser(server.url)

  const stop = () => {
    unfollow()
    hunters.close()
    void server.close().then(() => process.exit(0))
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
}

main().catch((error: unknown) => {
  console.error(`guslar: ${error instanceof WorldConfigError ? error.message : String(error)}`)
  process.exit(1)
})
