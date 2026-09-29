import type { RegionSlot } from "./world.js"

/**
 * How a world is drawn. `guslar` is the painted Slavic world, and `vaillant` a heat-pump world in
 * deep winter. The mechanics are the same in every theme; only the skin changes.
 */
export const THEMES = ["guslar", "vaillant"] as const

export type Theme = (typeof THEMES)[number]

/** A world.json that names no theme is drawn as Guslar. */
export const DEFAULT_THEME: Theme = "guslar"

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
}

/**
 * What a browser tab shows for each theme, so two Guslars open side by side can be told apart
 * from the tab alone. The page's heading stays Guslar in every theme.
 */
export const THEME_TABS: Record<Theme, { title: string; icon: { href: string; type: string } }> = {
  guslar: { title: "Guslar", icon: { href: "/favicon.svg", type: "image/svg+xml" } },
  vaillant: { title: "Guslar · Vaillant", icon: { href: "/vaillant/favicon.png", type: "image/png" } },
}

/**
 * The office each slot stands for in a Vaillant world, matched by landscape: the HQ in the wooded
 * Bergisches Land, Silesian pit-heads, two rivers meeting at an old town, the Alps, the polders
 * and classical ruins.
 */
export const OFFICES: Record<RegionSlot, string> = {
  forest: "Remscheid",
  marsh: "Amsterdam",
  mountains: "Dietikon",
  "river-town": "Lyon",
  mines: "Katowice",
  ruins: "Istanbul",
}

/**
 * What a region is called when its world.json entry gives no `name`: in a theme listed here, the
 * place its slot stands for, and otherwise its repo's folder. A given name always wins.
 */
export const REGION_NAMES: Partial<Record<Theme, Record<RegionSlot, string>>> = { vaillant: OFFICES }
