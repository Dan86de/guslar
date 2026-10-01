/**
 * A hunter's words, read into a tree the journal can set as type.
 *
 * Nothing here touches the DOM, and nothing here makes markup. The tree below is the whole
 * contract: it has no node that can carry HTML, so the journal's only way to put a hunter's text
 * on the page is to build elements from these nodes and set every string as text. A construct
 * this module does not know - an image, a raw tag, a footnote - is neither dropped nor rendered:
 * its characters survive as the plain text the hunter wrote.
 *
 * It reads a restricted markdown, not CommonMark. What it does not read, it leaves alone:
 * backslash escapes (outside a table cell's `\|`), setext headings, nested lists, HTML of any
 * kind, reference links, and anything inside a link's label beyond its characters.
 */

/** A run of a hunter's words, inside a block. */
export type Span =
  | { kind: "text"; text: string }
  | { kind: "strong"; spans: Span[] }
  | { kind: "emphasis"; spans: Span[] }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }

/** One of a hunter's words' blocks. Every heading is one heading: depth reads from a rule. */
export type Block =
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "heading"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: Span[][] }
  | { kind: "code"; text: string }
  | { kind: "quote"; spans: Span[] }
  | { kind: "table"; head: Span[][]; rows: Span[][][] }
  | { kind: "rule" }

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const QUOTE = /^ {0,3}>[ \t]?(.*)$/
const BULLET = /^[ \t]*[-*+][ \t]+(.*)$/
const ORDERED = /^[ \t]*\d{1,9}[.)][ \t]+(.*)$/
const DELIMITERS = /^ {0,3}\|?(?:[ \t]*:?-+:?[ \t]*\|)*[ \t]*:?-+:?[ \t]*\|?[ \t]*$/

/** How deep emphasis may nest before its marks are left as the characters they are. */
const DEPTH = 8

/**
 * A hunter's words as blocks and spans. Never throws, whatever the text: an unterminated fence
 * runs to the end, a half-written construct stays literal, and an empty string is no blocks at all.
 */
export function parse(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let at = 0
  while (at < lines.length) {
    const line = lines[at] ?? ""
    if (line.trim() === "") {
      at += 1
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      at = readFence(lines, at, fence[1] ?? "", blocks)
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" })
      at += 1
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ kind: "heading", spans: spansOf(heading[2] ?? "") })
      at += 1
      continue
    }
    if (QUOTE.test(line)) {
      at = readQuote(lines, at, blocks)
      continue
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      at = readList(lines, at, blocks)
      continue
    }
    at = opensTable(lines, at) ? readTable(lines, at, blocks) : readParagraph(lines, at, blocks)
  }
  return blocks
}

/**
 * A hunter's words as one run of plain text: the words it wrote, in the order it wrote them, with
 * the marks and the shape gone and every run of whitespace a single space. It is what a leaf says
 * at a glance, where there is room for two lines and none for a heading, a table or a fence.
 */
export function plain(text: string): string {
  return blockWords(parse(text)).replace(/\s+/g, " ").trim()
}

/** The words of a run of blocks, each block set off from the next by a space. */
function blockWords(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "code":
          return block.text
        case "list":
          return block.items.map(spanWords).join(" ")
        case "table":
          return [block.head, ...block.rows].map((row) => row.map(spanWords).join(" ")).join(" ")
        case "rule":
          return ""
        default:
          return spanWords(block.spans)
      }
    })
    .join(" ")
}

/** The words of a run of spans, joined as the hunter wrote them, with nothing put between. */
function spanWords(spans: Span[]): string {
  return spans
    .map((span) => (span.kind === "strong" || span.kind === "emphasis" ? spanWords(span.spans) : span.text))
    .join("")
}

/** Whether a line ends the paragraph above it by beginning a block of its own. */
function startsBlock(lines: string[], at: number): boolean {
  const line = lines[at] ?? ""
  if (line.trim() === "") return true
  if (FENCE.test(line) || RULE.test(line) || HEADING.test(line) || QUOTE.test(line)) return true
  return BULLET.test(line) || ORDERED.test(line) || opensTable(lines, at)
}

