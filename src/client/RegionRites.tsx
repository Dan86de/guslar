import { useEffect, useId, useRef, useState } from "react"
import { errandOf, isReturned, refusalOf, RITE_NAMES, type Hunter, type RegionSlot, type Rite } from "../shared/world.js"
import { Chooser, sendTake } from "./Chooser.js"

/** The rites a region performs itself, before or beside any one village. */
const REGION_RITES: { rite: Rite; detail: string }[] = [
  { rite: "interview", detail: "A hunter asks what the region needs, until nothing is left unsettled." },
  { rite: "write-spec", detail: "A hunter writes the bounty a new village is founded on." },
  { rite: "make-verify", detail: "A hunter sets how a kill in this region is proven." },
]

/**
 * What the chooser asks before it asks how far, on the one rite the map cannot describe by itself:
 * the others are sent at a spec or a contract, an interview at nothing until you say so.
 */
const INTERVIEW_MESSAGE = {
  label: "What shall the hunter ask you about?",
  hint: "Leave it empty and it asks what the region needs.",
}

/** What the region's list says of the hunter sent on one of its rites: out on it, or how it came back. */
function hunterLine(hunter: Hunter): string {
  switch (hunter.state) {
    case "returned-trophy":
      return `${hunter.name} returned with a trophy`
    case "returned-wounded":
      return `${hunter.name} returned wounded`
    default:
      return `${hunter.name} is out ${errandOf(hunter)}`
  }
}

/**
 * A region's rites, opened from its plaque: hear the villagers, draft the bounty and set the proof
 * of kill, each sending a hunter with that skill into the region's repo. A region takes one hunter
 * at a time for its own rites.
 */
export function RegionRites({
  slot,
  name,
  hunters,
  onClose,
}: {
  slot: RegionSlot
  name: string
  /** The hunters sent on this region's own rites, out or returned. */
  hunters: Hunter[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [choosing, setChoosing] = useState<Rite>()
  const [refusal, setRefusal] = useState<string>()

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const send = (rite: Rite) => {
    const holder = hunters.find((h) => !isReturned(h))
    if (holder) {
      setRefusal(refusalOf({ title: name }, holder))
      return
    }
    setRefusal(undefined)
    setChoosing(rite)
  }

  const hunter = hunters[0]

  return (
    <dialog
      ref={dialog}
      className="chooser rites"
      aria-labelledby={heading}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close()
      }}
    >
      <h2 id={heading} className="chooser-heading">
        <span className="visually-hidden">Rites of </span>
        {name}
      </h2>
      <p className="chooser-title">{`The ${slot.replace("-", " ")}`}</p>
      {hunter && <p className="rites-hunter">{hunterLine(hunter)}</p>}
      <p className="chooser-ask">Which rite will you have a hunter perform here?</p>
      <ul className="chooser-modes" aria-label="Rites">
        {REGION_RITES.map(({ rite, detail }) => (
          <li key={rite}>
            <button type="button" className="chooser-mode" onClick={() => send(rite)}>
              <span className="chooser-label">{RITE_NAMES[rite]}</span>
              <span className="chooser-detail">{detail}</span>
              <span className="chooser-flag">{`/${rite}`}</span>
            </button>
          </li>
        ))}
      </ul>
      {refusal && (
        <p className="chooser-problem" role="alert">
          {refusal}
        </p>
      )}
      <button
        type="button"
        className="chooser-cancel"
        aria-label="Close the rites"
        onClick={() => dialog.current?.close()}
      >
        Close
      </button>
      {choosing && (
        <Chooser
          key={choosing}
          heading={`Send a hunter ${errandOf({ rite: choosing })}`}
          title={name}
          message={choosing === "interview" ? INTERVIEW_MESSAGE : undefined}
          onChoose={(permissionMode, message) => sendTake({ slot, rite: choosing, permissionMode, message })}
          onClose={() => setChoosing(undefined)}
        />
      )}
    </dialog>
  )
}
