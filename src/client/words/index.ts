import { createContext, useContext } from "react"
import type { Theme } from "../../shared/theme.js"
import type { Refusal } from "../../shared/world.js"
import { guslar } from "./guslar.js"
import { vaillant } from "./vaillant.js"

export type { Refusals } from "./guslar.js"

/** Every word the map says, as one theme says them. */
export type Words = typeof guslar

/** Each theme's words; every theme says every one of Guslar's. */
export const WORDS: Record<Theme, Words> = { guslar, vaillant }

const WordsContext = createContext<Words>(guslar)

/** Gives everything under it the words of the world's theme. */
export const WordsProvider = WordsContext.Provider

/** Where the map's words come from: every component reads them through here, and nowhere else. */
export function useWords(): Words {
  return useContext(WordsContext)
}

/** A refusal in the theme's words: the wording its reason code has, given its facts. */
export function sayRefusal(words: Words, refusal: Refusal): string {
  const say = words.refusals[refusal.reason] as (refusal: Refusal) => string
  return say(refusal)
}
