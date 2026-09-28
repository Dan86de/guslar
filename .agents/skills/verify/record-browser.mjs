#!/usr/bin/env node
// Guslar's BROWSER during a verify run: records the URL Guslar asked to open, and opens nothing.
import { appendFileSync } from "node:fs"

appendFileSync(process.env.VERIFY_BROWSER_LOG, `${new Date().toISOString()} ${process.argv.slice(2).join(" ")}\n`)