/** A fenced block, to its closing fence or, when the hunter wrote none, to the end of its words. */
function readFence(lines: string[], at: number, fence: string, blocks: Block[]): number {
  const char = fence[0] ?? "`"
  const closing = (line: string): boolean => {
    const bare = line.trim()
    const indent = line.length - line.trimStart().length
    return indent < 4 && bare.length >= fence.length && bare === char.repeat(bare.length)
  }
  const body: string[] = []
  let line = at + 1
  while (line < lines.length && !closing(lines[line] ?? "")) {
    body.push(lines[line] ?? "")
    line += 1
  }
  blocks.push({ kind: "code", text: body.join("\n") })
  return line < lines.length ? line + 1 : line
}

/** A blockquote: the run of quoted lines, with their marker off and their own line breaks kept. */
function readQuote(lines: string[], at: number, blocks: Block[]): number {
  const quoted: string[] = []
  let line = at
  while (line < lines.length) {
    const marked = QUOTE.exec(lines[line] ?? "")
    if (!marked) break
    quoted.push(marked[1] ?? "")
    line += 1
  }
  blocks.push({ kind: "quote", spans: spansOf(quoted.join("\n").trim()) })
  return line
}

/**
 * A list: the run of marked lines, each one item. A list has no depth, so an indented item stands
 * beside the one above it rather than under it, and a list that changes its marking starts a new
 * block.
 */
function readList(lines: string[], at: number, blocks: Block[]): number {
  const ordered = ORDERED.test(lines[at] ?? "")
  const items: Span[][] = []
  let line = at
  while (line < lines.length) {
    const marked = (ordered ? ORDERED : BULLET).exec(lines[line] ?? "")
    if (!marked) break
    items.push(spansOf(marked[1] ?? ""))
    line += 1
  }
  blocks.push({ kind: "list", ordered, items })
  return line
}

/**
 * Whether a row of cells stands there under a row of dashes with as many cells. Anything else that
 * happens to hold pipes - a log line, a path - is left to the paragraph it was written in.
 */
function opensTable(lines: string[], at: number): boolean {
  const header = lines[at] ?? ""
  const delimiters = lines[at + 1]
  if (!header.includes("|")) return false
  if (delimiters === undefined || !DELIMITERS.test(delimiters)) return false
  return cellsOf(delimiters).length === cellsOf(header).length
}

/** A table: its header row, then every row of cells under it. */
function readTable(lines: string[], at: number, blocks: Block[]): number {
  const head = cellsOf(lines[at] ?? "")
  const rows: Span[][][] = []
  let line = at + 2
  while (line < lines.length && (lines[line] ?? "").includes("|") && !startsBlock(lines, line)) {
    const cells = cellsOf(lines[line] ?? "")
    rows.push(Array.from({ length: head.length }, (_unused, cell) => spansOf(cells[cell] ?? "")))
    line += 1
  }
  blocks.push({ kind: "table", head: head.map((cell) => spansOf(cell)), rows })
  return line
}

/** A row's cells: its outer pipes off, split on the pipes the hunter did not escape. */
function cellsOf(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/\|$/, "")
  return inner.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim())
}

/** A paragraph: the run of lines up to the next blank line or the next block, breaks and all. */
function readParagraph(lines: string[], at: number, blocks: Block[]): number {
  const text: string[] = [lines[at] ?? ""]
  let line = at + 1
  while (line < lines.length && !startsBlock(lines, line)) {
    text.push(lines[line] ?? "")
    line += 1
  }
  blocks.push({ kind: "paragraph", spans: spansOf(text.join("\n").trim()) })
  return line
}

/** The spans of one run of text: its emphasis, its code, its links, and the rest as it was typed. */
function spansOf(text: string, depth = 0): Span[] {
  const spans: Span[] = []
  let plain = ""
  const flush = (): void => {
    if (plain !== "") spans.push({ kind: "text", text: plain })
    plain = ""
  }
  let at = 0
  while (at < text.length) {
    const char = text[at] ?? ""
    if (char === "`") {
      const code = codeAt(text, at)
      if (code) {
        flush()
        spans.push({ kind: "code", text: code.text })
        at = code.end
        continue
      }
    } else if (char === "!" && text[at + 1] === "[") {
      // An image is the one construct left whole and literal on purpose: rendering it would let a
      // hunter's own words make the page fetch something from off the map.
      const image = linkAt(text, at + 1)
      if (image) {
        plain += text.slice(at, image.end)
        at = image.end
        continue
      }
    } else if (char === "[") {
      const link = linkAt(text, at)
      if (link) {
        flush()
        spans.push({ kind: "link", text: link.text, href: link.href })
        at = link.end
        continue
      }
    } else if (char === "*" || char === "_") {
      const wrapped = emphasisAt(text, at, char, depth)
      if (wrapped) {
        flush()
        spans.push(wrapped.span)
        at = wrapped.end
        continue
      }
    }
    plain += char
    at += 1
  }
  flush()
  return spans
}

