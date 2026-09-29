import { isDeepStrictEqual } from "node:util"
import path from "node:path"
import { REGION_SLOTS, type ContractState, type RegionSlot, type SlotState, type World } from "../shared/world.js"
import { REGION_NAMES } from "../shared/theme.js"
import { RegionReader } from "./region.js"

/** How often the repos are read again, so the map follows what the skills write. */
const POLL_MS = 1000

/** Reads the world from the repos in world.json: every painted slot, in a fixed order, as its region or fog. */
export class WorldReader {
  private readonly readers = new Map<RegionSlot, RegionReader>()

  constructor(private readonly world: World) {
    for (const region of world.regions) this.readers.set(region.slot, new RegionReader(region.repo))
  }

  async read(): Promise<SlotState[]> {
    return Promise.all(
      REGION_SLOTS.map(async (slot): Promise<SlotState> => {
        const region = this.world.regions.find((r) => r.slot === slot)
        const reader = this.readers.get(slot)
        if (!region || !reader) return { slot, kind: "fog" }
        return {
          slot,
          kind: "region",
          name: region.name ?? REGION_NAMES[this.world.theme]?.[slot] ?? path.basename(region.repo),
          repo: region.repo,
          villages: await reader.villages(),
        }
      }),
    )
  }

  /** Reads one contract's state from its repo now, or undefined when its region, village or contract is gone. */
  async contract(slot: RegionSlot, village: string, id: string): Promise<ContractState | undefined> {
    const villages = await this.readers.get(slot)?.villages()
    return villages?.find((v) => v.slug === village)?.contracts.find((c) => c.id === id)?.state
  }

  /**
   * Reads the world again every second and calls `onChange` whenever it differs from
   * `current`. A read that fails is reported once and the last good world stays.
   */
  follow(current: SlotState[], onChange: (slots: SlotState[]) => void): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let lastError = ""

    const tick = async () => {
      try {
        const next = await this.read()
        lastError = ""
        if (!stopped && !isDeepStrictEqual(next, current)) {
          current = next
          onChange(next)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message !== lastError) console.error(`guslar: could not read the world: ${message}`)
        lastError = message
      }
      if (!stopped) timer = setTimeout(() => void tick(), POLL_MS)
    }
    timer = setTimeout(() => void tick(), POLL_MS)

    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }
}
