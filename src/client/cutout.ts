/** A part of an image, in its pixels. */
type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Lifts painted props off their flat parchment background: the background colour is read
 * from each image's border, and everything of that colour reachable from the border turns
 * transparent, fading over a band of near colours so the ink edge stays soft. Parchment
 * inside a prop, like a notice nailed to a post, is enclosed and stays.
 *
 * The images are paintings of one prop from the same camera, like a village at each of its
 * stages, so they are all cropped to one box around what is left of any of them: one drawn
 * in place of another stands exactly where it did.
 */
export function cutOutAll(images: HTMLImageElement[], near = 22, far = 70): HTMLCanvasElement[] {
  const lifted = images.map((image) => lift(image, near, far))
  const boxes = lifted.flatMap(({ box }) => (box ? [box] : []))
  const union =
    boxes.length === 0
      ? undefined
      : {
          left: Math.min(...boxes.map((b) => b.left)),
          top: Math.min(...boxes.map((b) => b.top)),
          right: Math.max(...boxes.map((b) => b.right)),
          bottom: Math.max(...boxes.map((b) => b.bottom)),
        }
  return lifted.map(({ canvas }) => crop(canvas, union))
}

function crop(source: HTMLCanvasElement, box: Box | undefined): HTMLCanvasElement {
  if (!box) return source
  const cropped = document.createElement("canvas")
  cropped.width = box.right - box.left + 1
  cropped.height = box.bottom - box.top + 1
  cropped.getContext("2d")?.drawImage(source, -box.left, -box.top)
  return cropped
}

/** The image with its background taken out, and the box of what still shows, if anything does. */
function lift(image: HTMLImageElement, near: number, far: number): { canvas: HTMLCanvasElement; box?: Box } {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const source = document.createElement("canvas")
  source.width = width
  source.height = height
  const ctx = source.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("no 2d canvas")
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, width, height)
  const data = pixels.data

  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1)
  const background = [0, 1, 2].map((channel) => median(border.map((i) => data[i * 4 + channel] ?? 0)))

  const distance = (i: number) =>
    Math.hypot(
      (data[i * 4] ?? 0) - (background[0] ?? 0),
      (data[i * 4 + 1] ?? 0) - (background[1] ?? 0),
      (data[i * 4 + 2] ?? 0) - (background[2] ?? 0),
    )

  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  for (const i of border) {
    if (!seen[i] && distance(i) < far) {
      seen[i] = 1
      queue[tail++] = i
    }
  }
  while (head < tail) {
    const i = queue[head++] ?? 0
    const d = distance(i)
    const alpha = Math.max(0, d - near) / (far - near)
    // An edge pixel is part ink, part parchment: take the parchment out of its colour too,
    // or the prop keeps a pale rim wherever it stands.
    for (let channel = 0; channel < 3; channel++) {
      const bg = background[channel] ?? 0
      const value = data[i * 4 + channel] ?? 0
      data[i * 4 + channel] = alpha > 0 ? Math.min(255, Math.max(0, (value - (1 - alpha) * bg) / alpha)) : value
    }
    data[i * 4 + 3] = Math.round((data[i * 4 + 3] ?? 255) * alpha)
    const x = i % width
    const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]
    for (const n of neighbours) {
      if (n < 0 || n >= width * height || seen[n]) continue
      if (distance(n) < far) {
        seen[n] = 1
        queue[tail++] = n
      }
    }
  }
  ctx.putImageData(pixels, 0, 0)

  // The box of the pixels that still show.
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < 8) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left) return { canvas: source }
  return { canvas: source, box: { left, top, right, bottom } }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
