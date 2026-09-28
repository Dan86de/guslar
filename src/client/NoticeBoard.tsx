import { useEffect, useId, useRef, useState } from "react"
import {
  errandOf,
  isReturned,
  refusalOf,
  RITE_NAMES,
  type Contract,
  type Hunter,
  type RegionSlot,
  type Rite,
  type Village,
} from "../shared/world.js"
import { Chooser, sendTake } from "./Chooser.js"

/** afk: the hunter rides alone. hitl: the alderman summons you before it is paid. */
const AUTONOMY = { afk: "rides alone", hitl: "summons you" } as const

/** A rite the board sends a hunter on: a contract's hunt or inspection, or posting the village's contracts. */
type Errand = { rite: Rite; contract?: Contract }

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

/** What a card or the board says of the hunter sent on it: out on it, or how it came back. */
function hunterLine(hunter: Hunter): string {
  switch (hunter.state) {
    case "returned-trophy":
      return `${hunter.name} returned with a trophy`
    case "returned-wounded":
      return `${hunter.name} returned wounded`
    default:
      switch (hunter.rite) {
        case "implement-slice":
          return `${hunter.name} hunts it`
        case "sign-off":
          return `${hunter.name} inspects it`
        default:
          return `${hunter.name} is out ${errandOf(hunter)}`
      }
  }
}

function ContractCard({
  contract,
  hunter,
  onSend,
}: {
  contract: Contract
  hunter: Hunter | undefined
  onSend: (errand: Errand) => void
}) {
  const free = !(hunter && !isReturned(hunter))
  // A pending card has room for its Inspect or its hunter's line, not both; once the hunter is
  // back, Inspect is what the card asks of you, and the map still shows how the hunter came back.
  const inspectable = contract.state === "pending" && free
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
        {hunter && !inspectable && <span className="card-hunter">{hunterLine(hunter)}</span>}
        {contract.state === "ready" && free && (
          <button
            type="button"
            className="card-take"
            aria-label={`Take ${contract.id}`}
            onClick={() => onSend({ rite: "implement-slice", contract })}
          >
            Take
          </button>
        )}
        {inspectable && (
          <button
            type="button"
            className="card-take"
            aria-label={`${RITE_NAMES["sign-off"]} of ${contract.id}`}
            onClick={() => onSend({ rite: "sign-off", contract })}
          >
            Inspect
          </button>
        )}
      </span>
    </li>
  )
}

/**
 * A village's notice board: every contract of its spec, pinned up with its state, the ready ones
 * there to take and the pending ones to inspect, and, until any are posted, the rite that posts them.
 */
export function NoticeBoard({
  slot,
  village,
  hunters,
  onClose,
}: {
  slot: RegionSlot
  village: Village
  /** The hunters sent on this village or its contracts, out or returned. */
  hunters: Hunter[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [choosing, setChoosing] = useState<Errand>()
  const [refusal, setRefusal] = useState<string>()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const send = (errand: Errand) => {
    // A village takes one hunter at a time; the server says the same if the map is behind.
    // A hunter that has returned holds it no longer.
    const holder = hunters.find((h) => !isReturned(h))
    if (holder) {
      setRefusal(refusalOf(village, holder))
      return
    }
    setRefusal(undefined)
    setChoosing(errand)
  }

  // The hunter posting this village's contracts, which no card names while none are posted.
  const poster = hunters.find((h) => h.rite === "write-slices")

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
            <div className="board-note">
              <p>No contracts are posted yet.</p>
              {poster && <p className="board-hunter">{hunterLine(poster)}</p>}
              {!village.slices && !(poster && !isReturned(poster)) && (
                <button type="button" className="board-rite" onClick={() => send({ rite: "write-slices" })}>
                  {RITE_NAMES["write-slices"]}
                </button>
              )}
            </div>
          ) : (
            <ul className="cards" aria-label="Contracts">
              {village.contracts.map((contract) => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  hunter={hunters.find((h) => h.contract === contract.id)}
                  onSend={send}
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
          key={`${choosing.rite}/${choosing.contract?.id ?? ""}`}
          heading={`Send a hunter ${errandOf({ rite: choosing.rite, contract: choosing.contract?.id })}`}
          title={choosing.contract?.title ?? village.title}
          onChoose={(permissionMode) =>
            sendTake({
              slot,
              rite: choosing.rite,
              village: village.slug,
              ...(choosing.contract ? { contract: choosing.contract.id } : {}),
              permissionMode,
            })
          }
          onClose={() => setChoosing(undefined)}
        />
      )}
    </dialog>
  )
}
