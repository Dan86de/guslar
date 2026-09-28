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
// Every line it replays is also written to its session's transcript, a file next to its log,
// whose path each hook is given as `transcript_path`, as Claude Code does.
// Started in a terminal, as "open in terminal" resumes a session, it replays nothing: it says
// which session it resumed, records each line typed to it and answers it, and exits when the
// terminal hangs up. With FAKE_CLAUDE_PROMPT, it is a session a user started outside Guslar: it
// takes that prompt as its first message, replays with nothing on stdout, and exits once done.
import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { setTimeout as sleep } from "node:timers/promises"

const sessionFile = path.join(path.dirname(process.env.FAKE_CLAUDE_LOG), `session-${process.pid}.jsonl`)
const outside = process.env.FAKE_CLAUDE_PROMPT !== undefined
const record = (entry) => appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, ...entry })}\n`)

let received = 0

function runHooks(event, input = {}) {
  const file = path.join(process.cwd(), ".claude", "settings.local.json")
  const groups = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).hooks?.[event] ?? []) : []
  const payload = JSON.stringify({
    session_id: "replayed-session",
    transcript_path: sessionFile,
    cwd: process.cwd(),
    hook_event_name: event,
    ...input,
  })
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
    if (!outside) process.stdout.write(`${line}\n`)
    appendFileSync(sessionFile, `${line}\n`)
    record({ sent: entry.type })
    await sleep(10)
  }
}

record({ started: { cwd: process.cwd(), args: process.argv.slice(2), hunterId: process.env.GUSLAR_HUNTER_ID, url: process.env.GUSLAR_URL } })

// In a terminal, it is a session resumed there: it says which, and answers each line typed to it.
if (process.stdin.isTTY) {
  record({ tty: { term: process.env.TERM } })
  process.on("SIGHUP", () => {
    record({ hungUp: true })
    process.exit(0)
  })
  const resumed = process.argv[process.argv.indexOf("--resume") + 1]
  process.stdout.write(`fake claude resumed ${resumed}\r\n`)
  for await (const line of createInterface({ input: process.stdin })) {
    record({ typed: line })
    process.stdout.write(`heard: ${line}\r\n`)
  }
  record({ ended: true })
  process.exit(0)
}
if (outside) {
  record({ prompt: process.env.FAKE_CLAUDE_PROMPT })
  if (process.env.FAKE_CLAUDE_TRANSCRIPT) await replay(process.env.FAKE_CLAUDE_TRANSCRIPT, process.env.FAKE_CLAUDE_GATES)
  record({ ended: true })
  process.exit(0)
}
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
