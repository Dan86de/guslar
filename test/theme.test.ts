import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { failGuslar, fixtures, receiveWorld, startGuslar, tempDir, type Running } from "./guslar.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const worldFile = path.join(fixtures, "world", "world.json")
const vaillantFile = path.join(fixtures, "world", "vaillant.json")

/** A GET of one of this Guslar's paths: its status, content type and body. */
async function get(guslar: Running, pathname: string): Promise<{ status: number; type: string; body: Buffer }> {
  const res = await fetch(new URL(pathname, guslar.url))
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: Buffer.from(await res.arrayBuffer()) }
}

describe("choosing a world's theme", () => {
  let guslar: Running | undefined
  afterEach(async () => {
    await guslar?.stop()
    guslar = undefined
  })

  it("opens a world with no theme, or with the guslar theme, exactly as Guslar", async () => {
    const guslarFile = path.join(tempDir(), "world.json")
    const world = JSON.parse(readFileSync(worldFile, "utf8")) as Record<string, unknown>
    writeFileSync(guslarFile, JSON.stringify({ theme: "guslar", ...world }))
    const built = readFileSync(path.join(root, "dist", "client", "index.html"))

    for (const file of [worldFile, guslarFile]) {
      guslar = await startGuslar(["--no-open", "--world", file])
      const page = await get(guslar, "/")
      expect(page.status).toBe(200)
      expect(page.body.equals(built)).toBe(true)
      expect(page.body.toString()).toContain("<title>Guslar</title>")
      expect(page.body.toString()).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')

      const icon = await get(guslar, "/favicon.svg")
      expect(icon.status).toBe(200)
      expect(icon.type).toContain("image/svg+xml")
      expect(icon.body.equals(readFileSync(path.join(root, "public", "favicon.svg")))).toBe(true)

      expect((await receiveWorld(guslar.url)).theme).toBe("guslar")
      await guslar.stop()
      guslar = undefined
    }
  })

  it("opens a vaillant world under its own title and the Vaillant logo head, and broadcasts its theme", async () => {
    guslar = await startGuslar(["--no-open", "--world", vaillantFile])

    for (const pathname of ["/", "/index.html", "/somewhere/else"]) {
      const page = await get(guslar, pathname)
      expect(page.status).toBe(200)
      expect(page.type).toContain("text/html")
      const html = page.body.toString()
      expect(html).toContain("<title>Guslar · Vaillant</title>")
      expect(html).toContain('<link rel="icon" type="image/png" href="/vaillant/favicon.png" />')
      expect(html).not.toContain("/favicon.svg")
    }

    const icon = await get(guslar, "/vaillant/favicon.png")
    expect(icon.status).toBe(200)
    expect(icon.type).toContain("image/png")
    expect(icon.body.equals(readFileSync(path.join(root, "public", "vaillant", "favicon.png")))).toBe(true)

    const world = await receiveWorld(guslar.url)
    expect(world.theme).toBe("vaillant")
    expect(world.slots.map((slot) => [slot.slot, slot.kind])).toEqual([
      ["forest", "region"],
      ["marsh", "fog"],
      ["mountains", "fog"],
      ["river-town", "region"],
      ["mines", "fog"],
      ["ruins", "fog"],
    ])

    const api = (await (await fetch(new URL("/api/world", guslar.url))).json()) as { theme: string }
    expect(api.theme).toBe("vaillant")
  })

  it("names a vaillant region without a name after its office, and keeps a given name", async () => {
    guslar = await startGuslar(["--no-open", "--world", vaillantFile])
    const world = await receiveWorld(guslar.url)
    expect(world.slots.flatMap((slot) => (slot.kind === "region" ? [[slot.slot, slot.name]] : []))).toEqual([
      ["forest", "Bogwater Reach"],
      ["river-town", "Lyon"],
    ])
  })

  it("names a guslar region without a name after its folder", async () => {
    guslar = await startGuslar(["--no-open", "--world", worldFile])
    const world = await receiveWorld(guslar.url)
    const unnamed = world.slots.find((slot) => slot.slot === "river-town")
    expect(unnamed?.kind === "region" && unnamed.name).toBe("kettle")
  })

  it("refuses a theme there is not, naming the file, the field and the themes there are", async () => {
    const file = path.join(tempDir(), "nonsense.json")
    writeFileSync(file, JSON.stringify({ theme: "nonsense", regions: [] }))
    const refused = await failGuslar(["--world", file])
    expect(refused.code).toBe(1)
    expect(refused.output.trim()).toBe(`guslar: ${file}: theme must be one of guslar, vaillant`)
  })
})
