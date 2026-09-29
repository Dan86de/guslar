/**
 * A colour token of the page's theme, as styles.css sets it on the root, for what paints outside CSS:
 * the map's canvas and the terminal.
 */
export function token(name: "bone" | "rust" | "night"): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`the page has no colour --${name}`)
  return value
}
