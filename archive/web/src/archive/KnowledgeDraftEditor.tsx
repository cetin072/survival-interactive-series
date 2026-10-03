import { useState, type ReactNode } from 'react'

export type KnowledgeDraftBlock =
  | { type: 'prose' | 'note'; text: string }
  | { type: 'ordered_list' | 'unordered_list'; items: string[] }
  | { type: 'image'; src: string; alt: string; caption?: string; storage_path?: string }
  | { type: 'youtube'; url: string; title: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'download/tool'; tool_path: string }

export type KnowledgeDraftSection = { heading: string; blocks: KnowledgeDraftBlock[] }

export type KnowledgeDraftBrief = {
  id: string
  title: string
  summary: string
  meta_description: string
  lead: string
  label: string
  scope: string
  basis: string
  footer: string
  editorial_note: string
  sections: KnowledgeDraftSection[]
  sources?: Array<{ id?: string; title?: string; url?: string; note?: string; checked_at?: string }>
  [key: string]: unknown
}

const clone = (brief: KnowledgeDraftBrief): KnowledgeDraftBrief => JSON.parse(JSON.stringify(brief)) as KnowledgeDraftBrief

function youtubeId(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return /^[A-Za-z0-9_-]{6,20}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const query = url.searchParams.get('v')
      if (query && /^[A-Za-z0-9_-]{6,20}$/.test(query)) return query
      const parts = url.pathname.split('/').filter(Boolean)
      if (['shorts', 'embed', 'live'].includes(parts[0]) && /^[A-Za-z0-9_-]{6,20}$/.test(parts[1] ?? '')) return parts[1]
    }
  } catch {}
  return null
}

function setText(brief: KnowledgeDraftBrief, key: keyof KnowledgeDraftBrief, value: string) {
  const next = clone(brief)
  next[key] = value as never
  return next
}

function blankBlock(type: KnowledgeDraftBlock['type']): KnowledgeDraftBlock {
  if (type === 'prose' || type === 'note') return { type, text: '' }
  if (type === 'ordered_list' || type === 'unordered_list') return { type, items: [''] }
  if (type === 'image') return { type, src: '', alt: '', caption: '' }
  if (type === 'youtube') return { type, url: '', title: '' }
  if (type === 'table') return { type, headers: ['항목'], rows: [['']] }
  return { type: 'download/tool', tool_path: '' }
}

