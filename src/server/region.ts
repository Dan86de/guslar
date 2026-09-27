import { execFile } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { Autonomy, Contract, Village } from "../shared/world.js"

const run = promisify(execFile)

const SPECS = path.join(".scratch", "specs")
const SLICES = path.join(".scratch", "slices")

/** Which contracts the commits on a `slices/<slug>` branch mark done, and which pending. */
type Trailers = { done: Set<string>; pending: Set<string> }

const NO_TRAILERS: Trailers = { done: new Set(), pending: new Set() }

/**
 * Reads one region's villages from what the skills write in its repo: a village per spec
 * in `.scratch/specs/`, its contracts from `.scratch/slices/<slug>.json`, and their states
 * from the trailers on `slices/<slug>`. It only reads: nothing in the repo is written.
 */
export class RegionReader {
  /** Trailers per branch, kept until the branch moves, so an idle repo costs one git call a read. */
  private readonly trailers = new Map<string, { key: string; trailers: Trailers }>()

  constructor(readonly repo: string) {}

  async villages(): Promise<Village[]> {
    const specs = await specFiles(this.repo)
    const branches = await this.slicesBranches()
    return Promise.all(specs.map((file) => this.village(file, branches)))
  }

  private async village(file: string, branches: Map<string, string>): Promise<Village> {
    const slug = file.slice(0, -".md".length)
    const spec = path.join(SPECS, file)
    const title = headingOf(await readFile(path.join(this.repo, spec), "utf8")) ?? slug
    const village: Village = { slug, title, spec, contracts: [] }

    const slices = path.join(SLICES, `${slug}.json`)
    const text = await readOptional(path.join(this.repo, slices))
    if (text === undefined) return village
    village.slices = slices

    let plan: SlicesFile
    try {
      plan = parseSlices(JSON.parse(text))
    } catch (error) {
      village.problem = `${slices}: ${(error as Error).message}`
      return village
    }

    const tip = branches.get(slug)
    const trailers = tip ? await this.trailersOf(slug, tip, plan.commit) : NO_TRAILERS
    village.contracts = plan.slices.map((slice) => contractOf(slice, trailers))
    return village
  }

  /** Every `slices/<slug>` branch in the repo, by slug, with the commit it points at. */
  private async slicesBranches(): Promise<Map<string, string>> {
    const branches = new Map<string, string>()
    let output: string
    try {
      output = await git(this.repo, "for-each-ref", "--format=%(objectname) %(refname)", "refs/heads/slices/")
    } catch {
      return branches // not a git repo, or no commits yet
    }
    for (const line of output.split("\n")) {
      const match = /^(\S+) refs\/heads\/slices\/(.+)$/.exec(line)
      if (match?.[1] && match[2]) branches.set(match[2], match[1])
    }
    return branches
  }

  private async trailersOf(slug: string, tip: string, base: string | undefined): Promise<Trailers> {
    const key = `${tip} ${base ?? ""}`
    const cached = this.trailers.get(slug)
    if (cached?.key === key) return cached.trailers

    // Only the branch's own commits, from the commit the slices were cut against. A base
    // this repo does not know means reading the whole branch.
    const known =
      base !== undefined &&
      (await git(this.repo, "cat-file", "-e", `${base}^{commit}`).then(
        () => true,
        () => false,
      ))
    const range = known ? `${base}..${tip}` : tip
    const output = await git(
      this.repo,
      "log",
      "--format=%(trailers:key=Slice,valueonly,separator=%x2C)%x1d%(trailers:key=Slice-Pending,valueonly,separator=%x2C)%x1e",
      range,
      "--",
    )

    const trailers: Trailers = { done: new Set(), pending: new Set() }
    for (const commit of output.split("\x1e")) {
      const [done = "", pending = ""] = commit.split("\x1d")
      for (const id of ids(done)) trailers.done.add(id)
      for (const id of ids(pending)) trailers.pending.add(id)
    }
    this.trailers.set(slug, { key, trailers })
    return trailers
  }
}

function contractOf(slice: SliceEntry, trailers: Trailers): Contract {
  const contract = { id: slice.id, title: slice.title, autonomy: slice.autonomy }
  if (trailers.done.has(slice.id)) return { ...contract, state: "done" }
  if (trailers.pending.has(slice.id)) return { ...contract, state: "pending" }
  // A pending blocker does not unblock anything: only done ones do.
  const sealedBy = slice.blocked_by.filter((id) => !trailers.done.has(id))
  return sealedBy.length === 0 ? { ...contract, state: "ready" } : { ...contract, state: "sealed", sealedBy }
}

type SliceEntry = { id: string; title: string; autonomy: Autonomy; blocked_by: string[] }
type SlicesFile = { commit?: string; slices: SliceEntry[] }

/** Checks the parts of a slices file the notice board needs, and says which one is wrong. */
function parseSlices(raw: unknown): SlicesFile {
  if (typeof raw !== "object" || raw === null) throw new Error(`expected { "slices": [...] }`)
  const { commit, slices } = raw as Record<string, unknown>
  if (!Array.isArray(slices)) throw new Error(`expected { "slices": [...] }`)
  return {
    ...(typeof commit === "string" && /^[0-9a-f]{4,64}$/i.test(commit) ? { commit } : {}),
    slices: slices.map((entry, index): SliceEntry => {
      const where = `slices[${index}]`
      if (typeof entry !== "object" || entry === null) throw new Error(`${where} must be an object`)
      const { id, title, autonomy, blocked_by } = entry as Record<string, unknown>
      if (typeof id !== "string" || id.trim() === "") throw new Error(`${where}.id must be a string`)
      if (typeof title !== "string") throw new Error(`${where}.title must be a string`)
      if (autonomy !== "afk" && autonomy !== "hitl") throw new Error(`${where}.autonomy must be afk or hitl`)
      const blockers = blocked_by ?? []
      if (!Array.isArray(blockers) || !blockers.every((b) => typeof b === "string")) {
        throw new Error(`${where}.blocked_by must be a list of ids`)
      }
      return { id, title, autonomy, blocked_by: blockers }
    }),
  }
}

/** The spec files of a repo, sorted, or none when it has no `.scratch/specs/`. */
async function specFiles(repo: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(repo, SPECS), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== ".md")
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8")
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}

function headingOf(markdown: string): string | undefined {
  return /^# +(.+?)\s*$/m.exec(markdown)?.[1]
}

function ids(values: string): string[] {
  return values
    .split(/[,\n]/)
    .map((id) => id.trim())
    .filter(Boolean)
}

async function git(repo: string, ...args: string[]): Promise<string> {
  // No optional locks: reading a repo must never write to it, not even its index.
  const { stdout } = await run("git", ["-C", repo, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout
}
