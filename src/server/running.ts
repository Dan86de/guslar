// Where each running Guslar says it listens: one file per process, ~/.guslar/running/<pid>.json,
// so a hook in a session Guslar did not start can still find it. A file whose process has gone
// is stale, and is skipped by readers and cleared by the next Guslar to start. A Guslar that stops
// takes its file away, and the folders too once nothing else is in them.
import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

export type RunningGuslar = { pid: number; url: string }

function dirOf(home: string): string {
  return path.join(home, ".guslar", "running")
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function parse(name: string, text: string): RunningGuslar | undefined {
  const pid = Number(/^(\d+)\.json$/.exec(name)?.[1])
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  try {
    const { url } = JSON.parse(text) as { url?: unknown }
    return typeof url === "string" && URL.canParse(url) ? { pid, url } : undefined
  } catch {
    return undefined
  }
}

/** Every Guslar running for the user whose HOME this is, by its own file. */
export async function runningGuslars(home: string): Promise<RunningGuslar[]> {
  const dir = dirOf(home)
  const names = await readdir(dir).catch(() => [])
  const found = await Promise.all(
    names.map(async (name) => parse(name, await readFile(path.join(dir, name), "utf8").catch(() => ""))),
  )
  return found.filter((running): running is RunningGuslar => running !== undefined && alive(running.pid))
}

/**
 * Says where this Guslar listens, clearing the files of Guslars that have gone, and returns what
 * takes its own file away again.
 */
export function announce(home: string, url: string): () => void {
  const dir = dirOf(home)
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) {
    const pid = Number(/^(\d+)\.json$/.exec(name)?.[1])
    if (Number.isInteger(pid) && pid > 0 && !alive(pid)) rmSync(path.join(dir, name), { force: true })
  }
  const file = path.join(dir, `${process.pid}.json`)
  const text = `${JSON.stringify({ url })}\n`
  try {
    writeFileSync(file, text)
  } catch {
    // Another Guslar, stopping, took the empty folder away between the two.
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, text)
  }
  return () => {
    try {
      if (parse(path.basename(file), readFileSync(file, "utf8"))?.url === url) rmSync(file, { force: true })
    } catch {
      // Already gone.
    }
    for (const folder of [dir, path.dirname(dir)]) {
      try {
        rmdirSync(folder)
      } catch {
        return // not empty: another Guslar's file, or the user's world.json
      }
    }
  }
}
