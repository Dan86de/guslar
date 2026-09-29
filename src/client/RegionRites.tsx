import { useEffect, useId, useRef, useState } from "react"
import { isReturned, type Hunter, type RegionSlot, type Rite } from "../shared/world.js"
import { Chooser, sendTake } from "./Chooser.js"
import { sayRefusal, useWords, type Words } from "./words/index.js"

/** The rites a region performs itself, before or beside any one village. */
const REGION_RITES = ["interview", "write-spec", "make-verify"] as const

/** What the region's list says of the hunter sent on one of its rites: out on it, or how it came back. */
function hunterLine(words: Words, hunter: Hunter): string {
  return words.hunter.returned(hunter) ?? words.hunter.out(hunter)
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
  const words = useWords()
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
      setRefusal(sayRefusal(words, { reason: "busy", place: name, holder }))
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
        <span className="visually-hidden">{words.rites.of}</span>
        {name}
      </h2>
      <p className="chooser-title">{words.rites.slot(words.map.slots[slot])}</p>
      {hunter && <p className="rites-hunter">{hunterLine(words, hunter)}</p>}
      <p className="chooser-ask">{words.rites.ask}</p>
      <ul className="chooser-modes" aria-label={words.rites.list}>
        {REGION_RITES.map((rite) => (
          <li key={rite}>
            <button type="button" className="chooser-mode" onClick={() => send(rite)}>
              <span className="chooser-label">{words.rites.names[rite]}</span>
              <span className="chooser-detail">{words.rites.details[rite]}</span>
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
        aria-label={words.rites.close}
        onClick={() => dialog.current?.close()}
      >
        {words.close}
      </button>
      {choosing && (
        <Chooser
          key={choosing}
          heading={words.chooser.send(words.hunter.errand({ rite: choosing }))}
          title={name}
          message={choosing === "interview" ? words.rites.interview : undefined}
          onChoose={(permissionMode, message) => sendTake(words, { slot, rite: choosing, permissionMode, message })}
          onClose={() => setChoosing(undefined)}
        />
      )}
    </dialog>
  )
}
