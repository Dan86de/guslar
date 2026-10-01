import { describe, expect, it } from "vitest"
import { parse, plain, type Block, type Span } from "../src/client/markdown.js"

const text = (said: string): Span => ({ kind: "text", text: said })

/** Every string in the tree, in the order it was read, so literal text can be read back whole. */
function wordsOf(nodes: (Block | Span)[]): string[] {
  return nodes.flatMap((node) => {
    switch (node.kind) {
      case "text":
      case "code":
        return [node.text]
      case "link":
        return [node.text, node.href]
      case "rule":
        return []
      case "list":
        return node.items.flatMap(wordsOf)
      case "table":
        return [...node.head.flatMap(wordsOf), ...node.rows.flatMap((row) => row.flatMap(wordsOf))]
      default:
        return wordsOf(node.spans)
    }
  })
}

/**
 * The shape of the tree, kind by kind, against the contract the spec sets: a node of a kind that is
 * not listed, or a kind carrying a field that is not its own, is a node that could carry markup.
 */
const FIELDS: Record<string, string[]> = {
  paragraph: ["kind", "spans"],
  heading: ["kind", "spans"],
  list: ["kind", "ordered", "items"],
  code: ["kind", "text"],
  quote: ["kind", "spans"],
  table: ["kind", "head", "rows"],
  rule: ["kind"],
  text: ["kind", "text"],
  strong: ["kind", "spans"],
  emphasis: ["kind", "spans"],
  link: ["kind", "text", "href"],
}

function expectOnlyKnownNodes(nodes: (Block | Span)[]): void {
  for (const node of nodes) {
    expect(Object.keys(FIELDS)).toContain(node.kind)
    expect(Object.keys(node).sort()).toEqual([...(FIELDS[node.kind] ?? [])].sort())
    if ("spans" in node) expectOnlyKnownNodes(node.spans)
    if (node.kind === "list") node.items.forEach((item) => { expectOnlyKnownNodes(item) })
    if (node.kind === "table") {
      node.head.forEach((cell) => { expectOnlyKnownNodes(cell) })
      node.rows.forEach((row) => { row.forEach((cell) => { expectOnlyKnownNodes(cell) }) })
    }
  }
}

