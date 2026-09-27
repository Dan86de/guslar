import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { Village, WorldState } from "../src/shared/world.js"
import { bogwater } from "./fixture-region.js"
import { awaitWorld, receiveWorld, startGuslar, tempDir, type Running } from "./guslar.js"

function worldWith(repo: string): string {
  const file = path.join(tempDir(), "world.json")
  writeFileSync(file, JSON.stringify({ regions: [{ slot: "forest", repo }] }))
  return file
}

function village(world: WorldState, slug: string): Village {
  const forest = world.slots.find((s) => s.slot === "forest")
  const found = forest?.kind === "region" ? forest.villages.find((v) => v.slug === slug) : undefined
  if (!found) throw new Error(`no village ${slug} in forest`)
  return found
}

describe("village stages", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("broadcasts a spec with no slices file as bounty drafted, and one with an undone contract as contracts posted", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldWith(bog.repo)])

    const world = await receiveWorld(guslar.url)
    expect(village(world, "ward-the-well").stage).toBe("bounty-drafted")
    expect(village(world, "drain-the-bog").stage).toBe("contracts-posted")
  })

  it("broadcasts a village as cleared once every contract carries a Slice: trailer", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldWith(bog.repo)])
    await receiveWorld(guslar.url)

    // Four of five done, the last one pending: not cleared yet.
    bog.commit("Raise the dyke", "Slice: S2")
    bog.commit("Lay the plank road", "Slice: S3")
    bog.commit("Build the sluice", "Slice: S5")
    bog.commit("Drive out the utopiec", "Slice-Pending: S4")
    const nearly = await awaitWorld(guslar.url, (world) =>
      village(world, "drain-the-bog").contracts.every((c) => c.state === "done" || c.id === "S4"),
    )
    expect(village(nearly, "drain-the-bog").stage).toBe("contracts-posted")

    const cleared = awaitWorld(guslar.url, (world) => village(world, "drain-the-bog").stage === "cleared")
    bog.commit("Sign off S4: Drive out the utopiec", "Slice: S4")
    const world = await cleared
    expect(village(world, "drain-the-bog").contracts.every((c) => c.state === "done")).toBe(true)
    expect(village(world, "ward-the-well").stage).toBe("bounty-drafted")
  })

  it("moves a village from bounty drafted to contracts posted when its slices file lands", async () => {
    const bog = bogwater()
    guslar = await startGuslar(["--no-open", "--world", worldWith(bog.repo)])
    await receiveWorld(guslar.url)

    const posted = awaitWorld(guslar.url, (world) => village(world, "ward-the-well").stage === "contracts-posted")
    bog.write(
      ".scratch/slices/ward-the-well.json",
      JSON.stringify({ slices: [{ id: "S1", title: "Draw the water", autonomy: "afk", blocked_by: [] }] }),
    )
    const world = await posted
    expect(village(world, "ward-the-well").contracts.map((c) => [c.id, c.state])).toEqual([["S1", "ready"]])
  })

  it("keeps a posted board that is empty or cannot be read as contracts posted, never cleared", async () => {
    const bog = bogwater()
    bog.write(".scratch/slices/drain-the-bog.json", "{ not json")
    bog.write(".scratch/slices/ward-the-well.json", JSON.stringify({ slices: [] }))
    guslar = await startGuslar(["--no-open", "--world", worldWith(bog.repo)])

    const world = await receiveWorld(guslar.url)
    expect(village(world, "drain-the-bog").stage).toBe("contracts-posted")
    expect(village(world, "drain-the-bog").problem).toBeDefined()
    expect(village(world, "ward-the-well").stage).toBe("contracts-posted")
  })
})
