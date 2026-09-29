import type { Refused } from "../shared/world.js"
import { sayRefusal, type Words } from "./words/index.js"

/**
 * Why the server would not do what the map asked, in the theme's words: a refusal as its reason
 * code says it, a request it could not read as it said so, or else the status it answered.
 */
export async function whyRefused(words: Words, res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Partial<Refused> & { error?: string }
  if (body.refusal) return sayRefusal(words, body.refusal)
  return body.error ?? words.server.answered(res.status)
}
