#!/usr/bin/env node
// Stands in for `claude`: records how it was started and every stdin line, as JSON lines,
// and runs until its stdin ends, as a stream-json claude does. With FAKE_CLAUDE_TRANSCRIPT,
// its first message is answered by replaying that stream-json transcript on stdout. A line
// {"replay":"wait","for":"<name>"} is not sent: the replay waits there until the file
// <name> exists in FAKE_CLAUDE_GATES, so a test can hold the hunter in a state.
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { setTimeout as sleep } from "node:timers/promises"

const record = (entry) => appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, ...entry })}\n`)

async function replay(transcript, gates) {
  for (const line of readFileSync(transcript, "utf8").split("\n").filter(Boolean)) {
    const entry = JSON.parse(line)
    if (entry.replay === "wait") {
      while (gates && !existsSync(path.join(gates, entry.for))) await sleep(20)
      continue
    }
    process.stdout.write(`${line}\n`)
    record({ sent: entry.type })
    await sleep(10)
  }
}

record({ started: { cwd: process.cwd(), args: process.argv.slice(2), hunterId: process.env.GUSLAR_HUNTER_ID } })
let replaying
for await (const line of createInterface({ input: process.stdin })) {
  record({ stdin: line })
  if (!replaying && process.env.FAKE_CLAUDE_TRANSCRIPT) {
    replaying = replay(process.env.FAKE_CLAUDE_TRANSCRIPT, process.env.FAKE_CLAUDE_GATES)
  }
}
record({ ended: true })
process.exit(0)
