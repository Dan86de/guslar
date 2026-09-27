#!/usr/bin/env node
import { parseArgs } from "node:util"
import { openBrowser } from "./browser.js"
import { defaultWorldPath, loadWorld, WorldConfigError } from "./config.js"
import { installHooks, removeHooks, type HookChange } from "./hooks.js"
import { Hunters } from "./hunters.js"
import { startServer } from "./server.js"
import { WorldReader } from "./world.js"

const DEFAULT_PORT = 4747

const USAGE = `Usage: guslar [options]
       guslar hooks install|remove [--world <file>]

  --world <file>   world.json to read (default: $GUSLAR_WORLD or ~/.guslar/world.json)
  --port <n>       port to listen on (default: ${DEFAULT_PORT}, 0 picks a free one)
  --host <addr>    address to listen on (default: 127.0.0.1)
  --no-open        do not open the browser
  -h, --help       show this help

Commands:
  hooks install    put Guslar's hooks into each region's .claude/settings.local.json
  hooks remove     take them out again, leaving every other hook as it was

Environment:
  GUSLAR_WORLD     world.json to read when --world is not given
  GUSLAR_CLAUDE    the claude program hunters run (default: claude on the PATH)
  BROWSER          the program to open the map with, or none
`

function describe(change: HookChange): string {
  switch (change.outcome) {
    case "installed":
      return `Guslar's hooks installed in ${change.file}`
    case "updated":
      return `Guslar's hooks updated in ${change.file}`
    case "unchanged":
      return `Guslar's hooks are already in ${change.file}`
    case "removed":
      return `Guslar's hooks removed from ${change.file}`
    case "removed-file":
      return `Guslar's hooks removed from ${change.file}, which held nothing else and is gone`
    case "absent":
      return `No Guslar hooks in ${change.file}`
  }
}

/** `guslar hooks install|remove`: Guslar's hooks in every repo of the world. */
async function hooks(action: string | undefined, worldFile: string): Promise<void> {
  if (action !== "install" && action !== "remove") {
    throw new WorldConfigError(`hooks takes install or remove, got ${action === undefined ? "nothing" : `"${action}"`}`)
  }
  const world = await loadWorld(worldFile)
  const regions = world.regions.length
  console.log(`Guslar reads ${worldFile} (${regions} ${regions === 1 ? "region" : "regions"})`)
  const repos = world.regions.map((region) => region.repo)
  const changes = action === "install" ? await installHooks(repos) : await removeHooks(repos)
  for (const change of changes) {
    console.log(describe(change))
    if (change.tracked && action === "install") {
      console.log(`  git tracks it, so a hunter's implement-slice will find ${change.repo} dirty`)
    }
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      world: { type: "string" },
      port: { type: "string" },
      host: { type: "string", default: "127.0.0.1" },
      open: { type: "boolean", default: true },
      help: { type: "boolean", short: "h" },
    },
    allowNegative: true,
    allowPositionals: true,
  })

  if (values.help) {
    process.stdout.write(USAGE)
    return
  }

  const worldFile = values.world ?? process.env.GUSLAR_WORLD ?? defaultWorldPath()
  const [command, ...rest] = positionals
  if (command === "hooks") {
    if (rest.length > 1) throw new WorldConfigError(`hooks ${rest[0]} takes no more arguments, got "${rest[1]}"`)
    await hooks(rest[0], worldFile)
    return
  }
  if (command !== undefined) throw new WorldConfigError(`there is no command "${command}". See guslar --help.`)

  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new WorldConfigError(`--port must be a whole number from 0 to 65535, got "${values.port}"`)
  }

  const world = await loadWorld(worldFile)

  const reader = new WorldReader(world)
  const initial = await reader.read()

  const hunters = new Hunters(process.env.GUSLAR_CLAUDE?.trim() || "claude", (hunter) =>
    reader.contract(hunter.slot, hunter.village, hunter.contract),
  )

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
  hunters.listenAt(server.url)

  const running = server
  const unfollow = reader.follow(initial, (next) => {
    hunters.see(next)
    running.update(next)
  })

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
