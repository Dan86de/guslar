import type { Theme } from "../shared/theme.js"
import type { RegionSlot } from "../shared/world.js"

/** Guslar's names, handed out in every region. Original, from Slavic naming, none from the Witcher. */
const SLAVIC = [
  "Wojmir",
  "Bogna",
  "Dobromir",
  "Jaromila",
  "Radzim",
  "Wiesława",
  "Sulimir",
  "Dobrawa",
  "Ratibor",
  "Zlata",
  "Mściwoj",
  "Bolesta",
] as const

/**
 * A Vaillant technician is named from its office's city: popular first names there, one list per
 * slot as the office stands for it, none shared between two offices.
 */
const OFFICE_NAMES: Record<RegionSlot, readonly string[]> = {
  // Remscheid
  forest: ["Lukas", "Hannah", "Felix", "Lina", "Jonas", "Marie", "Paul", "Clara", "Finn", "Greta", "Ben", "Frieda"],
  // Amsterdam
  marsh: ["Daan", "Julia", "Sem", "Tess", "Bram", "Fenna", "Luuk", "Saar", "Milan", "Noor", "Thijs", "Sanne"],
  // Dietikon
  mountains: ["Noah", "Mia", "Luca", "Emma", "Matteo", "Lia", "Elias", "Sofia", "Levin", "Mila", "Nino", "Alina"],
  // Lyon
  "river-town": ["Gabriel", "Louise", "Léo", "Jade", "Raphaël", "Ambre", "Arthur", "Chloé", "Louis", "Alice", "Jules", "Rose"],
  // Katowice
  mines: ["Antoni", "Zuzanna", "Jakub", "Zofia", "Szymon", "Maja", "Filip", "Lena", "Kacper", "Oliwia", "Wojciech", "Pola"],
  // Istanbul
  ruins: ["Yusuf", "Zeynep", "Eymen", "Elif", "Mustafa", "Defne", "Ömer", "Asel", "Emir", "Azra", "Kerem", "Ela"],
}

/**
 * The names a hunter sent to a slot is given from, in the order they are handed out: the first one
 * no hunter on the map is using. A name is who a session is, not a word the map says, so the
 * server hands it out in the world's theme and keeps it in the roll as it was given.
 */
export function namesFor(theme: Theme, slot: RegionSlot): readonly string[] {
  return theme === "vaillant" ? OFFICE_NAMES[slot] : SLAVIC
}
