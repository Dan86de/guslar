import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useEffect, useId, useRef, useState } from "react"
import type { Hunter, TerminalInput, TerminalOutput } from "../shared/world.js"
import { whyRefused } from "./refused.js"
import { useWords, type Words } from "./words/index.js"

/** Asks the server to resume a hunter's session in a terminal, and returns why it would not, or nothing once it is open. */
async function openTerminal(words: Words, hunter: Hunter): Promise<string | undefined> {
  try {
    const res = await fetch(`/api/hunters/${hunter.id}/terminal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    if (res.ok) return undefined
    return await whyRefused(words, res)
  } catch {
    return words.server.unreachable
  }
}

/** The terminal in the map's own colours: bone on night, with a rust selection. */
const THEME = {
  background: "#1d1812",
  foreground: "#d9cba8",
  cursor: "#d9cba8",
  cursorAccent: "#1d1812",
  selectionBackground: "rgba(138, 59, 42, 0.55)",
}

/**
 * A hunter's session resumed in a real terminal: `claude --resume` in a pseudo-terminal on
 * the server, shown and typed into here. Closing it hides the terminal and leaves its session
 * running, to be shown again from the journal.
 */
export function TerminalView({
  hunter,
  besideJournal,
  onClose,
}: {
  hunter: Hunter
  besideJournal: boolean
  onClose: () => void
}) {
  const words = useWords()
  const dialog = useRef<HTMLDialogElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const heading = useId()
  const [problem, setProblem] = useState<string>()
  const [ended, setEnded] = useState<number>()
  // Each opening resumes the session anew once the last terminal has ended.
  const [opening, setOpening] = useState(0)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.show()
  }, [])

  useEffect(() => {
    const host = screen.current
    if (!host) return
    let stopped = false
    let socket: WebSocket | undefined
    const terminal = new Terminal({
      theme: THEME,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.15,
      cursorBlink: true,
      screenReaderMode: true,
      allowProposedApi: false,
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host)

    const sendInput = (message: TerminalInput) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }
    const refit = () => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      sendInput({ type: "resize", cols: terminal.cols, rows: terminal.rows })
    }
    // Sized to its frame before anything is written to it, so no line is laid out at the wrong width.
    refit()
    const resized = new ResizeObserver(refit)
    resized.observe(host)
    terminal.onData((data) => sendInput({ type: "input", data }))

    void openTerminal(words, hunter).then((refused) => {
      if (stopped) return
      if (refused) {
        setProblem(refused)
        return
      }
      const protocol = location.protocol === "https:" ? "wss:" : "ws:"
      socket = new WebSocket(`${protocol}//${location.host}/api/hunters/${hunter.id}/terminal`)
      socket.onopen = () => {
        refit()
        terminal.focus()
      }
      socket.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as TerminalOutput
        if (message.type === "output") terminal.write(message.data)
        else setEnded(message.exitCode)
      }
      socket.onclose = (event) => {
        if (!stopped && !event.wasClean) setProblem(words.terminal.cut)
      }
    })

    return () => {
      stopped = true
      resized.disconnect()
      socket?.close()
      terminal.dispose()
    }
    // The terminal belongs to one hunter, keyed on it, and restarts only when opened anew.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening])

  const exitCode = ended

  return (
    <dialog
      ref={dialog}
      className="hunter-terminal"
      aria-labelledby={heading}
      data-beside-journal={besideJournal ? "" : undefined}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <header className="hunter-terminal-head">
        <h2 id={heading} className="hunter-terminal-heading">
          <span className="hunter-terminal-of">{words.terminal.of}</span>
          {hunter.name}
        </h2>
        <code className="hunter-terminal-command">claude --resume {hunter.sessionId}</code>
        {exitCode === undefined ? (
          <p className="hunter-terminal-state">{words.terminal.running}</p>
        ) : (
          <p className="hunter-terminal-state" data-ended="">
            {words.terminal.ended(exitCode)}
          </p>
        )}
        {exitCode !== undefined && (
          <button
            type="button"
            className="hunter-terminal-again"
            onClick={() => {
              setEnded(undefined)
              setProblem(undefined)
              setOpening((n) => n + 1)
            }}
          >
            {words.terminal.again}
          </button>
        )}
        <button type="button" className="hunter-terminal-close" aria-label={words.terminal.close} onClick={() => dialog.current?.close()}>
          {words.close}
        </button>
      </header>
      {problem && (
        <p className="hunter-terminal-problem" role="alert">
          {problem}
        </p>
      )}
      <div ref={screen} className="hunter-terminal-screen" />
    </dialog>
  )
}
