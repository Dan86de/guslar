/**
 * How far the fog has pulled off the claimed regions, as arithmetic over elapsed time.
 *
 * The map arrives under fog over every slot, before it knows which of them have repos, and
 * gives the claimed ones up once, on load. That one second says what the map is - a fogged
 * world with your own regions cut out of it - without a word of interface.
 *
 * Nothing here touches the DOM or a canvas, and nothing here knows about the world: the fog
 * asks how far it has pulled back, and lays itself out accordingly.
 */

/**
 * How long the fog takes to leave the claimed regions. Under a second: long enough to read as
 * the world being uncovered, short enough that nobody ever waits on it.
 */
export const REVEAL_MS = 900

/**
 * How often the fog is laid out again while it pulls back, at most. A step recomposes the
 * whole fog canvas and hands it to the card again, so the reveal is capped like the drift is;
 * twenty-five a second is twenty-odd layouts across the window, which is smooth for an edge
 * this soft.
 */
export const REVEAL_STEP_MS = 1000 / 25

/**
 * Where the fog stands: 0 while it still covers every slot, 1 where it stays for the rest of
 * the page's life. Eased so it leaves quickly and settles slowly, which reads as weather
 * lifting rather than as a bar filling.
 */
export function revealProgress(elapsedMs: number): number {
  if (elapsedMs >= REVEAL_MS) return 1
  if (elapsedMs <= 0) return 0
  const part = elapsedMs / REVEAL_MS
  return 1 - (1 - part) ** 3
}
