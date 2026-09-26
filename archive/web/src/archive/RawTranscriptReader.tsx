import { useEffect, useMemo } from 'react'
import { archiveMeta, archiveNodes } from './archiveData'
import { seasonSummaries } from './storyData'
import { getChronicle, transcriptPartsFor, type ChronicleId, type TranscriptPart } from './transcriptData'
import { rawProgressKey, selectReaderItem } from './readerNavigation'
import { useReaderPosition } from './useReaderPosition'
// @ts-expect-error Shared pure Markdown parser has no TypeScript declaration.
import { splitRoleBlocks } from '../../../scripts/lib/reader-transform.mjs'

const archiveNodeById = new Map(archiveNodes.map((node) => [node.id, node]))
type RawMessage = { role: 'player' | 'gm' | 'system_public'; label: string; content: string }

function InlineMarkdown({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return part
  })}</>
}

export function messagesFromRaw(content: string): RawMessage[] {
  // The same parser already used by Reader publication supports numbered,
  // suffixed and bare historical headers. No source text is rewritten.
  const blocks = splitRoleBlocks(content) as Array<{ header: { role: string }; body: string }>
  return blocks.map(({ header, body }) => ({
    role: header.role === 'USER' ? 'player' : header.role === 'GM' ? 'gm' : 'system_public',
    label: header.role === 'USER' ? '플레이어의 선택' : header.role === 'GM' ? 'GM 공개 장면' : '공개 운영 기록',
    content: body,
  }))
}

export function selectInitialTranscriptPart(parts: TranscriptPart[], routedPartId?: string, savedPartId?: string) {
  return selectReaderItem(parts, routedPartId, savedPartId)
}

function MessageBody({ content }: { content: string }) {
  const blocks: Array<{ kind: 'heading' | 'text'; value: string }> = []
  let lines: string[] = []
  const flush = () => { const value = lines.join('\n').trim(); if (value) blocks.push({ kind: 'text', value }); lines = [] }
  for (const line of content.split('\n')) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading) { flush(); blocks.push({ kind: 'heading', value: heading[1] }); continue }
    if (line.trim() === '---') { flush(); continue }
    if (!line.trim()) { flush(); continue }
    lines.push(line)
  }
  flush()
  return <div className="transcript-message-body">{blocks.map((block, index) => {
    if (block.kind === 'heading') return <h3 key={index}><InlineMarkdown text={block.value} /></h3>
    if (block.value.startsWith('> ')) return <blockquote key={index}><InlineMarkdown text={block.value.replace(/^>\s?/gm, '')} /></blockquote>
    if (/^(?:[-*]|\d+\.)\s/m.test(block.value)) return <div key={index} className="transcript-list"><InlineMarkdown text={block.value} /></div>
    return <p key={index}><InlineMarkdown text={block.value} /></p>
  })}</div>
}

function TranscriptBody({ part }: { part: TranscriptPart }) {
  const messages = useMemo(() => messagesFromRaw(part.content ?? ''), [part.content])
  if (part.status === 'missing_transcript') return <section className="missing-transcript" aria-label="원문 미확보 구간"><p className="reader-status">MISSING TRANSCRIPT</p><h2>이 구간의 공개 원문은 아직 아카이브에 백필되지 않았습니다.</h2><p>정본 요약·체크포인트·운영 기록을 실제 USER/GM 대화로 재구성하지 않습니다.</p><p className="reader-source">기록 위치: {part.source}</p></section>
  if (part.status === 'verified_fragment') return <section className="transcript-fragment" aria-label="검증된 원문 조각"><p className="reader-status">VERIFIED FRAGMENT · 현재 확인된 원문 일부</p><p>이 출처에서 문자 그대로 확인된 공개 기록만 보입니다. 누락된 GM 장면과 구간은 채우지 않았습니다.</p><pre>{part.content}</pre></section>
  if (!messages.length) return <section className="transcript-fragment" aria-label="원문 그대로 보기"><p>대화 구분을 인식하지 못해 보존된 원문을 그대로 표시합니다.</p><pre>{part.content}</pre></section>
  return <div className="transcript-flow">{messages.map((message, index) => <section key={index} className={'transcript-message transcript-' + message.role}><p className="transcript-role">{message.label}</p><MessageBody content={message.content} /></section>)}</div>
}

