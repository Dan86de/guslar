#!/usr/bin/env node
// Stands in for `claude`: records how it was started and every stdin line, as JSON lines,
// and runs until its stdin ends, as a stream-json claude does.
import { appendFileSync } from "node:fs"
import { createInterface } from "node:readline"

const record = (entry) => appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ pid: process.pid, ...entry })}\n`)

record({ started: { cwd: process.cwd(), args: process.argv.slice(2), hunterId: process.env.GUSLAR_HUNTER_ID } })
for await (const line of createInterface({ input: process.stdin })) record({ stdin: line })
record({ ended: true })
