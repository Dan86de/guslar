import { execFile } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { WorldConfigError } from "./config.js"

const run = promisify(execFile)

/** The Claude Code events Guslar listens to: a session's start and end, each prompt, tool call, permission and stop. */
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Notification",
  "Stop",
  "SessionEnd",
] as const

/** How long Claude Code lets Guslar's hook run, in seconds; it posts one event and is done. */
const HOOK_TIMEOUT = 10

/**
 * How long a permission request waits for your answer on the map, in seconds. Past it, Claude
 * Code gives up on the hook and the hunter has to ask again.
 */
const PERMISSION_TIMEOUT = 300

/** The file the hook runs, and how Guslar tells its own hooks from everyone else's. */
const HOOK_SCRIPT = "guslar-hook.js"

/** Where Guslar's hooks live in a repo: Claude Code's settings for this machine only. */
export const SETTINGS = path.join(".claude", "settings.local.json")

/** The line that keeps a settings file Guslar made out of git, with the comment that marks it as Guslar's. */
const EXCLUDE_MARK = "# Guslar's hooks: `guslar hooks remove` takes these two lines out"
const EXCLUDE_LINE = "/.claude/settings.local.json"

type HookCommand = { type: "command"; command: string; timeout?: number }
/** A settings file as read: hooks are checked to be lists by event, and each group is left as the user wrote it. */
type Settings = Record<string, unknown> & { hooks?: Record<string, unknown[]> }

