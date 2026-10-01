import { useMemo, type ReactNode } from "react"
import { parse, type Block, type Span } from "./markdown.js"

/**
 * A run of spans as elements. Every string goes in as a child, never as a property that could be
 * markup, so the only thing a hunter's words can become here is text.
 */
function setSpans(spans: Span[]): ReactNode {
  return spans.map((span, index) => {
    switch (span.kind) {
      case "text":
        return span.text
      case "strong":
        return (
          <strong key={index} className="said-strong">
            {setSpans(span.spans)}
          </strong>
        )
      case "emphasis":
        return <em key={index}>{setSpans(span.spans)}</em>
      case "code":
        return (
          <code key={index} className="said-code">
            {span.text}
          </code>
        )
      case "link":
        // Shown and inert: a session reading a repo can write any URL into its own journal, so the
        // destination is told to whoever points at it and offered to nobody.
        return (
          <span key={index} className="said-link" title={span.href === "" ? undefined : span.href}>
            {span.text}
          </span>
        )
    }
  })
}

/** One block as its element. Every heading takes one form: depth reads from the rule under it. */
function setBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p key={key} className="said-paragraph">
          {setSpans(block.spans)}
        </p>
      )
    case "heading":
      return (
        <h3 key={key} className="said-heading">
          {setSpans(block.spans)}
        </h3>
      )
    case "list": {
      const items = block.items.map((item, index) => <li key={index}>{setSpans(item)}</li>)
      return block.ordered ? (
        <ol key={key} className="said-list">
          {items}
        </ol>
      ) : (
        <ul key={key} className="said-list">
          {items}
        </ul>
      )
    }
    case "code":
      return (
        <pre key={key} className="said-fence">
          <code>{block.text}</code>
        </pre>
      )
    case "quote":
      return (
        <blockquote key={key} className="said-quote">
          {setSpans(block.spans)}
        </blockquote>
      )
    case "table":
      return (
        <table key={key} className="said-table">
          <thead>
            <tr>
              {block.head.map((cell, index) => (
                <th key={index} scope="col">
                  {setSpans(cell)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (
                  <td key={column}>{setSpans(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "rule":
      return <hr key={key} className="said-rule" />
  }
}

/**
 * A hunter's words, set as type in the journal's own hand. The text is read into the tree
 * `markdown.ts` defines and built into elements from it, so a construct that tree has no node for
 * stays the plain text the hunter wrote.
 *
 * The parse is memoised on the text, since a journal re-renders on every world update and a
 * hunter's words never change once they have arrived.
 */
export function Said({ text }: { text: string }) {
  const blocks = useMemo(() => parse(text), [text])
  return <div className="said">{blocks.map((block, index) => setBlock(block, index))}</div>
}
