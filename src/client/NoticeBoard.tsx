import { useEffect, useId, useRef } from "react"
import type { Contract, Village } from "../shared/world.js"

/** afk: the hunter rides alone. hitl: the alderman summons you before it is paid. */
const AUTONOMY = { afk: "rides alone", hitl: "summons you" } as const

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

function ContractCard({ contract }: { contract: Contract }) {
  return (
    <li className="card" data-state={contract.state}>
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
      </span>
    </li>
  )
}

/** A village's notice board: every contract of its spec, pinned up with its state. */
export function NoticeBoard({ village, onClose }: { village: Village; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="board"
      aria-labelledby={heading}
      onClose={onClose}
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
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  )
}