describe("reading a hunter's words", () => {
  it("gives each of the seven kinds of block its own node", () => {
    expect(parse("Dyke raised, running the suite now.")).toEqual([
      { kind: "paragraph", spans: [text("Dyke raised, running the suite now.")] },
    ])
    expect(parse("## Plan for S3")).toEqual([{ kind: "heading", spans: [text("Plan for S3")] }])
    expect(parse("- oak\n- pine")).toEqual([
      { kind: "list", ordered: false, items: [[text("oak")], [text("pine")]] },
    ])
    expect(parse("1. oak\n2. pine")).toEqual([
      { kind: "list", ordered: true, items: [[text("oak")], [text("pine")]] },
    ])
    expect(parse("```ts\nconst timber = \"oak\"\n```")).toEqual([
      { kind: "code", text: 'const timber = "oak"' },
    ])
    expect(parse("> the bog is drained")).toEqual([{ kind: "quote", spans: [text("the bog is drained")] }])
    expect(parse("| timber | sawn |\n| --- | --- |\n| oak | 2.4 |")).toEqual([
      {
        kind: "table",
        head: [[text("timber")], [text("sawn")]],
        rows: [[[text("oak")], [text("2.4")]]],
      },
    ])
    expect(parse("---")).toEqual([{ kind: "rule" }])
  })

  it("gives each of the five kinds of span its own node", () => {
    const spansOf = (said: string): Span[] => {
      const [block] = parse(said)
      if (block?.kind !== "paragraph") throw new Error(`not a paragraph: ${JSON.stringify(block)}`)
      return block.spans
    }
    expect(spansOf("plain words")).toEqual([text("plain words")])
    expect(spansOf("**oak**")).toEqual([{ kind: "strong", spans: [text("oak")] }])
    expect(spansOf("*oak*")).toEqual([{ kind: "emphasis", spans: [text("oak")] }])
    expect(spansOf("_oak_")).toEqual([{ kind: "emphasis", spans: [text("oak")] }])
    expect(spansOf("`timber`")).toEqual([{ kind: "code", text: "timber" }])
    expect(spansOf("[the dyke](https://example.invalid/dyke)")).toEqual([
      { kind: "link", text: "the dyke", href: "https://example.invalid/dyke" },
    ])
    expect(spansOf("raised the **oak** dyke at `2.4`m")).toEqual([
      text("raised the "),
      { kind: "strong", spans: [text("oak")] },
      text(" dyke at "),
      { kind: "code", text: "2.4" },
      text("m"),
    ])
  })

  it("sets the marks inside a heading, a list item, a quote and a table cell too", () => {
    expect(parse("# the **oak** dyke")).toEqual([
      { kind: "heading", spans: [text("the "), { kind: "strong", spans: [text("oak")] }, text(" dyke")] },
    ])
    expect(parse("- run `npm run check`")).toEqual([
      { kind: "list", ordered: false, items: [[text("run "), { kind: "code", text: "npm run check" }]] },
    ])
    expect(parse("> *drained*")).toEqual([{ kind: "quote", spans: [{ kind: "emphasis", spans: [text("drained")] }] }])
    expect(parse("| what |\n| --- |\n| `oak` |")).toEqual([
      { kind: "table", head: [[text("what")]], rows: [[[{ kind: "code", text: "oak" }]]] },
    ])
  })

  it("keeps an image, a raw tag and a construct it does not read as the text the hunter wrote", () => {
    const said = [
      "![the dyke](https://example.invalid/dyke.png) stands",
      "",
      "<b>oak</b> and <script>alert(1)</script>",
      "",
      "~~pine~~ and [^1] and <https://example.invalid/>",
    ].join("\n")
    const blocks = parse(said)
    expect(blocks).toEqual([
      { kind: "paragraph", spans: [text("![the dyke](https://example.invalid/dyke.png) stands")] },
      { kind: "paragraph", spans: [text("<b>oak</b> and <script>alert(1)</script>")] },
      { kind: "paragraph", spans: [text("~~pine~~ and [^1] and <https://example.invalid/>")] },
    ])
    expect(wordsOf(blocks).join("\n")).toBe(said.split("\n\n").join("\n"))
  })

  it("returns no node that can carry markup, whatever it is given", () => {
    const said = [
      "# <h1>heading</h1>",
      "",
      "> <em>quoted</em> and ![leaf](leaf.png)",
      "",
      "- <li>item</li> with **bold** and `<code>`",
      "",
      "| <td>cell</td> | *two* |",
      "| --- | --- |",
      "| [a](<b>) | <hr> |",
      "",
      "```html",
      "<script>alert(1)</script>",
      "```",
      "",
      "***",
      "",
      "a paragraph of <span onclick=\"x\">words</span>",
    ].join("\n")
    const blocks = parse(said)
    expectOnlyKnownNodes(blocks)
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "quote",
      "list",
      "table",
      "code",
      "rule",
      "paragraph",
    ])
    // Every tag the hunter wrote is still there, character for character, as text.
    expect(wordsOf(blocks).join(" ")).toContain("<script>alert(1)</script>")
    expect(wordsOf(blocks).join(" ")).toContain('<span onclick="x">words</span>')
  })

  it("leaves text that merely looks like code or a table as the plain words it is", () => {
    expect(parse("the field is called some_var_name here")).toEqual([
      { kind: "paragraph", spans: [text("the field is called some_var_name here")] },
    ])
    expect(parse("stderr | WARN | pipes in a log")).toEqual([
      { kind: "paragraph", spans: [text("stderr | WARN | pipes in a log")] },
    ])
    expect(parse("5 * 3 * 2 is thirty")).toEqual([{ kind: "paragraph", spans: [text("5 * 3 * 2 is thirty")] }])
    expect(parse("an unclosed `backtick and **bold")).toEqual([
      { kind: "paragraph", spans: [text("an unclosed `backtick and **bold")] },
    ])
  })

  it("comes back from an empty string, from eight thousand characters and from an unclosed fence", () => {
    expect(parse("")).toEqual([])
    expect(parse("   \n\n  ")).toEqual([])

    const long = [
      "# ".padEnd(40, "heading "),
      "",
      "| a | b |",
      "| --- | --- |",
      ...Array.from({ length: 200 }, (_unused, row) => `| **oak ${row}** | \`pine ${row}\` |`),
      "",
      "*".repeat(2000),
      "_".repeat(1000),
      "",
      ...Array.from({ length: 200 }, (_unused, item) => `- [item ${item}](https://example.invalid/${item})`),
    ]
      .join("\n")
      .padEnd(8000, " words that run on and on ")
      .slice(0, 8000)
    expect(long).toHaveLength(8000)
    const blocks = parse(long)
    expect(blocks.length).toBeGreaterThan(0)
    expectOnlyKnownNodes(blocks)

    expect(parse("```ts\nconst timber = \"oak\"")).toEqual([{ kind: "code", text: 'const timber = "oak"' }])
    expect(parse("```")).toEqual([{ kind: "code", text: "" }])
  })
})

describe("a hunter's words at a glance", () => {
  it("says the words of every block and span, with the marks and the shape gone", () => {
    expect(plain("## Plan for S1\n\nI will **raise the sill** and run `npm run check`.")).toBe(
      "Plan for S1 I will raise the sill and run npm run check.",
    )
    expect(plain("- Measure the old sill.\n- Cut the oak to length.")).toBe("Measure the old sill. Cut the oak to length.")
    expect(plain("| Step | State |\n| --- | --- |\n| Lay the sill | done |")).toBe("Step State Lay the sill done")
    expect(plain("> The old weir was never measured.\n\n---\n\n```\nweir.sill = \"oak\"\n```")).toBe(
      'The old weir was never measured. weir.sill = "oak"',
    )
    expect(plain("See [the measurements](https://example.invalid/m) for the rest.")).toBe(
      "See the measurements for the rest.",
    )
  })

  it("keeps what it does not read as the words the hunter wrote, and comes back from anything", () => {
    expect(plain("![a weir](weir.png) and <b>a tag</b>")).toBe("![a weir](weir.png) and <b>a tag</b>")
    expect(plain("")).toBe("")
    expect(plain("   \n\n  ")).toBe("")
    expect(plain("```ts\nconst timber = \"oak\"")).toBe('const timber = "oak"')
  })
})
