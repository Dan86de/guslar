#!/usr/bin/env node
// Stands in for `claude`: records how it was started and every stdin line, as JSON lines,
// and runs until its stdin ends, as a stream-json claude does. With FAKE_CLAUDE_TRANSCRIPT,
// its first message is answered by replaying that stream-json transcript on stdout. A line
// {"replay":"wait","for":"<name>"} is not sent: the replay waits there until the file
// <name> exists in FAKE_CLAUDE_GATES, so a test can hold the hunter in a state. A line
// {"replay":"next"} is not sent either: the replay waits there for its next stdin message, as
// a session waits for your reply once its turn is over. A line {"replay":"hook","event":…,"input":…}
// is not sent either: as Claude Code does, it runs every hook the repo's
// .claude/settings.local.json has for that event, with the event on the hook's stdin.
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { setTimeout as sleep } from "node:timers/promises"

const record = (entry) => appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, ...entry })}\n`)

let received = 0

function runHooks(event, input = {}) {
  const file = path.join(process.cwd(), ".claude", "settings.local.json")
  const groups = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).hooks?.[event] ?? []) : []
  const payload = JSON.stringify({ session_id: "replayed-session", cwd: process.cwd(), hook_event_name: event, ...input })
  for (const group of groups) {
    const matcher = group.matcher ?? ""
    if (input.tool_name && matcher !== "" && matcher !== "*" && !new RegExp(`^(?:${matcher})$`).test(input.tool_name)) continue
    for (const hook of group.hooks) {
      const ran = spawnSync("sh", ["-c", hook.command], { input: payload, encoding: "utf8", timeout: (hook.timeout ?? 60) * 1000 })
      record({ hook: { event, command: hook.command, status: ran.status, stdout: ran.stdout } })
    }
  }
}

async function replay(transcript, gates) {
  let answered = 1
  for (const line of readFileSync(transcript, "utf8").split("\n").filter(Boolean)) {
    const entry = JSON.parse(line)
    if (entry.replay === "wait") {
      while (gates && !existsSync(path.join(gates, entry.for))) await sleep(20)
      continue
    }
    if (entry.replay === "next") {
      while (received <= answered) await sleep(20)
      answered++
      continue
    }
    if (entry.replay === "hook") {
      runHooks(entry.event, entry.input)
      continue
    }
    process.stdout.write(`${line}\n`)
    record({ sent: entry.type })
    await sleep(10)
  }
}

record({ started: { cwd: process.cwd(), args: process.argv.slice(2), hunterId: process.env.GUSLAR_HUNTER_ID, url: process.env.GUSLAR_URL } })
let replaying
for await (const line of createInterface({ input: process.stdin })) {
  record({ stdin: line })
  received++
  if (!replaying && process.env.FAKE_CLAUDE_TRANSCRIPT) {
    replaying = replay(process.env.FAKE_CLAUDE_TRANSCRIPT, process.env.FAKE_CLAUDE_GATES)
  }
}
record({ ended: true })
process.exit(0)
