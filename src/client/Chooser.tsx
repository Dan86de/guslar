import { useEffect, useId, useRef, useState } from "react"
import { PERMISSION_MODES, type PermissionMode, type TakeRequest } from "../shared/world.js"
import { useWords, type Words } from "./words/index.js"

/**
 * Asks how far the hunter may go without you, then sends it. Closing it sends nobody.
 * `heading` says what the hunter is sent for, and `title` what it is sent on.
 *
 * A rite the map cannot describe by itself passes `message`, and the chooser asks what to tell the
 * hunter before it asks how far it may go. What is typed there goes with it as it rides out.
 */
export function Chooser({
  heading,
  title,
  message,
  onChoose,
  onClose,
}: {
  heading: string
  title: string
  /** What to call the field for the hunter's message, when the rite takes one. */
  message?: { label: string; hint: string }
  onChoose: (mode: PermissionMode, message: string) => Promise<string | undefined>
  onClose: () => void
}) {
  const words = useWords()
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const messageId = useId()
  const [said, setSaid] = useState("")
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string>()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  // A refusal leaves the dialog standing with what was typed still in it: a paragraph written for a
  // hunter is not thrown away because the road to the server was cut.
  const choose = async (mode: PermissionMode) => {
    setSending(true)
    setProblem(undefined)
    const refused = await onChoose(mode, said)
    setSending(false)
    if (refused) setProblem(refused)
    else dialog.current?.close()
  }

  return (
    <dialog
      ref={dialog}
      className="chooser"
      aria-labelledby={headingId}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close()
      }}
    >
      <h3 id={headingId} className="chooser-heading">
        {heading}
      </h3>
      <p className="chooser-title">{title}</p>
      {message && (
        <>
          <label className="chooser-ask chooser-said-label" htmlFor={messageId}>
            {message.label}
          </label>
          <textarea
            id={messageId}
            className="chooser-said"
            rows={3}
            value={said}
            disabled={sending}
            onChange={(event) => setSaid(event.target.value)}
          />
          <p className="chooser-said-hint">{message.hint}</p>
        </>
      )}
      <p className="chooser-ask">{words.chooser.ask}</p>
      <ul className="chooser-modes" aria-label={words.chooser.modesList}>
        {PERMISSION_MODES.map((mode) => (
          <li key={mode}>
            <button type="button" className="chooser-mode" disabled={sending} onClick={() => void choose(mode)}>
              <span className="chooser-label">{words.chooser.modes[mode].label}</span>
              <span className="chooser-detail">{words.chooser.modes[mode].detail}</span>
              <span className="chooser-flag">{mode}</span>
            </button>
          </li>
        ))}
      </ul>
      {problem && (
        <p className="chooser-problem" role="alert">
          {problem}
        </p>
      )}
      <button type="button" className="chooser-cancel" onClick={() => dialog.current?.close()}>
        {words.chooser.cancel}
      </button>
    </dialog>
  )
}

/** Sends a take to the server, and returns why it was refused, or nothing when a hunter rode out. */
export async function sendTake(words: Words, request: TakeRequest): Promise<string | undefined> {
  try {
    const res = await fetch("/api/hunters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    })
    if (res.ok) return undefined
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return body.error ?? words.server.answered(res.status)
  } catch {
    return words.server.unreachable
  }
}
