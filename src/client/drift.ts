/**
 * Where the fog's cloud layers stand, as arithmetic over elapsed time.
 *
 * Nothing here touches the DOM or a canvas: the fog asks this module how far its
 * clouds have drifted, and paints them itself.
 */

/** A cloud layer's velocity, in map pixels per second. */
export type Drift = { readonly x: number; readonly y: number }

/**
 * The two cloud layers, at speeds and headings of their own so their overlap keeps
 * changing instead of sliding as one texture.
 *
 * The faster one covers 6.8 map pixels a second, which is four pixels on screen
 * where the 2752px map is fitted to a 1440x900 window: two in half a second of
 * glancing, twenty in five seconds of watching.
 */
export const DRIFT_LAYERS: readonly [Drift, Drift] = [
  { x: 6.4, y: -2.3 },
  { x: -3.1, y: -1.5 },
]

/**
 * The elapsed time after a ticker frame. Time the ticker did not report never
 * happened, so a pause - a hidden tab, a stopped ticker - leaves the drift where it
 * stopped rather than skipping ahead to wall time when it resumes.
 */
export function advanceDrift(elapsedMs: number, deltaMs: number): number {
  return elapsedMs + deltaMs
}

/** How far each layer has travelled, in map pixels, after that much elapsed time. */
export function driftOffsets(elapsedMs: number): readonly [Drift, Drift] {
  const [fast, slow] = DRIFT_LAYERS
  return [offset(fast, elapsedMs), offset(slow, elapsedMs)]
}

function offset(layer: Drift, elapsedMs: number): Drift {
  const seconds = elapsedMs / 1000
  return { x: layer.x * seconds, y: layer.y * seconds }
}
