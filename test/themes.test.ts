import { describe, expect, it } from "vitest"
import { guslar } from "../src/client/words/guslar.js"
import { vaillant } from "../src/client/words/vaillant.js"
import { THEMES } from "../src/shared/theme.js"
import { HUNTER_STATES, REFUSAL_REASONS, RITES } from "../src/shared/world.js"

const WORDS = { guslar, vaillant }

/** A theme's words as their keys alone: each leaf a string or a function, each table its keys. */
function shape(words: unknown): unknown {
  if (typeof words === "string" || typeof words === "function") return typeof words
  return Object.fromEntries(Object.entries(words as object).map(([key, value]) => [key, shape(value)]))
}

/** Every string a theme's words hold, and every phrase its functions make of what they are given. */
function said(words: unknown, given: unknown[][]): string[] {
  if (typeof words === "string") return [words]
  if (typeof words === "function") return given.map((args) => String((words as (...args: unknown[]) => unknown)(...args)))
  return Object.values(words as object).flatMap((value) => said(value, given))
}

/**
 * What a phrase is given, in every rite and every state: one value that is at once the facts of a
 * refusal, a hunter, a name and a list of ids, since each function reads only what it needs of it.
 */
const GIVEN = [undefined, ...RITES].flatMap((rite) =>
  HUNTER_STATES.flatMap((state) => {
    // A refusal's state is a contract's, a hunter's is its own.
    const facts = (state: string) =>
      Object.assign(["S1", "S2"], {
        slot: "forest",
        region: "Lyon",
        village: "Fit the unit",
        contract: "S3",
        place: "Lyon",
        holder: { name: "Wojmir", rite, contract: "S3" },
        program: "claude",
        problem: "it would not start",
        hunter: "Wojmir",
        name: "Wojmir",
        rite,
        state,
      })
    return [
      [facts(rite === undefined ? "sealed" : "pending"), "Wojmir", true],
      [facts(state), "Wojmir", false],
    ]
  }),
)

describe("themes", () => {
  it("has a table of words for every theme", () => {
    expect(Object.keys(WORDS).sort()).toEqual([...THEMES].sort())
  })

  it("has every one of Guslar's words in every theme, and no word Guslar lacks", () => {
    for (const words of Object.values(WORDS)) expect(shape(words)).toEqual(shape(guslar))
  })

  it("words every reason code a refusal can carry, in every theme", () => {
    for (const words of Object.values(WORDS)) {
      expect(Object.keys(words.refusals).sort()).toEqual([...REFUSAL_REASONS].sort())
    }
  })

  it("says none of Guslar's fiction in a Vaillant world", () => {
    const phrases = said(vaillant, GIVEN)
    expect(phrases.length).toBeGreaterThan(100)
    for (const phrase of phrases) expect(phrase).not.toMatch(/\b(hunters?|villages?|contracts?|rites?|bount(y|ies)|aldermen|alderman|fog|trophy)\b/i)
  })
})
