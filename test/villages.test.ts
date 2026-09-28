import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { SlotState, Village, WorldState } from "../src/shared/world.js"
import { bogwater, fixtureRegion } from "./fixture-region.js"
import { awaitWorld, receiveWorld, startGuslar, tempDir, type Running } from "./guslar.js"

function worldOf(regions: { slot: string; repo: string; name?: string }[]): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions }))
  return file
}

function region(world: WorldState, slot: string): Extract<SlotState, { kind: "region" }> {
  const found = world.slots.find((s) => s.slot === slot)
  if (found?.kind !== "region") throw new Error(`${slot} is not a region`)
  return found
}

function village(world: WorldState, slot: string, slug: string): Village {
  const found = region(world, slot).villages.find((v) => v.slug === slug)
  if (!found) throw new Error(`no village ${slug} in ${slot}`)
  return found
}

describe("villages and their notice boards", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("broadcasts every spec in a region's .scratch/specs/ as a village of that region", async () => {
    const bog = bogwater()
    const kettle = fixtureRegion()
    kettle.write(".scratch/specs/mend-the-bridge.md", "Mend the bridge, with no heading.\n")
    kettle.write(".scratch/specs/notes.txt", "not a spec\n")
    guslar = await startGuslar([
      "--no-open",
      "--world",
      worldOf([
        { slot: "forest", repo: bog.repo, name: "Bogwater Reach" },
        { slot: "river-town", repo: kettle.repo },
      ]),
    ])

    const world = await receiveWorld(guslar.url)
    expect(region(world, "forest").villages.map((v) => [v.slug, v.title, v.spec])).toEqual([
      ["drain-the-bog", "Drain the bog", ".scratch/specs/drain-the-bog.md"],
      ["ward-the-well", "Ward the well", ".scratch/specs/ward-the-well.md"],
    ])
    expect(region(world, "river-town").villages.map((v) => [v.slug, v.title])).toEqual([
      ["mend-the-bridge", "mend-the-bridge"],
    ])
  })

  it("broadcasts every contract with its title, autonomy and the state its trailers give it", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])

    const world = await receiveWorld(guslar.url)
    const drain = village(world, "forest", "drain-the-bog")
    expect(drain.slices).toBe(".scratch/slices/drain-the-bog.json")
    expect(drain.contracts).toEqual([
      { id: "S1", title: "Dig the first ditch", autonomy: "afk", state: "done" },
      { id: "S2", title: "Raise the dyke", autonomy: "hitl", state: "pending" },
      { id: "S3", title: "Lay the plank road", autonomy: "afk", state: "ready" },
      { id: "S4", title: "Drive out the utopiec", autonomy: "hitl", state: "sealed", sealedBy: ["S2", "S3"] },
      { id: "S5", title: "Build the sluice", autonomy: "afk", state: "sealed", sealedBy: ["S2"] },
    ])

    const well = village(world, "forest", "ward-the-well")
    expect(well.slices).toBeUndefined()
    expect(well.contracts).toEqual([])
  })

  it("follows new trailers on slices/<slug> and broadcasts the states they give", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)

    const changed = awaitWorld(guslar.url, (world) =>
      village(world, "forest", "drain-the-bog").contracts.some((c) => c.id === "S2" && c.state === "done"),
    )
    bog.commit("Sign off S2: Raise the dyke", "Slice: S2")
    const world = await changed

    expect(village(world, "forest", "drain-the-bog").contracts.map((c) => [c.id, c.state, c.sealedBy])).toEqual([
      ["S1", "done", undefined],
      ["S2", "done", undefined],
      ["S3", "ready", undefined],
      ["S4", "sealed", ["S3"]],
      ["S5", "ready", undefined],
    ])
  })

  it("reads trailers only from slices/<slug>, and only from the commit the slices were cut against", async () => {
    const bog = bogwater()
    // A trailer on main, or on another spec's branch, says nothing about this board.
    bog.git("switch", "--quiet", "main")
    bog.commit("Unrelated work", "Slice: S3")
    bog.git("switch", "--quiet", "--create", "slices/ward-the-well")
    bog.commit("Another board", "Slice: S4")
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])

    const world = await receiveWorld(guslar.url)
    expect(village(world, "forest", "drain-the-bog").contracts.map((c) => c.state)).toEqual([
      "done",
      "pending",
      "ready",
      "sealed",
      "sealed",
    ])
  })

  it("names a slices file it cannot read instead of posting contracts from it", async () => {
    const bog = bogwater()
    bog.write(".scratch/slices/drain-the-bog.json", '{"slices": [{"id": "S1", "title": "x", "autonomy": "sometimes"}]}')
    bog.write(".scratch/slices/ward-the-well.json", "{ not json")
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])

    const world = await receiveWorld(guslar.url)
    const drain = village(world, "forest", "drain-the-bog")
    expect(drain.contracts).toEqual([])
    expect(drain.problem).toBe(".scratch/slices/drain-the-bog.json: slices[0].autonomy must be afk or hitl")
    expect(village(world, "forest", "ward-the-well").problem).toMatch(/^\.scratch\/slices\/ward-the-well\.json: /)
  })

  it("leaves the region's repo as it found it", async () => {
    const bog = bogwater()
    const before = bog.git("status", "--porcelain", "--ignored")
    guslar = await startGuslar(["--no-open", "--world", worldOf([{ slot: "forest", repo: bog.repo }])])
    await receiveWorld(guslar.url)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(bog.git("status", "--porcelain", "--ignored")).toBe(before)
  })
})
