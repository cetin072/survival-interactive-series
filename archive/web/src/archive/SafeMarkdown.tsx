import { Fragment } from 'react'

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((piece, index) => piece.startsWith('**') && piece.endsWith('**') ? <strong key={index}>{piece.slice(2, -2)}</strong> : <Fragment key={index}>{piece}</Fragment>)
}

/** A small, deterministic and HTML-free Markdown presentation layer. */
export function SafeMarkdown({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, '\n').split('\n'); const nodes: React.ReactNode[] = []; let paragraph: string[] = []
  const flush = () => { if (paragraph.length) { nodes.push(<p key={'p' + nodes.length}>{inline(paragraph.join('\n'))}</p>); paragraph = [] } }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const heading = line.match(/^(#{1,3})\s+(.+)$/); const quote = line.match(/^>\s?(.*)$/); const unordered = line.match(/^-\s+(.+)$/); const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (!line.trim()) { flush(); continue }
    if (/^---+$/.test(line.trim())) { flush(); nodes.push(<hr key={'hr' + nodes.length} className="scene-divider" />); continue }
    if (heading) { flush(); const Tag = (`h${heading[1].length}` as 'h1' | 'h2' | 'h3'); nodes.push(<Tag key={'h' + nodes.length}>{inline(heading[2])}</Tag>); continue }
    if (quote) { flush(); nodes.push(<blockquote key={'q' + nodes.length}>{inline(quote[1])}</blockquote>); continue }
    if (unordered || ordered) { flush(); const isOrdered = Boolean(ordered); const values: string[] = []; for (; i < lines.length; i++) { const current = isOrdered ? lines[i].match(/^\d+[.)]\s+(.+)$/) : lines[i].match(/^-\s+(.+)$/); if (!current) { i--; break }; values.push(current[1]) } const List = isOrdered ? 'ol' : 'ul'; nodes.push(<List key={'l' + nodes.length}>{values.map((value, index) => <li key={index}>{inline(value)}</li>)}</List>); continue }
    paragraph.push(line)
  }
  flush(); return <>{nodes}</>
}
