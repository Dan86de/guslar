import { boundOf } from "./bound.js"
import { useId, useState, type SyntheticEvent } from "react"
import type { Hunter, PermissionAnswer, PermissionPrompt, WorldState } from "../shared/world.js"
import { useWords, type Words } from "./words/index.js"

/** Sends your answer to the server, and returns why it was refused, or nothing when the hunter's hook got it. */
async function sendAnswer(words: Words, hunter: Hunter, prompt: PermissionPrompt, answer: PermissionAnswer): Promise<string | undefined> {
  try {
    const res = await fetch(`/api/hunters/${hunter.id}/prompts/${prompt.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answer),
    })
    if (res.ok) return undefined
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return body.error ?? words.server.answered(res.status)
  } catch {
    return words.server.unreachable
  }
}

/** A field of a tool's input as the prompt writes it: a string as it is, anything else as JSON. */
function shown(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

/**
 * One hunter's request, pinned to the map as a petition: what it wants to run, and your answer.
 * A denial may carry words for the hunter, which its session reads.
 */
function Petition({ hunter, prompt, bound }: { hunter: Hunter; prompt: PermissionPrompt; bound: string }) {
  const words = useWords()
  const heading = useId()
  const [reason, setReason] = useState("")
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string>()

  const { description, ...fields } = prompt.input
  const entries = Object.entries(fields)

  const answer = async (event: SyntheticEvent, behavior: PermissionAnswer["behavior"]) => {
    event.preventDefault()
    if (sending) return
    setSending(true)
    setProblem(undefined)
    const message = reason.trim()
    const refused = await sendAnswer(
      words,
      hunter,
      prompt,
      behavior === "allow" ? { behavior } : message === "" ? { behavior } : { behavior, message },
    )
    // Once answered, the petition leaves with the next world; until then it stays as it was.
    setSending(false)
    if (refused) setProblem(refused)
  }

  return (
    <section className="petition" role="dialog" aria-labelledby={heading}>
      <span className="petition-flare" aria-hidden="true" />
      <h2 id={heading} className="petition-heading">
        {hunter.name}
        <span className="petition-asks">{words.petition.asks}</span>
        <span className="petition-tool">{prompt.tool}</span>
      </h2>
      <p className="petition-bound">{bound}</p>
      {typeof description === "string" && description.trim() !== "" && (
        <p className="petition-description">{description}</p>
      )}
      {entries.length > 0 && (
        <dl className="petition-input">
          {entries.map(([key, value]) => (
            <div key={key} className="petition-field">
              <dt>{key}</dt>
              <dd>
                <code>{shown(value)}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <form className="petition-answer" onSubmit={(event) => void answer(event, "deny")}>
        <input
          className="petition-reason"
          type="text"
          aria-label={words.petition.reason(hunter.name)}
          placeholder={words.petition.reasonHint}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button
          type="button"
          className="petition-allow"
          aria-label={words.petition.allowHunter(hunter.name)}
          disabled={sending}
          onClick={(event) => void answer(event, "allow")}
        >
          {words.petition.allow}
        </button>
        <button type="submit" className="petition-deny" aria-label={words.petition.denyHunter(hunter.name)} disabled={sending}>
          {words.petition.deny}
        </button>
        {problem && (
          <p className="petition-problem" role="alert">
            {problem}
          </p>
        )}
      </form>
    </section>
  )
}

/** Every permission a hunter waits on you for, one petition each, down the map's left edge. */
export function Prompts({ world }: { world: WorldState }) {
  const words = useWords()
  const asking = world.hunters.filter((hunter) => hunter.prompt)
  if (asking.length === 0) return null
  return (
    <div className="petitions" aria-label={words.petition.requests} role="region">
      {asking.map((hunter) => {
        const { what, where } = boundOf(words, world, hunter)
        const bound = `${what}, ${where}`
        return hunter.prompt && <Petition key={hunter.prompt.id} hunter={hunter} prompt={hunter.prompt} bound={bound} />
      })}
    </div>
  )
}
