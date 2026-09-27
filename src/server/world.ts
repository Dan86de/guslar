import path from "node:path"
import { REGION_SLOTS, type SlotState, type World, type WorldState } from "../shared/world.js"

/** Every painted slot, in a fixed order: the repo assigned to it, or fog. */
export function projectWorld(world: World): WorldState {
  const slots = REGION_SLOTS.map((slot): SlotState => {
    const region = world.regions.find((r) => r.slot === slot)
    if (!region) return { slot, kind: "fog" }
    return { slot, kind: "region", name: region.name ?? path.basename(region.repo), repo: region.repo }
  })
  return { slots }
}
