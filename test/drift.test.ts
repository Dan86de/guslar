import { describe, expect, it } from "vitest"
import { advanceDrift, DRIFT_LAYERS, driftOffsets, type Drift } from "../src/client/drift.js"

const travelled = (offset: Drift): number => Math.hypot(offset.x, offset.y)

describe("the drift clock", () => {
  it("puts each layer where its speed says, and never carries it back", () => {
    // A second of elapsed time is exactly one second of each layer's velocity.
    expect(driftOffsets(1000)).toEqual(DRIFT_LAYERS)
    const [fast, slow] = driftOffsets(2500)
    expect(fast).toEqual({ x: DRIFT_LAYERS[0].x * 2.5, y: DRIFT_LAYERS[0].y * 2.5 })
    expect(slow).toEqual({ x: DRIFT_LAYERS[1].x * 2.5, y: DRIFT_LAYERS[1].y * 2.5 })

    let before = driftOffsets(0)
    for (let elapsedMs = 250; elapsedMs <= 10_000; elapsedMs += 250) {
      const now = driftOffsets(elapsedMs)
      expect(travelled(now[0])).toBeGreaterThan(travelled(before[0]))
      expect(travelled(now[1])).toBeGreaterThan(travelled(before[1]))
      before = now
    }
  })

  it("pulls the two layers apart, so neither is a copy of the other at any moment", () => {
    const apart = (elapsedMs: number): number => {
      const [fast, slow] = driftOffsets(elapsedMs)
      return Math.hypot(fast.x - slow.x, fast.y - slow.y)
    }
    expect(apart(0)).toBe(0)
    for (let elapsedMs = 500; elapsedMs <= 10_000; elapsedMs += 500) {
      expect(apart(elapsedMs)).toBeGreaterThan(apart(elapsedMs - 500))
    }
  })

  it("carries the drift across a pause, so broken time reaches the offset continuous time does", () => {
    // Three bursts of frames, with the tab hidden between them: while it is hidden
    // the ticker reports nothing, so nothing is advanced.
    const bursts = [
      [16, 17, 16, 17],
      [16, 16, 17],
      [250, 250],
    ]
    let elapsedMs = 0
    for (const burst of bursts) {
      for (const deltaMs of burst) elapsedMs = advanceDrift(elapsedMs, deltaMs)
    }

    expect(elapsedMs).toBe(615)
    expect(driftOffsets(elapsedMs)).toEqual(driftOffsets(615))
  })
})
