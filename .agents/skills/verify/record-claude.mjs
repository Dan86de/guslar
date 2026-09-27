#!/usr/bin/env node
// Stands in for `claude` in a verify run: records how Guslar started it and every line it was
// sent, in the run's claude.log, and runs until its stdin ends, as a stream-json claude does.
// When the run has a claude-transcript.jsonl (`verify replay`), it answers its first message by
// replaying that stream-json on stdout, line by line. A line {"replay":"wait","for":"<name>"} is
// not sent: the replay waits there until the run has a file gates/<name>. A line
// {"replay":"next"} is not sent either: the replay waits there for the next line on its stdin.
// A line {"replay":"hook","event":…,"input":…} is not sent either: as Claude Code does, it runs
// every hook the repo's .claude/settings.local.json has for that event, the event on its stdin.
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { setTimeout as sleep } from "node:timers/promises"

const log = (line) => appendFileSync(process.env.VERIFY_CLAUDE_LOG, `[pid ${process.pid}] ${line}\n`)

let received = 0

function runHooks(event, input = {}) {
  const file = path.join(process.cwd(), ".claude", "settings.local.json")
  const groups = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).hooks?.[event] ?? []) : []
  const payload = JSON.stringify({ session_id: "replayed-session", cwd: process.cwd(), hook_event_name: event, ...input })
  let ran = 0
  for (const group of groups) {
    const matcher = group.matcher ?? ""
    if (input.tool_name && matcher !== "" && matcher !== "*" && !new RegExp(`^(?:${matcher})$`).test(input.tool_name)) continue
    for (const hook of group.hooks) {
      const result = spawnSync("sh", ["-c", hook.command], { input: payload, encoding: "utf8", timeout: (hook.timeout ?? 60) * 1000 })
      const said = `${result.stdout}${result.stderr}`.trim()
      log(`ran ${event} hook: ${hook.command}: exit ${result.status}${said ? `: ${said}` : ""}`)
      ran++
    }
  }
  if (ran === 0) log(`no ${event} hook to run`)
}

async function replay(lines, gates) {
  let answered = 1
  for (const line of lines) {
    const entry = JSON.parse(line)
    if (entry.replay === "wait") {
      const gate = path.join(gates, entry.for)
      log(`waiting at gates/${entry.for}`)
      while (!existsSync(gate)) await sleep(50)
      log(`passed gates/${entry.for}`)
      continue
    }
    if (entry.replay === "next") {
      log("waiting for the next message")
      while (received <= answered) await sleep(50)
      answered++
      log("replaying on")
      continue
    }
    if (entry.replay === "hook") {
      runHooks(entry.event, entry.input)
      continue
    }
    process.stdout.write(`${line}\n`)
    const tool = entry.type === "assistant" ? entry.message?.content?.find((b) => b.type === "tool_use")?.name : undefined
    const kind = entry.request?.subtype ?? entry.subtype
    log(`sent ${entry.type}${kind ? ` ${kind}` : ""}${tool ? ` ${tool}` : ""}`)
    await sleep(150)
  }
  log("replay done")
}

log(`started in ${process.cwd()}`)
log(`args: ${process.argv.slice(2).join(" ")}`)
log(`GUSLAR_HUNTER_ID=${process.env.GUSLAR_HUNTER_ID ?? "(not set)"}`)
log(`GUSLAR_URL=${process.env.GUSLAR_URL ?? "(not set)"}`)
const transcript = process.env.VERIFY_CLAUDE_TRANSCRIPT
let replaying
for await (const line of createInterface({ input: process.stdin })) {
  log(`stdin: ${line}`)
  received++
  if (!replaying && transcript && existsSync(transcript)) {
    const lines = readFileSync(transcript, "utf8").split("\n").filter(Boolean)
    log(`replaying ${path.basename(transcript)}: ${lines.length} lines`)
    replaying = replay(lines, process.env.VERIFY_CLAUDE_GATES)
  }
}
log("stdin ended, exiting")
process.exit(0)