/** How many of that character stand in a row from there. */
function runAt(text: string, at: number, char: string): number {
  let run = 0
  while (text[at + run] === char) run += 1
  return run
}

/** Inline code, from a run of backticks to the next run of the same length. */
function codeAt(text: string, at: number): { text: string; end: number } | undefined {
  const run = runAt(text, at, "`")
  let close = at + run
  while (close < text.length) {
    if (text[close] === "`") {
      const closing = runAt(text, close, "`")
      if (closing === run) break
      close += closing
      continue
    }
    close += 1
  }
  if (close >= text.length) return undefined
  const body = text.slice(at + run, close).replace(/\n/g, " ")
  // A space on each side is how a backtick is written inside code, and is not part of the code.
  const padded = body.length > 2 && body.startsWith(" ") && body.endsWith(" ") && body.trim() !== ""
  return { text: padded ? body.slice(1, -1) : body, end: close + run }
}

/** A link, from its `[` to the `)` that closes its destination. */
function linkAt(text: string, at: number): { text: string; href: string; end: number } | undefined {
  const label = closerOf(text, at, "[", "]")
  if (label === -1 || text[label + 1] !== "(") return undefined
  const target = closerOf(text, label + 1, "(", ")")
  if (target === -1) return undefined
  // A title after the destination is said to nobody here, since the link cannot be followed.
  const href = text
    .slice(label + 2, target)
    .trim()
    .split(/\s+/)[0]
  return { text: text.slice(at + 1, label), href: href ?? "", end: target + 1 }
}

/** Where the bracket opened at that spot closes, counting the ones nested inside it. */
function closerOf(text: string, at: number, open: string, close: string): number {
  let depth = 0
  for (let scan = at; scan < text.length; scan += 1) {
    if (text[scan] === open) depth += 1
    else if (text[scan] === close) {
      depth -= 1
      if (depth === 0) return scan
    }
  }
  return -1
}

/** Bold, italic, or both, when the marks around them are marks and not the characters of a word. */
function emphasisAt(text: string, at: number, char: string, depth: number): { span: Span; end: number } | undefined {
  if (depth >= DEPTH) return undefined
  const run = runAt(text, at, char)
  for (const marks of run >= 3 ? [3, 2, 1] : run === 2 ? [2, 1] : [1]) {
    if (!opens(text, at, marks, char)) continue
    const close = closingRun(text, at + marks, char, marks)
    if (close === -1 || close === at + marks) continue
    const spans = spansOf(text.slice(at + marks, close), depth + 1)
    if (spans.length === 0) continue
    const span: Span =
      marks === 3
        ? { kind: "strong", spans: [{ kind: "emphasis", spans }] }
        : { kind: marks === 2 ? "strong" : "emphasis", spans }
    return { span, end: close + marks }
  }
  return undefined
}

/** Whether a run of marks opens emphasis: `_` only between words, so an identifier keeps its own. */
function opens(text: string, at: number, marks: number, char: string): boolean {
  const after = text[at + marks]
  if (after === undefined || /\s/.test(after)) return false
  if (char === "*") return true
  const before = text[at - 1]
  return before === undefined || /[\s\p{P}\p{S}]/u.test(before)
}

/** Where a run of marks closes, stepping over the code spans it may not reach into. */
function closingRun(text: string, from: number, char: string, marks: number): number {
  let scan = from
  while (scan < text.length) {
    if (text[scan] === "`") {
      const code = codeAt(text, scan)
      if (code) {
        scan = code.end
        continue
      }
    }
    if (text[scan] === char) {
      const run = runAt(text, scan, char)
      if (run >= marks && closes(text, scan, run, char)) return scan
      scan += run
      continue
    }
    scan += 1
  }
  return -1
}

/** Whether a run of marks closes emphasis: nothing blank before it, and for `_`, a word's end. */
function closes(text: string, at: number, run: number, char: string): boolean {
  const before = text[at - 1]
  if (before === undefined || /\s/.test(before)) return false
  if (char === "*") return true
  const after = text[at + run]
  return after === undefined || /[\s\p{P}\p{S}]/u.test(after)
}
