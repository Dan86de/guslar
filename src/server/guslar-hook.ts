// The command Claude Code runs for each event Guslar listens to, from a repo's
// .claude/settings.local.json. It reads the event from stdin and posts it to the Guslar that
// started this session (GUSLAR_URL), tagged with the hunter's id (GUSLAR_HUNTER_ID). It prints
// nothing and always exits 0, so a session outside Guslar, or one whose Guslar is gone, goes on
// as if no hook were there.
import type { HookRequest } from "../shared/world.js"

/** How long the hook waits for Guslar before it lets the session go on. */
const POST_TIMEOUT_MS = 3000

async function readStdin(): Promise<string> {
  let text = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) text += chunk as string
  return text
}

async function main(): Promise<void> {
  const text = await readStdin()
  const url = process.env.GUSLAR_URL
  if (!url) return
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return
  }
  if (typeof input !== "object" || input === null) return
  const body: HookRequest = { hunterId: process.env.GUSLAR_HUNTER_ID || undefined, input: input as HookRequest["input"] }
  await fetch(new URL("/api/hooks", url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  })
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))
