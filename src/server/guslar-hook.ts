// The command Claude Code runs for each event Guslar listens to, from a repo's
// .claude/settings.local.json. It reads the event from stdin and posts it to the Guslar that
// started this session (GUSLAR_URL), tagged with the hunter's id (GUSLAR_HUNTER_ID). It always
// exits 0, and prints nothing but a permission decision, so a session outside Guslar goes on as
// if no hook were there.
//
// A PermissionRequest from a hunter waits for your answer on the map and prints it as the hook's
// decision. When that hunter's Guslar cannot be reached, it allows the request, so a hunter is
// never stranded by a Guslar that is gone; any other session gets no decision from Guslar.
import { request } from "node:http"
import type { HookReply, HookRequest, PermissionAnswer } from "../shared/world.js"

/** How long an ordinary event waits for Guslar before the hook lets the session go on. */
const POST_TIMEOUT_MS = 3000

async function readStdin(): Promise<string> {
  let text = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) text += chunk as string
  return text
}

/** Why a post came to nothing: Guslar was not there, or it answered with no decision. */
class Unreachable extends Error {}

/**
 * Posts the event to Guslar and reads its reply. With no timeout, it waits as long as Guslar
 * holds the reply, which for a permission is until you answer; Claude Code's own hook timeout
 * ends the wait. Throws Unreachable when no answer came back from Guslar at all.
 */
function post(url: URL, body: HookRequest, timeoutMs?: number): Promise<HookReply | undefined> {
  return new Promise((resolve, reject) => {
    const text = JSON.stringify(body)
    // No agent: the default one times its sockets out after 5 s, which would end a wait on you.
    const req = request(url, {
      method: "POST",
      agent: false,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(text) },
    })
    if (timeoutMs !== undefined) req.setTimeout(timeoutMs, () => req.destroy(new Unreachable("timed out")))
    req.once("error", (error) => reject(error instanceof Unreachable ? error : new Unreachable(error.message)))
    req.once("response", (res) => {
      let reply = ""
      res.setEncoding("utf8")
      res.on("data", (chunk: string) => (reply += chunk))
      res.once("error", (error) => reject(new Unreachable(error.message)))
      res.once("end", () => {
        try {
          resolve(JSON.parse(reply) as HookReply)
        } catch {
          resolve(undefined)
        }
      })
    })
    req.end(text)
  })
}

/** Claude Code's decision output for a PermissionRequest hook. */
function decisionOutput(decision: PermissionAnswer): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision } })
}

/** Posts the event, and returns what the hook prints: a permission decision, or nothing. */
async function main(): Promise<string> {
  const text = await readStdin()
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    return ""
  }
  if (typeof input !== "object" || input === null) return ""
  const hunterId = process.env.GUSLAR_HUNTER_ID || undefined
  const body: HookRequest = { hunterId, input: input as HookRequest["input"] }
  const asks = body.input.hook_event_name === "PermissionRequest" && hunterId !== undefined

  let url: URL | undefined
  try {
    url = new URL("/api/hooks", process.env.GUSLAR_URL)
  } catch {
    url = undefined
  }

  if (!asks) {
    if (url) await post(url, body, POST_TIMEOUT_MS).catch(() => undefined)
    return ""
  }
  try {
    if (!url) throw new Unreachable("no GUSLAR_URL")
    const reply = await post(url, body)
    return reply?.decision ? `${decisionOutput(reply.decision)}\n` : ""
  } catch (error) {
    if (!(error instanceof Unreachable)) throw error
    return `${decisionOutput({ behavior: "allow" })}\n`
  }
}

// A pipe's writes finish later on macOS, so the hook exits only once its decision is out.
void main()
  .catch(() => "")
  .then((output) => (output === "" ? process.exit(0) : process.stdout.write(output, () => process.exit(0))))
