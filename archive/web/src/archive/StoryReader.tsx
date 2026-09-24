import { useEffect, useMemo, useState } from 'react'
import { archiveNodes } from './archiveData'
import { seasonSummaries } from './storyData'
import { getChronicle, transcriptPartsFor, type ChronicleId, type TranscriptPart } from './transcriptData'

const PROGRESS_KEY = 'survival-diary-archive:reader-progress:v4'
const archiveNodeById = new Map(archiveNodes.map((node) => [node.id, node]))
type RawMessage = { role: 'player' | 'gm' | 'system_public'; label: string; content: string }

function InlineMarkdown({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return part
  })}</>
}

function messagesFromRaw(content: string): RawMessage[] {
  const sections = content.split(/\n(?=## (?:USER|GM|ASSISTANT — 운영 메타)\s*$)/m)
  return sections.flatMap((section) => {
    const match = section.match(/^## (USER|GM|ASSISTANT — 운영 메타)\s*\n([\s\S]*)$/)
    if (!match) return []
    const [, sourceRole, message] = match
    return [{ role: sourceRole === 'USER' ? 'player' : sourceRole === 'GM' ? 'gm' : 'system_public', label: sourceRole === 'USER' ? '플레이어의 선택' : sourceRole === 'GM' ? 'GM 공개 장면' : '공개 운영 기록', content: message.trim() }]
  })
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
  if (part.status === 'missing_transcript') return <section className="missing-transcript" aria-label="원문 미확보 구간"><p className="reader-status">MISSING TRANSCRIPT</p><h2>이 구간의 공개 원문은 아직 아카이브에 백필되지 않았습니다.</h2><p>정본 요약·체크포인트·운영 기록을 실제 USER/GM 대화로 재구성하지 않습니다.</p><p className="reader-source">기록 위치: {part.source}</p></section>
  return <div className="transcript-flow">{messagesFromRaw(part.content ?? '').map((message, index) => <section key={index} className={'transcript-message transcript-' + message.role}><p className="transcript-role">{message.label}</p><MessageBody content={message.content} /></section>)}</div>
}

export function StoryReader({ chronicleId, onOpenNode, onOpenExplorer }: { chronicleId: ChronicleId; onOpenNode: (id: string) => void; onOpenExplorer: () => void }) {
  const chronicle = getChronicle(chronicleId)
  const chronicleParts = useMemo(() => transcriptPartsFor(chronicleId), [chronicleId])
  const [seasonId, setSeasonId] = useState<'S01' | 'S02'>(chronicleParts[0]?.seasonId ?? 'S01')
  const [selectedId, setSelectedId] = useState(chronicleParts[0]?.id ?? '')
  const [progress, setProgress] = useState(0)
  const parts = chronicleParts.filter((part) => part.seasonId === seasonId)
  const selected = chronicleParts.find((part) => part.id === selectedId) ?? chronicleParts[0]
  const globalIndex = selected ? chronicleParts.findIndex((part) => part.id === selected.id) : -1
  const previous = globalIndex > 0 ? chronicleParts[globalIndex - 1] : null
  const next = globalIndex >= 0 && globalIndex < chronicleParts.length - 1 ? chronicleParts[globalIndex + 1] : null

  useEffect(() => {
    const first = chronicleParts[0]
    if (first) { setSelectedId(first.id); setSeasonId(first.seasonId) }
  }, [chronicleId, chronicleParts])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? '{}') as { partId?: string; scrollY?: number }
      const savedPart = chronicleParts.find((part) => part.id === saved.partId)
      if (savedPart) { setSelectedId(savedPart.id); setSeasonId(savedPart.seasonId); requestAnimationFrame(() => window.scrollTo({ top: saved.scrollY ?? 0 })) }
    } catch { /* storage is optional */ }
  }, [chronicleId, chronicleParts])

  useEffect(() => {
    if (!selected) return
    const saveProgress = () => {
      const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
      setProgress(Math.round((window.scrollY / maximum) * 100))
      try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({ partId: selected.id, scrollY: window.scrollY })) } catch { /* no-op */ }
    }
    saveProgress(); window.addEventListener('scroll', saveProgress, { passive: true })
    return () => window.removeEventListener('scroll', saveProgress)
  }, [selected?.id])

  function openPart(part: TranscriptPart) { setSelectedId(part.id); setSeasonId(part.seasonId); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  if (!selected) return null

  const showC03CanonSummary = chronicle.id === 'C03-AFTERFALL'
  return <section className="reader-page">
    <aside className="reader-toc">
      <p className="archive-eyebrow">{chronicle.label}</p><h2>{chronicle.isActive ? '현재 생존기' : '지난 생존기'} 원문</h2><p>{chronicle.availabilityNote}</p>
      <button className="reader-home" onClick={() => openPart(chronicleParts[0])}>{chronicle.isActive ? '현재 기록 상태 보기' : 'Season 1부터 읽기'}</button>
      <div className="reader-season-tabs" role="tablist" aria-label="시즌 선택">{(['S01', 'S02'] as const).filter((id) => chronicleParts.some((part) => part.seasonId === id)).map((id) => <button key={id} className={seasonId === id ? 'active' : ''} onClick={() => openPart(chronicleParts.find((part) => part.seasonId === id) ?? chronicleParts[0])}>{id}</button>)}</div>
      <nav className="reader-part-list" aria-label="원문 목차">{parts.map((part) => <button key={part.id} className={selected.id === part.id ? 'selected' : ''} onClick={() => openPart(part)}><span>{part.status === 'verified_transcript' ? '원문' : '미확보'}</span><strong>{part.number ? `PART ${String(part.number).padStart(3, '0')}` : 'GAP'}</strong><small>{part.title}</small></button>)}</nav>
    </aside>
    <article className="transcript-reader">
      <header className="reader-header"><div><p className="archive-eyebrow">{selected.seasonId} · {chronicle.label} · {selected.status === 'verified_transcript' ? 'VERIFIED TRANSCRIPT' : 'MISSING TRANSCRIPT'}</p><h1>{selected.title}</h1><p>{selected.range}</p></div><div className="reader-progress" aria-label={'읽기 진행률 ' + progress + '%'}><strong>{progress}%</strong><span><i style={{ width: progress + '%' }} /></span></div></header>
      <aside className="reader-integrity-note"><strong>{selected.status === 'verified_transcript' ? '검증 원문' : '원문 미확보'}</strong><p>{selected.status === 'verified_transcript' ? '실제 USER/GM 공개 메시지의 순서와 내용을 보존합니다. 표시 형식만 읽기 쉽게 바꿉니다.' : '이 빈 구간은 정본 요약이나 이벤트 기록으로 대사를 만들지 않습니다.'}</p><small>Source · {selected.source}</small></aside>
      <TranscriptBody part={selected} />
      {showC03CanonSummary && <section className="canon-summary" aria-label="정본 요약"><p className="reader-status">정본 요약 · 원문과 별도</p><h2>{seasonSummaries[selected.seasonId].title}</h2><p>{seasonSummaries[selected.seasonId].description}</p></section>}
      {selected.relatedNodeIds.length > 0 && <section className="reader-related"><p className="archive-eyebrow">세계 탐색</p><h2>관련 인물·장소</h2><div>{selected.relatedNodeIds.map((id) => { const node = archiveNodeById.get(id); return node ? <button key={id} onClick={() => onOpenNode(id)}><strong>{node.label}</strong><span>{node.subtitle}</span></button> : null })}</div><button className="reader-world-link" onClick={onOpenExplorer}>세계 탐색으로 돌아가기</button></section>}
      <nav className="reader-pager" aria-label="원문 이동">{previous ? <button onClick={() => openPart(previous)}>← {previous.title}</button> : <span />}{next ? <button onClick={() => openPart(next)}>다음 · {next.title} →</button> : <span />}</nav>
    </article>
  </section>
}