export function KnowledgeDraftEditor({
  brief,
  disabled,
  onChange,
  onUploadImage,
}: {
  brief: KnowledgeDraftBrief
  disabled?: boolean
  onChange: (next: KnowledgeDraftBrief) => void
  onUploadImage?: (file: File) => Promise<{ url: string; path: string; alt: string; bytes: number }>
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState('')
  const updateSection = (sectionIndex: number, updater: (section: KnowledgeDraftSection) => void) => {
    const next = clone(brief)
    updater(next.sections[sectionIndex])
    onChange(next)
  }

  const updateBlock = (sectionIndex: number, blockIndex: number, updater: (block: KnowledgeDraftBlock) => void) => {
    updateSection(sectionIndex, (section) => updater(section.blocks[blockIndex]))
  }

  const moveSection = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= brief.sections.length) return
    const next = clone(brief)
    const [item] = next.sections.splice(index, 1)
    next.sections.splice(target, 0, item)
    onChange(next)
  }

  const moveBlock = (sectionIndex: number, blockIndex: number, delta: number) => {
    const next = clone(brief)
    const blocks = next.sections[sectionIndex].blocks
    const target = blockIndex + delta
    if (target < 0 || target >= blocks.length) return
    const [item] = blocks.splice(blockIndex, 1)
    blocks.splice(target, 0, item)
    onChange(next)
  }

  return <div className="knowledge-draft-editor">
    <div className="knowledge-draft-fixed">
      <span>질문 제목 · Evidence 연결 때문에 V1에서는 고정</span>
      <strong>{brief.title}</strong>
    </div>

    {([
      ['summary', '요약'],
      ['meta_description', '검색 설명'],
      ['lead', '도입'],
      ['label', '분류 라벨'],
      ['scope', '적용 범위'],
      ['basis', '근거 설명'],
      ['footer', '하단 주의문'],
      ['editorial_note', '편집 메모'],
    ] as const).map(([key, label]) =>
      <label className="knowledge-draft-field" key={key}>
        <span>{label}</span>
        <textarea
          disabled={disabled}
          value={String(brief[key] ?? '')}
          onChange={(event) => onChange(setText(brief, key, event.target.value))}
        />
      </label>
    )}

    <div className="knowledge-draft-sections">
      {brief.sections.map((section, sectionIndex) => <section className="knowledge-draft-section" key={sectionIndex}>
        <header>
          <label>
            <span>섹션 제목</span>
            <input
              disabled={disabled}
              value={section.heading}
              onChange={(event) => updateSection(sectionIndex, (target) => { target.heading = event.target.value })}
            />
          </label>
          <div>
            <button type="button" disabled={disabled || sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}>↑</button>
            <button type="button" disabled={disabled || sectionIndex === brief.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}>↓</button>
            <button type="button" className="operator-danger" disabled={disabled || brief.sections.length <= 1} onClick={() => {
              const next = clone(brief); next.sections.splice(sectionIndex, 1); onChange(next)
            }}>삭제</button>
          </div>
        </header>

        {section.blocks.map((block, blockIndex) => <article className="knowledge-draft-block" key={blockIndex}>
          <div className="knowledge-draft-block-head">
            <strong>{block.type}</strong>
            <div>
              <button type="button" disabled={disabled || blockIndex === 0} onClick={() => moveBlock(sectionIndex, blockIndex, -1)}>↑</button>
              <button type="button" disabled={disabled || blockIndex === section.blocks.length - 1} onClick={() => moveBlock(sectionIndex, blockIndex, 1)}>↓</button>
              <button type="button" className="operator-danger" disabled={disabled || section.blocks.length <= 1} onClick={() => updateSection(sectionIndex, (target) => { target.blocks.splice(blockIndex, 1) })}>삭제</button>
            </div>
          </div>

          {(block.type === 'prose' || block.type === 'note') && <textarea
            disabled={disabled}
            value={block.text}
            onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => {
              if (target.type === 'prose' || target.type === 'note') target.text = event.target.value
            })}
          />}

          {(block.type === 'ordered_list' || block.type === 'unordered_list') && <textarea
            disabled={disabled}
            value={block.items.join('\n')}
            placeholder="한 줄에 한 항목"
            onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => {
              if (target.type === 'ordered_list' || target.type === 'unordered_list') target.items = event.target.value.split('\n')
            })}
          />}

          {block.type === 'image' && <div className="knowledge-draft-media-fields">
            {onUploadImage && <label className="knowledge-draft-file">
              <span>휴대폰/PC 이미지 파일</span>
              <input
                disabled={disabled || uploadingKey === `${sectionIndex}:${blockIndex}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (!file) return
                  const key = `${sectionIndex}:${blockIndex}`
                  setUploadingKey(key); setUploadError('')
                  try {
                    const uploaded = await onUploadImage(file)
                    updateBlock(sectionIndex, blockIndex, (target) => {
                      if (target.type !== 'image') return
                      target.src = uploaded.url
                      target.storage_path = uploaded.path
                      if (!target.alt.trim()) target.alt = uploaded.alt
                    })
                  } catch (error) {
                    const code = error instanceof Error ? error.message : 'KNOWLEDGE_IMAGE_UPLOAD_FAILED'
                    setUploadError(code)
                  } finally {
                    setUploadingKey(null)
                  }
                }}
              />
              <small>JPEG/PNG/WebP 원본을 선택하면 WebP로 자동 축소·압축하고 공개 기준 200KB 이하일 때만 업로드합니다.</small>
            </label>}
            {uploadingKey === `${sectionIndex}:${blockIndex}` && <p className="operator-muted">이미지 최적화·업로드 중…</p>}
            {uploadError && <p className="operator-error" role="alert">{uploadError}</p>}
            <label>이미지 URL<input disabled={disabled} type="url" placeholder="https://..." value={block.src} onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => { if (target.type === 'image') { target.src = event.target.value; delete target.storage_path } })} /></label>
            <label>대체 설명<input disabled={disabled} value={block.alt} onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => { if (target.type === 'image') target.alt = event.target.value })} /></label>
            <label>캡션<input disabled={disabled} value={block.caption ?? ''} onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => { if (target.type === 'image') target.caption = event.target.value })} /></label>
          </div>}

          {block.type === 'youtube' && <div className="knowledge-draft-media-fields">
            <label>YouTube URL<input disabled={disabled} type="url" placeholder="https://youtu.be/..." value={block.url} onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => { if (target.type === 'youtube') target.url = event.target.value })} /></label>
            <label>영상 설명<input disabled={disabled} value={block.title} onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => { if (target.type === 'youtube') target.title = event.target.value })} /></label>
          </div>}

          {block.type === 'table' && <div className="knowledge-draft-readonly">표 블록은 V1에서 보존만 합니다. 내용 변경은 이후 필요성이 확인되면 확장합니다.</div>}
          {block.type === 'download/tool' && <div className="knowledge-draft-readonly">도구 블록 · {block.tool_path}</div>}
        </article>)}

        <div className="knowledge-draft-add-block">
          <span>블록 추가</span>
          {([
            ['prose', '문단'],
            ['unordered_list', '목록'],
            ['note', '주의'],
            ['image', '이미지'],
            ['youtube', 'YouTube'],
          ] as const).map(([type, label]) => <button type="button" disabled={disabled} key={type} onClick={() => updateSection(sectionIndex, (target) => { target.blocks.push(blankBlock(type)) })}>{label}</button>)}
        </div>
      </section>)}
    </div>

    <button type="button" className="operator-secondary knowledge-add-section" disabled={disabled} onClick={() => {
      const next = clone(brief)
      next.sections.push({ heading: '새 섹션', blocks: [{ type: 'prose', text: '' }] })
      onChange(next)
    }}>+ 섹션 추가</button>
  </div>
}

function renderBlock(block: KnowledgeDraftBlock, key: number): ReactNode {
  if (block.type === 'prose') return <p key={key}>{block.text}</p>
  if (block.type === 'note') return <div className="knowledge-preview-note" key={key}>{block.text}</div>
  if (block.type === 'ordered_list') return <ol key={key}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ol>
  if (block.type === 'unordered_list') return <ul key={key}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul>
  if (block.type === 'image') return block.src.startsWith('https://') ? <figure className="knowledge-preview-media" key={key}><img src={block.src} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure> : null
  if (block.type === 'youtube') {
    const id = youtubeId(block.url)
    return id ? <figure className="knowledge-preview-media" key={key}><div className="knowledge-preview-video"><iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={block.title} loading="lazy" allowFullScreen /></div></figure> : null
  }
  if (block.type === 'table') return <div className="knowledge-preview-table" key={key}><table><thead><tr>{block.headers.map((item, index) => <th key={index}>{item}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((item, index) => <td key={index}>{item}</td>)}</tr>)}</tbody></table></div>
  if (block.type === 'download/tool') return <div className="knowledge-preview-note" key={key}>다운로드 도구: {block.tool_path}</div>
  return null
}

export function KnowledgeDraftPreview({ brief }: { brief: KnowledgeDraftBrief }) {
  return <article className="knowledge-draft-preview">
    <p className="archive-eyebrow">{brief.label}</p>
    <h2>{brief.title}</h2>
    <p className="knowledge-preview-lead">{brief.lead}</p>
    {brief.sections.map((section, sectionIndex) => <section key={sectionIndex}>
      <h3>{section.heading}</h3>
      {section.blocks.map(renderBlock)}
    </section>)}
    {!!brief.sources?.length && <section>
      <h3>출처와 확인 범위</h3>
      <ul>{brief.sources.map((source, index) => <li key={index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title ?? source.url}</a> : source.title}{source.note && <> · {source.note}</>}</li>)}</ul>
    </section>}
    <footer>{brief.footer}</footer>
  </article>
}
