#!/usr/bin/env node
// Stands in for `claude` in a verify run: records how Guslar started it and every line it was
// sent, in the run's claude.log, and runs until its stdin ends, as a stream-json claude does.
// When the run has a claude-transcript.jsonl (`verify replay`), it answers its first message by
// replaying that stream-json on stdout, line by line. A line {"replay":"wait","for":"<name>"} is
// not sent: the replay waits there until the run has a file gates/<name>.
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { setTimeout as sleep } from "node:timers/promises"

const log = (line) => appendFileSync(process.env.VERIFY_CLAUDE_LOG, `[pid ${process.pid}] ${line}\n`)

async function replay(lines, gates) {
  for (const line of lines) {
    const entry = JSON.parse(line)
    if (entry.replay === "wait") {
      const gate = path.join(gates, entry.for)
      log(`waiting at gates/${entry.for}`)
      while (!existsSync(gate)) await sleep(50)
      log(`passed gates/${entry.for}`)
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
const transcript = process.env.VERIFY_CLAUDE_TRANSCRIPT
let replaying
for await (const line of createInterface({ input: process.stdin })) {
  log(`stdin: ${line}`)
  if (!replaying && transcript && existsSync(transcript)) {
    const lines = readFileSync(transcript, "utf8").split("\n").filter(Boolean)
    log(`replaying ${path.basename(transcript)}: ${lines.length} lines`)
    replaying = replay(lines, process.env.VERIFY_CLAUDE_GATES)
  }
}
log("stdin ended, exiting")
process.exit(0)
