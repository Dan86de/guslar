#!/usr/bin/env node
// Stands in for a browser: records the URL Guslar asked it to open.
import { appendFileSync } from "node:fs"

appendFileSync(process.env.FAKE_BROWSER_LOG, `${process.argv[2]}\n`)