/** Quotes a path for the shell Claude Code runs a hook command in. */
function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`
}

/** The command Claude Code runs for each event: node on this package's own hook script. */
export function hookCommand(): string {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), HOOK_SCRIPT)
  return `node ${shellQuote(script)}`
}

function isGuslars(hook: unknown): boolean {
  const command = (hook as { command?: unknown } | null)?.command
  return typeof command === "string" && command.includes(HOOK_SCRIPT)
}

/** A group's hooks, when it is a group of hooks at all. */
function hooksOf(group: unknown): unknown[] | undefined {
  const hooks = (group as { hooks?: unknown } | null)?.hooks
  return Array.isArray(hooks) ? hooks : undefined
}

/** How a settings file was laid out, so it is written back the same way. */
type Layout = { indent: string | number; newline: boolean }

function layoutOf(text: string): Layout {
  const body = text.trimEnd()
  const indent = /\n([ \t]+)\S/.exec(body)?.[1] ?? (body.includes("\n") ? 2 : 0)
  return { indent, newline: text.endsWith("\n") }
}

function serialize(settings: Settings, layout: Layout): string {
  return `${JSON.stringify(settings, null, layout.indent)}${layout.newline ? "\n" : ""}`
}

/** A repo's settings file as it stands, or none; refuses one that is not a settings object. */
async function readSettings(file: string): Promise<{ settings: Settings; text: string } | undefined> {
  let text: string
  try {
    text = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
  let settings: unknown
  try {
    settings = JSON.parse(text)
  } catch (error) {
    throw new WorldConfigError(`${file} is not valid JSON: ${(error as Error).message}`)
  }
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new WorldConfigError(`${file} is not a settings object`)
  }
  const { hooks } = settings as Record<string, unknown>
  if (hooks !== undefined) {
    if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
      throw new WorldConfigError(`${file}: hooks is not an object`)
    }
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) throw new WorldConfigError(`${file}: hooks.${event} is not a list`)
    }
  }
  return { settings: settings as Settings, text }
}

/**
 * Takes every Guslar hook out of `settings`, in place: from each group, then each group left
 * empty, each event left with no group, and `hooks` when no event is left. Other hooks keep
 * their place and their bytes.
 */
function withoutGuslar(settings: Settings): void {
  if (!settings.hooks) return
  const kept: Record<string, unknown[]> = {}
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const rest = groups.flatMap((group): unknown[] => {
      const hooks = hooksOf(group)
      if (!hooks?.some(isGuslars)) return [group]
      const others = hooks.filter((hook) => !isGuslars(hook))
      return others.length > 0 ? [{ ...(group as object), hooks: others }] : []
    })
    if (rest.length > 0 || groups.length === 0) kept[event] = rest
  }
  if (Object.keys(kept).length > 0) settings.hooks = kept
  else delete settings.hooks
}

function holdsGuslar(settings: Settings): boolean {
  return Object.values(settings.hooks ?? {}).some((groups) => groups.some((group) => hooksOf(group)?.some(isGuslars)))
}

function withGuslar(settings: Settings, command: string): void {
  withoutGuslar(settings)
  const hooks = (settings.hooks ??= {})
  for (const event of HOOK_EVENTS) {
    const timeout = event === "PermissionRequest" ? PERMISSION_TIMEOUT : HOOK_TIMEOUT
    const hook: HookCommand = { type: "command", command, timeout }
    ;(hooks[event] ??= []).push({ hooks: [hook] })
  }
}

async function git(repo: string, ...args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout } = await run("git", ["-C", repo, ...args], { encoding: "utf8" })
    return { ok: true, out: stdout.trim() }
  } catch {
    return { ok: false, out: "" }
  }
}

/** The repo's `info/exclude`, when the repo is a git work tree. */
async function excludeFile(repo: string): Promise<string | undefined> {
  const inside = await git(repo, "rev-parse", "--is-inside-work-tree")
  if (!inside.ok || inside.out !== "true") return undefined
  const found = await git(repo, "rev-parse", "--git-path", "info/exclude")
  return found.ok ? path.resolve(repo, found.out) : undefined
}

/**
 * Keeps the settings file out of `git status`, so a hunter's `implement-slice` still finds a
 * clean tree: when git would show it, one marked line in the repo's own `info/exclude` hides it.
 * Says whether git tracks it, which no exclude can hide.
 */
async function keepOutOfGit(repo: string): Promise<{ tracked: boolean }> {
  const exclude = await excludeFile(repo)
  if (!exclude) return { tracked: false }
  if ((await git(repo, "ls-files", "--", SETTINGS)).out !== "") return { tracked: true }
  if ((await git(repo, "check-ignore", "-q", "--", SETTINGS)).ok) return { tracked: false }
  let text = ""
  try {
    text = await readFile(exclude, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const lead = text === "" || text.endsWith("\n") ? "" : "\n"
  await mkdir(path.dirname(exclude), { recursive: true })
  await writeFile(exclude, `${text}${lead}${EXCLUDE_MARK}\n${EXCLUDE_LINE}\n`)
  return { tracked: false }
}

/** Takes Guslar's marked lines back out of the repo's `info/exclude`, leaving every other line. */
async function releaseFromGit(repo: string): Promise<void> {
  const exclude = await excludeFile(repo)
  if (!exclude || !existsSync(exclude)) return
  const text = await readFile(exclude, "utf8")
  const block = `${EXCLUDE_MARK}\n${EXCLUDE_LINE}\n`
  if (text.includes(block)) await writeFile(exclude, text.replace(block, ""))
}

/** What installing or removing did to one repo. */
export type HookChange = {
  repo: string
  file: string
  outcome: "installed" | "updated" | "unchanged" | "removed" | "removed-file" | "absent"
  /** Git tracks the settings file, so changing it leaves the tree dirty for a hunter. */
  tracked?: boolean
}

function checkRepos(repos: string[]): void {
  for (const repo of repos) {
    if (!existsSync(repo) || !statSync(repo).isDirectory()) throw new WorldConfigError(`${repo} is not a folder`)
  }
}

/**
 * Puts Guslar's hooks into each repo's `.claude/settings.local.json`, making the file when there
 * is none, and replacing Guslar's own hooks when they run another copy of Guslar. Every other
 * setting and hook stays as it was. Every file is read and checked before any is written.
 */
export async function installHooks(repos: string[]): Promise<HookChange[]> {
  checkRepos(repos)
  const command = hookCommand()
  const files = repos.map((repo) => ({ repo, file: path.join(repo, SETTINGS) }))
  const current = await Promise.all(files.map(({ file }) => readSettings(file)))

  const changes: HookChange[] = []
  for (const [index, { repo, file }] of files.entries()) {
    const existing = current[index]
    const layout = existing ? layoutOf(existing.text) : { indent: 2, newline: true }
    const settings: Settings = existing ? existing.settings : {}
    const hadGuslar = holdsGuslar(settings)
    withGuslar(settings, command)
    const text = serialize(settings, layout)
    const { tracked } = await keepOutOfGit(repo)
    if (existing?.text === text) {
      changes.push({ repo, file, outcome: "unchanged", tracked })
      continue
    }
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
    changes.push({ repo, file, outcome: hadGuslar ? "updated" : "installed", tracked })
  }
  return changes
}

/**
 * Takes Guslar's hooks out of each repo's `.claude/settings.local.json`, and nothing else. A file
 * left holding nothing is deleted, with its `.claude` folder when that is empty too.
 */
export async function removeHooks(repos: string[]): Promise<HookChange[]> {
  checkRepos(repos)
  const files = repos.map((repo) => ({ repo, file: path.join(repo, SETTINGS) }))
  const current = await Promise.all(files.map(({ file }) => readSettings(file)))

  const changes: HookChange[] = []
  for (const [index, { repo, file }] of files.entries()) {
    const existing = current[index]
    if (!existing) {
      await releaseFromGit(repo)
      changes.push({ repo, file, outcome: "absent" })
      continue
    }
    const settings = existing.settings
    withoutGuslar(settings)
    const text = serialize(settings, layoutOf(existing.text))
    if (text === existing.text) {
      await releaseFromGit(repo)
      changes.push({ repo, file, outcome: "absent" })
      continue
    }
    if (Object.keys(settings).length === 0) {
      await rm(file)
      const dir = path.dirname(file)
      if ((await readdir(dir)).length === 0) await rmdir(dir)
      await releaseFromGit(repo)
      changes.push({ repo, file, outcome: "removed-file" })
      continue
    }
    await writeFile(file, text)
    await releaseFromGit(repo)
    changes.push({ repo, file, outcome: "removed" })
  }
  return changes
}
