#!/usr/bin/env node
// Stands in for `claude` in a verify run: records how Guslar started it and every line it was
// sent, in the run's claude.log, and runs until its stdin ends, as a stream-json claude does.
import { appendFileSync } from "node:fs"
import { createInterface } from "node:readline"

const log = (line) => appendFileSync(process.env.VERIFY_CLAUDE_LOG, `[pid ${process.pid}] ${line}\n`)

log(`started in ${process.cwd()}`)
log(`args: ${process.argv.slice(2).join(" ")}`)
log(`GUSLAR_HUNTER_ID=${process.env.GUSLAR_HUNTER_ID ?? "(not set)"}`)
for await (const line of createInterface({ input: process.stdin })) log(`stdin: ${line}`)
log("stdin ended, exiting")
