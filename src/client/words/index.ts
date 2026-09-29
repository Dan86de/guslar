import { createContext, useContext } from "react"
import { guslar } from "./guslar.js"

/** Every word the map says, as one theme says them. */
export type Words = typeof guslar

const WordsContext = createContext<Words>(guslar)

/** Where the map's words come from: every component reads them through here, and nowhere else. */
export function useWords(): Words {
  return useContext(WordsContext)
}
