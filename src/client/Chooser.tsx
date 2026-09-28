import { useEffect, useId, useRef, useState } from "react"
import type { PermissionMode, TakeRequest } from "../shared/world.js"

/** How far a hunter may go without asking you, as the chooser offers it. */
const MODES: { mode: PermissionMode; label: string; detail: string }[] = [
  { mode: "default", label: "Ask before every tool", detail: "It stops for you at each step." },
  { mode: "acceptEdits", label: "Edit files freely", detail: "It asks before anything else." },
  { mode: "auto", label: "Let Claude judge", detail: "It asks only when a step looks risky." },
  { mode: "bypassPermissions", label: "Never ask", detail: "It rides alone and asks nothing." },
]

/**
 * Asks how far the hunter may go without you, then sends it. Closing it sends nobody.
 * `heading` says what the hunter is sent for, and `title` what it is sent on.
 */
export function Chooser({
  heading,
  title,
  onChoose,
  onClose,
}: {
  heading: string
  title: string
  onChoose: (mode: PermissionMode) => Promise<string | undefined>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string>()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const choose = async (mode: PermissionMode) => {
    setSending(true)
    setProblem(undefined)
    const refused = await onChoose(mode)
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
      <p className="chooser-ask">How far may the hunter go without asking you?</p>
      <ul className="chooser-modes" aria-label="Permission modes">
        {MODES.map(({ mode, label, detail }) => (
          <li key={mode}>
            <button type="button" className="chooser-mode" disabled={sending} onClick={() => void choose(mode)}>
              <span className="chooser-label">{label}</span>
              <span className="chooser-detail">{detail}</span>
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
        Cancel
      </button>
    </dialog>
  )
}

/** Sends a take to the server, and returns why it was refused, or nothing when a hunter rode out. */
export async function sendTake(request: TakeRequest): Promise<string | undefined> {
  try {
    const res = await fetch("/api/hunters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    })
    if (res.ok) return undefined
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return body.error ?? `The server answered ${res.status}.`
  } catch {
    return "The road to the server is cut. Try again once it is back."
  }
}