export function RawTranscriptReader({ chronicleId, initialPartId, onPartChange, onOpenNode, onOpenExplorer }: { chronicleId: ChronicleId; initialPartId?: string; onPartChange: (partId: string) => void; onOpenNode: (id: string) => void; onOpenExplorer: () => void }) {
  const chronicle = getChronicle(chronicleId)
  const chronicleParts = useMemo(() => transcriptPartsFor(chronicleId), [chronicleId])
  const selected = selectInitialTranscriptPart(chronicleParts, initialPartId)
  const seasonId = selected?.seasonId ?? 'S01'
  const parts = chronicleParts.filter((part) => part.seasonId === seasonId)
  const seasonIds = Array.from(new Set(chronicleParts.map((part) => part.seasonId)))
  const globalIndex = selected ? chronicleParts.findIndex((part) => part.id === selected.id) : -1
  const previous = globalIndex > 0 ? chronicleParts[globalIndex - 1] : null
  const next = globalIndex >= 0 && globalIndex < chronicleParts.length - 1 ? chronicleParts[globalIndex + 1] : null
  const { articleRef, progress, scrollToStart } = useReaderPosition(selected?.id)

  useEffect(() => {
    if (!selected) return
    try { window.localStorage.setItem(rawProgressKey(chronicleId), JSON.stringify({ partId: selected.id })) } catch { /* optional bookmark */ }
  }, [chronicleId, selected?.id])

  function openPart(part: TranscriptPart) {
    if (part.id === selected?.id) scrollToStart()
    else onPartChange(part.id)
  }
  if (!selected) return <section className="reader-page"><p role="status">아직 공개된 원문이 없습니다.</p><button onClick={onOpenExplorer}>세계 탐색으로 돌아가기</button></section>

  const showCanonicalSummary = chronicle.worldlineId === archiveMeta.worldline
  return <section className="reader-page">
    <aside className="reader-toc">
      <p className="archive-eyebrow">{chronicle.label}</p><h2>{chronicle.active ? '현재 생존기' : '지난 생존기'} 원문</h2><p>{chronicle.availabilityNote}</p>
      <button className="reader-home" onClick={() => openPart(chronicleParts[0])}>처음부터 읽기</button>
      <button className="reader-explorer-link" onClick={onOpenExplorer}>세계 탐색으로 돌아가기</button>
      <div className="reader-season-tabs" role="tablist" aria-label="시즌 선택">{seasonIds.map((id) => <button key={id} role="tab" aria-selected={seasonId === id} className={seasonId === id ? 'active' : ''} onClick={() => openPart(chronicleParts.find((part) => part.seasonId === id) ?? chronicleParts[0])}>{id}</button>)}</div>
      <nav className="reader-part-list" aria-label="원문 목차">{parts.map((part) => <button key={part.id} className={selected.id === part.id ? 'selected' : ''} aria-current={selected.id === part.id ? 'page' : undefined} data-part-id={part.id} onClick={() => openPart(part)}><span>{part.status === 'verified_transcript' ? '원문' : part.status === 'verified_fragment' ? '일부' : '미확보'}</span><strong>{part.sessionId ? part.sessionId + ' · ' : ''}{part.number ? `PART ${String(part.number).padStart(3, '0')}` : 'GAP'}</strong><small>{part.title}</small></button>)}</nav>
    </aside>
    <article className="transcript-reader" ref={articleRef} data-part-id={selected.id}>
      <header className="reader-header"><div><p className="archive-eyebrow">{selected.seasonId} · {chronicle.label} · {selected.status === 'verified_transcript' ? 'VERIFIED TRANSCRIPT' : selected.status === 'verified_fragment' ? 'VERIFIED FRAGMENT' : 'MISSING TRANSCRIPT'}</p><h1>{selected.title}</h1><p>{selected.range}</p></div><div className="reader-progress" aria-label={'읽기 진행률 ' + progress + '%'}><strong>{progress}%</strong><span><i style={{ width: progress + '%' }} /></span></div></header>
      <aside className="reader-integrity-note"><strong>{selected.status === 'verified_transcript' ? '검증 원문' : selected.status === 'verified_fragment' ? '검증된 원문 일부' : '원문 미확보'}</strong><p>{selected.status === 'verified_transcript' ? '실제 USER/GM 공개 메시지의 순서와 내용을 보존합니다. 표시 형식만 읽기 쉽게 바꿉니다.' : selected.status === 'verified_fragment' ? '실제 공개 텍스트가 확인된 일부만 보존합니다. 빠진 USER/GM 원문은 보완하지 않습니다.' : '이 빈 구간은 정본 요약이나 이벤트 기록으로 대사를 만들지 않습니다.'}</p><small>Source · {selected.source}</small></aside>
      <TranscriptBody part={selected} />
      {showCanonicalSummary && selected.seasonId in seasonSummaries && <section className="canon-summary" aria-label="정본 요약"><p className="reader-status">정본 요약 · 원문과 별도</p><h2>{seasonSummaries[selected.seasonId as keyof typeof seasonSummaries].title}</h2><p>{seasonSummaries[selected.seasonId as keyof typeof seasonSummaries].description}</p></section>}
      {selected.relatedNodeIds.length > 0 && <section className="reader-related"><p className="archive-eyebrow">세계 탐색</p><h2>관련 인물·장소</h2><div>{selected.relatedNodeIds.map((id) => { const node = archiveNodeById.get(id); return node ? <button key={id} onClick={() => onOpenNode(id)}><strong>{node.label}</strong><span>{node.subtitle}</span></button> : null })}</div><button className="reader-world-link" onClick={onOpenExplorer}>세계 탐색으로 돌아가기</button></section>}
      <nav className="reader-pager" aria-label="원문 이동">{previous ? <button onClick={() => openPart(previous)}>← {previous.title}</button> : <span />}{next ? <button onClick={() => openPart(next)}>다음 · {next.title} →</button> : <span />}</nav>
    </article>
  </section>
}
