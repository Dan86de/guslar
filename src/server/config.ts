import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { DEFAULT_THEME, isTheme, THEMES } from "../shared/theme.js"
import { isRegionSlot, REGION_SLOTS, type World } from "../shared/world.js"

export class WorldConfigError extends Error {}

export function defaultWorldPath(): string {
  return path.join(homedir(), ".guslar", "world.json")
}

/**
 * Reads and validates world.json. A missing file is an empty world, all fog, and a world that names
 * no theme is drawn as Guslar.
 * Repo paths are made absolute: `~` is the home directory, relative paths start at world.json's folder.
 */
export async function loadWorld(file: string): Promise<World> {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { theme: DEFAULT_THEME, regions: [] }
    throw error
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new WorldConfigError(`${file} is not valid JSON: ${(error as Error).message}`)
  }
  return parseWorld(raw, path.dirname(file), file)
}

function parseWorld(raw: unknown, baseDir: string, file: string): World {
  const fail = (message: string): never => {
    throw new WorldConfigError(`${file}: ${message}`)
  }

  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { regions?: unknown }).regions)) {
    fail(`expected { "regions": [...] }`)
  }

  const { theme = DEFAULT_THEME } = raw as { theme?: unknown }
  if (!isTheme(theme)) return fail(`theme must be one of ${THEMES.join(", ")}`)

  const seen = new Set<string>()
  const regions = (raw as { regions: unknown[] }).regions.map((entry, index) => {
    const where = `regions[${index}]`
    if (typeof entry !== "object" || entry === null) return fail(`${where} must be an object`)
    const { slot, repo, name } = entry as Record<string, unknown>

    if (!isRegionSlot(slot)) return fail(`${where}.slot must be one of ${REGION_SLOTS.join(", ")}`)
    if (seen.has(slot)) return fail(`${where}.slot "${slot}" is already taken by another repo`)
    seen.add(slot)

    if (typeof repo !== "string" || repo.trim() === "") return fail(`${where}.repo must be a path`)
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return fail(`${where}.name must be a non-empty string when given`)
    }

    return { slot, repo: resolveRepo(repo, baseDir), ...(name === undefined ? {} : { name }) }
  })

  return { theme, regions }
}

function resolveRepo(repo: string, baseDir: string): string {
  if (repo === "~") return homedir()
  if (repo.startsWith("~/")) return path.join(homedir(), repo.slice(2))
  return path.resolve(baseDir, repo)
}
