import { useEffect, useId, useRef, useState } from "react"
import {
  isReturned,
  type Contract,
  type Hunter,
  type RegionSlot,
  type Rite,
  type Village,
} from "../shared/world.js"
import { Chooser, sendTake } from "./Chooser.js"
import { sayRefusal, useWords, type Words } from "./words/index.js"

/** A rite the board sends a hunter on: a contract's hunt or inspection, or posting the village's contracts. */
type Errand = { rite: Rite; contract?: Contract }

function stateLine(words: Words, contract: Contract): string {
  return contract.state === "sealed" ? words.board.sealed(contract.sealedBy ?? []) : words.board.states[contract.state]
}

/** What a card or the board says of the hunter sent on it: out on it, or how it came back. */
function hunterLine(words: Words, hunter: Hunter): string {
  const back = words.hunter.returned(hunter)
  if (back !== undefined) return back
  switch (hunter.rite) {
    case "implement-slice":
      return words.hunter.hunts(hunter.name)
    case "sign-off":
      return words.hunter.inspects(hunter.name)
    default:
      return words.hunter.out(hunter)
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
  const words = useWords()
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
          <span className="card-autonomy" title={words.board.autonomy[contract.autonomy]}>
            {contract.autonomy}
          </span>
        </span>
        <span className="card-title">{contract.title}</span>
        <span className="card-state">{stateLine(words, contract)}</span>
        {hunter && !inspectable && <span className="card-hunter">{hunterLine(words, hunter)}</span>}
        {contract.state === "ready" && free && (
          <button
            type="button"
            className="card-take"
            aria-label={words.board.takeContract(contract.id)}
            onClick={() => onSend({ rite: "implement-slice", contract })}
          >
            {words.board.take}
          </button>
        )}
        {inspectable && (
          <button
            type="button"
            className="card-take"
            aria-label={words.board.inspectContract(contract.id)}
            onClick={() => onSend({ rite: "sign-off", contract })}
          >
            {words.board.inspect}
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
  const words = useWords()
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
      setRefusal(sayRefusal(words, { reason: "busy", place: village.title, holder }))
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
          <span className="visually-hidden">{words.board.of}</span>
          {village.title}
        </h2>
        <button
          type="button"
          className="board-close"
          aria-label={words.board.close}
          onClick={() => dialog.current?.close()}
        >
          {words.close}
        </button>
        <div className="board-face">
          {village.problem ? (
            <p className="board-note">{words.board.unreadable(village.problem)}</p>
          ) : village.contracts.length === 0 ? (
            <div className="board-note">
              <p>{words.board.empty}</p>
              {poster && <p className="board-hunter">{hunterLine(words, poster)}</p>}
              {!village.slices && !(poster && !isReturned(poster)) && (
                <button type="button" className="board-rite" onClick={() => send({ rite: "write-slices" })}>
                  {words.rites.names["write-slices"]}
                </button>
              )}
            </div>
          ) : (
            <ul className="cards" aria-label={words.board.contracts}>
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
          heading={words.chooser.send(words.hunter.errand({ rite: choosing.rite, contract: choosing.contract?.id }))}
          title={choosing.contract?.title ?? village.title}
          onChoose={(permissionMode) =>
            sendTake(words, {
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
