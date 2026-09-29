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
