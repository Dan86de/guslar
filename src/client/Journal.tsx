import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react"
import { Said } from "./Said.js"
import { isReturned, type Hunter, type JournalEntry, type ReplyRequest } from "../shared/world.js"
import { whyRefused } from "./refused.js"
import { sayRefusal, useWords, type Words } from "./words/index.js"

/** Sends a reply to the server, and returns why it was refused, or nothing when the hunter got it. */
async function sendReply(words: Words, hunter: Hunter, text: string): Promise<string | undefined> {
  const request: ReplyRequest = { text }
  try {
    const res = await fetch(`/api/hunters/${hunter.id}/replies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    })
    if (res.ok) return undefined
    return await whyRefused(words, res)
  } catch {
    return words.server.unreachable
  }
}

/**
 * Sends a hunter home: it leaves the map, and its session is let go. The journal closes first, so
 * there is nowhere left to show a refusal, and none is left to show: the button is offered only
 * once a hunter has come back, which leaves a hunter the map has already lost, and a server that is
 * gone, which the map says itself.
 */
function sendHome(hunter: Hunter): void {
  // It carries nothing to say, and still says it in JSON: the content type is what marks the
  // request as this map's, since a page elsewhere cannot send one without a preflight.
  void fetch(`/api/hunters/${hunter.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  }).catch(() => undefined)
}

/**
 * Which row of the chronicle each entry stands on, the reading page and the rail being its two
 * columns. Everything the hunter and you said takes the next row of the page, so the reading runs
 * on unbroken; a tool call takes the row of the words it followed, or the next row down the rail
 * when that row is already spoken for, so a turn's calls stand beside the turn that made them, in
 * the order it made them, and never above the words that led to them.
 */
function rowsOf(entries: JournalEntry[]): number[] {
  const rows: number[] = []
  let page = 0
  let rail = 0
  for (const entry of entries) {
    if (entry.kind === "tool") {
      rail = Math.max(page, rail + 1)
      rows.push(rail)
    } else {
      page += 1
      rows.push(page)
    }
  }
  return rows
}

function Entry({ entry, hunter, row }: { entry: JournalEntry; hunter: Hunter; row: number }) {
  const words = useWords()
  const style = { gridRow: String(row) }
  switch (entry.kind) {
    case "you":
      return (
        <li className="entry" data-kind="you" style={style}>
          <span className="entry-who">
            {words.journal.you}
            <span className="entry-colon">:</span>
          </span>
          <span className="entry-text">{entry.text}</span>
        </li>
      )
    case "said":
      // A hunter's words are the one text here that is set as type. What you typed and what a tool
      // was given are shown as they were written, since neither was written as markdown.
      return (
        <li className="entry" data-kind="said" style={style}>
          <span className="entry-who">
            {hunter.name}
            <span className="entry-colon">:</span>
          </span>
          <Said text={entry.text} />
        </li>
      )
    case "tool":
      return (
        <li className="entry" data-kind="tool" style={style}>
          <span className="entry-tool">
            {entry.tool}
            <span className="entry-colon">:</span>
          </span>
          <code className="entry-input">{entry.input}</code>
        </li>
      )
    case "result":
      return (
        <li className="entry" data-kind="result" data-error={entry.error ? "" : undefined} style={style}>
          {entry.error ? words.journal.turnFails(entry.text) : words.journal.turnEnds}
        </li>
      )
  }
}

/**
 * A hunter's chronicle: one surface for reading its whole session, opened from its leaf in the
 * margin. The turns run down a reading page wide enough for a table, a diff and a fenced block,
 * the tool calls of each turn stand on a rail beside it, and a line at the foot writes back to
 * that hunter by name. A session started outside Guslar is read here and written to in its own
 * terminal.
 */
export function Journal({
  hunter,
  hunters,
  bound,
  onTurn,
  onOpenTerminal,
  onClose,
}: {
  hunter: Hunter
  /** Every hunter the chronicle can be turned to, in the order they stand down the map. */
  hunters: Hunter[]
  /** What the hunter was sent for, and where. */
  bound: { what: string; where: string }
  /** Turns the chronicle to another hunter, by its id, without closing it. */
  onTurn: (id: string) => void
  onOpenTerminal: () => void
  onClose: () => void
}) {
  const words = useWords()
  const dialog = useRef<HTMLDialogElement>(null)
  const entries = useRef<HTMLOListElement>(null)
  const heading = useId()
  const refusal = useId()
  // Your reading of each hunter, kept by hunter for as long as the chronicle stands open: the
  // reply you had begun to it, and where on its page you had got to. Turning to another hunter
  // leaves both where they were rather than throwing them away, so the chronicle is one surface
  // turned from hunter to hunter and not a new one opened each time.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string>()
  const [problem, setProblem] = useState<{ hunter: string; said: string }>()
  const places = useRef(new Map<string, { top: number; atEnd: boolean }>())
  const draft = drafts[hunter.id] ?? ""
  const rows = rowsOf(hunter.journal)

  // Only a hunter that has come back goes home: one still out may hold a permission request, and
  // letting go of an unanswered request is read by its hook as Guslar being gone, which allows it.
  const back = isReturned(hunter)
  const stillOut = sayRefusal(words, { reason: "still-out", hunter: hunter.name })

  // A layout effect, not a passive one: React runs every layout effect before any passive effect,
  // so showing the dialog here is what lets the effect below measure it. Shown passively, it is
  // still display:none when that effect runs, and the journal opens at its first entry.
  useLayoutEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.show()
  }, [])

  // New entries keep the journal at its last page, unless you have turned back to read, and a
  // page turned back to is where the chronicle stands again when you come back to that hunter.
  useLayoutEffect(() => {
    const list = entries.current
    if (!list) return
    const place = places.current.get(hunter.id)
    list.scrollTop = place && !place.atEnd ? place.top : list.scrollHeight
  }, [hunter.id, hunter.journal.length])

  const send = async (event?: SyntheticEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    const { id } = hunter
    if (text === "" || sending === id) return
    setSending(id)
    setProblem(undefined)
    const refused = await sendReply(words, hunter, text)
    setSending(undefined)
    if (refused) {
      setProblem({ hunter: id, said: refused })
      return
    }
    setDrafts((was) => ({ ...was, [id]: "" }))
    // Written to, a hunter's page follows its words again, wherever you had turned back to.
    places.current.delete(id)
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
          <span className="journal-of">{words.journal.of}</span>
          {hunter.name}
        </h2>
        {/* The index: one name per hunter on the map, in the order they stand down it, as the
            margin reads. It stands in the head's own space, so the page below it never moves. */}
        {hunters.length > 1 && (
          <nav className="journal-index" aria-label={words.journal.journals}>
            {hunters.map((other) => (
              <button
                key={other.id}
                type="button"
                className="journal-turn"
                aria-label={words.journal.turnTo(other.name)}
                aria-current={other.id === hunter.id ? "page" : undefined}
                data-current={other.id === hunter.id || undefined}
                onClick={() => onTurn(other.id)}
              >
                {other.name}
              </button>
            ))}
          </nav>
        )}
        <p className="journal-bound">
          {bound.what}, <span className="journal-village">{bound.where}</span>
        </p>
        <div className="journal-status">
          <p className="journal-state">{words.hunter.states[hunter.state]}</p>
          <div className="journal-acts">
            {!hunter.outside && (
              <button
                type="button"
                className="journal-act"
                disabled={!hunter.sessionId}
                title={hunter.sessionId ? undefined : sayRefusal(words, { reason: "not-begun", hunter: hunter.name })}
                onClick={onOpenTerminal}
              >
                {words.journal.openTerminal}
              </button>
            )}
            <button
              type="button"
              className="journal-act"
              disabled={!back}
              title={back ? undefined : stillOut}
              // A title is read by a pointer alone, so the same words stand in the page for the
              // button's description, as the only thing that says why it is refused.
              aria-describedby={back ? undefined : refusal}
              onClick={() => {
                // The journal closes first, so focus goes back to whatever opened it. Left to the
                // hunter leaving the world, the leaf would be torn out with no close at all.
                dialog.current?.close()
                sendHome(hunter)
              }}
            >
              {words.journal.sendHome}
            </button>
            {!back && (
              <p id={refusal} className="visually-hidden">
                {stillOut}
              </p>
            )}
          </div>
        </div>
        <button type="button" className="journal-close" aria-label={words.journal.close} onClick={() => dialog.current?.close()}>
          {words.close}
        </button>
      </header>
      <ol
        ref={entries}
        className="journal-entries"
        aria-label={words.journal.entries}
        aria-live="polite"
        onScroll={(event) => {
          const list = event.currentTarget
          places.current.set(hunter.id, {
            top: list.scrollTop,
            atEnd: list.scrollHeight - list.scrollTop - list.clientHeight < 24,
          })
        }}
      >
        {hunter.journal.map((entry, index) => (
          <Entry key={index} entry={entry} hunter={hunter} row={rows[index] ?? index + 1} />
        ))}
      </ol>
      {hunter.outside ? (
        <p className="journal-outside">{words.journal.outside(hunter.name)}</p>
      ) : (
        <form className="journal-reply" onSubmit={(event) => void send(event)}>
          {problem?.hunter === hunter.id && (
            <p className="journal-problem" role="alert">
              {problem.said}
            </p>
          )}
          <textarea
            className="journal-draft"
            aria-label={words.journal.reply(hunter.name)}
            placeholder={words.journal.draft(hunter.name)}
            rows={2}
            value={draft}
            autoFocus
            onChange={(event) => setDrafts((was) => ({ ...was, [hunter.id]: event.target.value }))}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className="journal-send" disabled={sending === hunter.id || draft.trim() === ""}>
            {words.journal.send}
          </button>
        </form>
      )}
    </dialog>
  )
}
