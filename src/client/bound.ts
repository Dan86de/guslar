import { errandOf, RITE_NAMES, type Hunter, type WorldState } from "../shared/world.js"

/**
 * What a hunter is bound to, as its journal and its petitions say it: `what` it was sent for (its
 * contract with the contract's title, or its rite) and `where` (its village, or its region).
 */
export function boundOf(world: WorldState, hunter: Hunter): { what: string; where: string } {
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
    case "implement-slice":
      return { what: contract, where }
    case "sign-off":
      return { what: `${RITE_NAMES[hunter.rite]} of ${contract}`, where }
    default:
      return { what: RITE_NAMES[hunter.rite], where }
  }
}

/**
 * What a hunter is out for, as the map's list says it right after its state: ` on S3 of Drain the
 * bog` for a hunt, or `, sent to post contracts for Drain the bog` and `, sent to hear the
 * villagers in Bogwater Reach` for a rite.
 */
export function outFor(world: WorldState, hunter: Hunter): string {
  const { where } = boundOf(world, hunter)
  if (hunter.rite === "implement-slice") return ` ${errandOf(hunter)} of ${where}`
  return `, sent ${errandOf(hunter)} ${hunter.village === undefined ? "in" : "for"} ${where}`
}
