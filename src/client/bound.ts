import type { Hunter, WorldState } from "../shared/world.js"
import type { Words } from "./words/index.js"

/**
 * What a hunter is bound to, as its journal and its petitions say it: `what` it was sent for (its
 * contract with the contract's title, or its rite) and `where` (its village, or its region).
 */
export function boundOf(words: Words, world: WorldState, hunter: Hunter): { what: string; where: string } {
  const region = world.slots.find((slot) => slot.slot === hunter.slot)
  const regionName = region?.kind === "region" ? region.name : hunter.slot
  const village =
    region?.kind === "region" && hunter.village !== undefined
      ? region.villages.find((v) => v.slug === hunter.village)
      : undefined
  const where = hunter.village === undefined ? regionName : (village?.title ?? hunter.village)
  const title = village?.contracts.find((c) => c.id === hunter.contract)?.title
  const contract = `${hunter.contract ?? ""}${title ? ` ${title}` : ""}`
  switch (hunter.rite) {
    case undefined:
      return { what: words.bound.outside, where }
    case "implement-slice":
      return { what: contract, where }
    case "sign-off":
      return { what: words.bound.signOff(contract), where }
    default:
      return { what: words.rites.names[hunter.rite], where }
  }
}

/**
 * What a hunter is out for, as the map's list says it right after its state: ` on S3 of Drain the
 * bog` for a hunt, or `, sent to post contracts for Drain the bog` and `, sent to hear the
 * villagers in Bogwater Reach` for a rite. A session started outside Guslar says so after it:
 * ` in Bogwater Reach, started outside Guslar` until it is seen on a contract.
 */
export function outFor(words: Words, world: WorldState, hunter: Hunter): string {
  const { where } = boundOf(words, world, hunter)
  const errand = words.hunter.errand(hunter)
  if (hunter.outside) {
    const place = hunter.rite === undefined ? words.bound.outsideIn(where) : words.bound.hunt(errand, where)
    return `${place}${words.bound.outsideSuffix}`
  }
  if (hunter.rite === "implement-slice") return words.bound.hunt(errand, where)
  return words.bound.sent(errand, where, hunter.village === undefined)
}
