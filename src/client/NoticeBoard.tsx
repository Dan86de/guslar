import { useEffect, useId, useRef, useState } from "react"
import {
  isReturned,
  refusalOf,
  type Contract,
  type Hunter,
  type PermissionMode,
  type RegionSlot,
  type TakeRequest,
  type Village,
} from "../shared/world.js"

/** afk: the hunter rides alone. hitl: the alderman summons you before it is paid. */
const AUTONOMY = { afk: "rides alone", hitl: "summons you" } as const

/** How far a hunter may go without asking you, as the chooser offers it. */
const MODES: { mode: PermissionMode; label: string; detail: string }[] = [
  { mode: "default", label: "Ask before every tool", detail: "It stops for you at each step." },
  { mode: "acceptEdits", label: "Edit files freely", detail: "It asks before anything else." },
  { mode: "auto", label: "Let Claude judge", detail: "It asks only when a step looks risky." },
  { mode: "bypassPermissions", label: "Never ask", detail: "It rides alone and asks nothing." },
]

function stateLine(contract: Contract): string {
  switch (contract.state) {
    case "done":
      return "Done"
    case "pending":
      return "Pending"
    case "ready":
      return "Ready"
    case "sealed":
      return `Sealed by ${(contract.sealedBy ?? []).join(", ")}`
  }
}

/** What a contract's card says of the hunter sent on it: out on it, or how it came back. */
function hunterLine(hunter: Hunter): string {
  switch (hunter.state) {
    case "returned-trophy":
      return `${hunter.name} returned with a trophy`
    case "returned-wounded":
      return `${hunter.name} returned wounded`
    default:
      return `${hunter.name} hunts it`
  }
}

function ContractCard({
  contract,
  hunter,
  onTake,
}: {
  contract: Contract
  hunter: Hunter | undefined
  onTake: (contract: Contract) => void
}) {
  return (
    <li className="card" data-state={contract.state} data-hunted={hunter ? "" : undefined}>
      {contract.state === "sealed" && <span className="card-seal" aria-hidden="true" />}
      {contract.state === "pending" && <span className="card-flare" aria-hidden="true" />}
      <span className="card-text">
        <span className="card-head">
          <span className="card-id">{contract.id}</span>
          <span className="card-autonomy" title={AUTONOMY[contract.autonomy]}>
            {contract.autonomy}
          </span>
        </span>
        <span className="card-title">{contract.title}</span>
        <span className="card-state">{stateLine(contract)}</span>
        {hunter && <span className="card-hunter">{hunterLine(hunter)}</span>}
        {contract.state === "ready" && !(hunter && !isReturned(hunter)) && (
          <button type="button" className="card-take" aria-label={`Take ${contract.id}`} onClick={() => onTake(contract)}>
            Take
          </button>
        )}
      </span>
    </li>
  )
}

/** Asks how far the hunter may go without you, then sends it. Closing it sends nobody. */
function Chooser({
  contract,
  onChoose,
  onClose,
}: {
  contract: Contract
  onChoose: (mode: PermissionMode) => Promise<string | undefined>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
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
      aria-labelledby={heading}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close()
      }}
    >
      <h3 id={heading} className="chooser-heading">{`Send a hunter on ${contract.id}`}</h3>
      <p className="chooser-title">{contract.title}</p>
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
async function sendTake(request: TakeRequest): Promise<string | undefined> {
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

/** A village's notice board: every contract of its spec, pinned up with its state, the ready ones there to take. */
export function NoticeBoard({
  slot,
  village,
  hunters,
  onClose,
}: {
  slot: RegionSlot
  village: Village
  /** The hunters on this village's contracts, out or returned. */
  hunters: Hunter[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [choosing, setChoosing] = useState<Contract>()
  const [refusal, setRefusal] = useState<string>()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const take = (contract: Contract) => {
    // A village takes one hunter at a time; the server says the same if the map is behind.
    // A hunter that has returned holds it no longer.
    const holder = hunters.find((h) => !isReturned(h))
    if (holder) {
      setRefusal(refusalOf(village, holder))
      return
    }
    setRefusal(undefined)
    setChoosing(contract)
  }

  return (
    <dialog
      ref={dialog}
      className="board"
      aria-labelledby={heading}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => {
        // A click on the dim around the board, not on the board itself, puts it away.
        if (event.target === event.currentTarget) dialog.current?.close()
      }}
    >
      <div className="board-art">
        <h2 id={heading} className="board-title">
          <span className="visually-hidden">Notice board of </span>
          {village.title}
        </h2>
        <button
          type="button"
          className="board-close"
          aria-label="Close the notice board"
          onClick={() => dialog.current?.close()}
        >
          Close
        </button>
        <div className="board-face">
          {village.problem ? (
            <p className="board-note">The contracts cannot be read. {village.problem}</p>
          ) : village.contracts.length === 0 ? (
            <p className="board-note">No contracts are posted yet.</p>
          ) : (
            <ul className="cards" aria-label="Contracts">
              {village.contracts.map((contract) => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  hunter={hunters.find((h) => h.contract === contract.id)}
                  onTake={take}
                />
              ))}
            </ul>
          )}
        </div>
        {refusal && (
          <p className="board-refusal" role="alert">
            {refusal}
          </p>
        )}
      </div>
      {choosing && (
        <Chooser
          key={choosing.id}
          contract={choosing}
          onChoose={(permissionMode) =>
            sendTake({ slot, village: village.slug, contract: choosing.id, permissionMode })
          }
          onClose={() => setChoosing(undefined)}
        />
      )}
    </dialog>
  )
}
