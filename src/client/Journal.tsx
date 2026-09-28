import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react"
import type { Hunter, JournalEntry, ReplyRequest } from "../shared/world.js"
import { HUNTER_STATE_NAMES } from "./hunterStates.js"

/** Sends a reply to the server, and returns why it was refused, or nothing when the hunter got it. */
async function sendReply(hunter: Hunter, text: string): Promise<string | undefined> {
  const request: ReplyRequest = { text }
  try {
    const res = await fetch(`/api/hunters/${hunter.id}/replies`, {
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

function Entry({ entry, hunter }: { entry: JournalEntry; hunter: Hunter }) {
  switch (entry.kind) {
    case "you":
      return (
        <li className="entry" data-kind="you">
          <span className="entry-who">
            You
            <span className="entry-colon">:</span>
          </span>
          <span className="entry-text">{entry.text}</span>
        </li>
      )
    case "said":
      return (
        <li className="entry" data-kind="said">
          <span className="entry-who">
            {hunter.name}
            <span className="entry-colon">:</span>
          </span>
          <span className="entry-text">{entry.text}</span>
        </li>
      )
    case "tool":
      return (
        <li className="entry" data-kind="tool">
          <span className="entry-tool">
            {entry.tool}
            <span className="entry-colon">:</span>
          </span>
          <code className="entry-input">{entry.input}</code>
        </li>
      )
    case "result":
      return (
        <li className="entry" data-kind="result" data-error={entry.error ? "" : undefined}>
          {entry.error ? `The turn ends in failure${entry.text ? `: ${entry.text}` : "."}` : "The turn ends."}
        </li>
      )
  }
}

/**
 * A hunter's journal: its conversation and tool calls as they arrive, and a line to write back to
 * it. It stands beside the map rather than over it, so the hunter can still be watched.
 */
export function Journal({
  hunter,
  bound,
  onOpenTerminal,
  onClose,
}: {
  hunter: Hunter
  /** What the hunter was sent for, and where. */
  bound: { what: string; where: string }
  onOpenTerminal: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const entries = useRef<HTMLOListElement>(null)
  const heading = useId()
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string>()
  const atEnd = useRef(true)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.show()
  }, [])

  // New entries keep the journal at its last page, unless you have turned back to read.
  useLayoutEffect(() => {
    const list = entries.current
    if (list && atEnd.current) list.scrollTop = list.scrollHeight
  }, [hunter.journal.length])

  const send = async (event?: SyntheticEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    if (text === "" || sending) return
    setSending(true)
    setProblem(undefined)
    const refused = await sendReply(hunter, text)
    setSending(false)
    if (refused) {
      setProblem(refused)
      return
    }
    setDraft("")
    atEnd.current = true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter starts a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) void send(event)
  }

  return (
    <dialog
      ref={dialog}
      className="journal"
      aria-labelledby={heading}
      data-state={hunter.state}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") dialog.current?.close()
      }}
    >
      <header className="journal-head">
        <h2 id={heading} className="journal-heading">
          <span className="journal-of">Journal of </span>
          {hunter.name}
        </h2>
        <p className="journal-bound">
          {bound.what}, <span className="journal-village">{bound.where}</span>
        </p>
        <div className="journal-status">
          <p className="journal-state">{HUNTER_STATE_NAMES[hunter.state]}</p>
          <button
            type="button"
            className="journal-terminal"
            disabled={!hunter.sessionId}
            title={hunter.sessionId ? undefined : `${hunter.name}'s session has not begun yet.`}
            onClick={onOpenTerminal}
          >
            Open in terminal
          </button>
        </div>
        <button type="button" className="journal-close" aria-label="Close the journal" onClick={() => dialog.current?.close()}>
          Close
        </button>
      </header>
      <ol
        ref={entries}
        className="journal-entries"
        aria-label="Entries"
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget
          atEnd.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24
        }}
      >
        {hunter.journal.map((entry, index) => (
          <Entry key={index} entry={entry} hunter={hunter} />
        ))}
      </ol>
      <form className="journal-reply" onSubmit={(event) => void send(event)}>
        {problem && (
          <p className="journal-problem" role="alert">
            {problem}
          </p>
        )}
        <textarea
          className="journal-draft"
          aria-label={`Reply to ${hunter.name}`}
          placeholder={`Write to ${hunter.name}…`}
          rows={2}
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="journal-send" disabled={sending || draft.trim() === ""}>
          Send
        </button>
      </form>
    </dialog>
  )
}
