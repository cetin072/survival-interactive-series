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
  issues = [],
}: {
  brief: KnowledgeDraftBrief
  disabled?: boolean
  onChange: (next: KnowledgeDraftBrief) => void
  onUploadImage?: (file: File) => Promise<{ url: string; path: string; alt: string; bytes: number }>
  issues?: Array<{key:string;quote:string;reason:string}>
}) {
  const reasons = (text:string) => issues.filter(issue=>text.includes(issue.quote)).map(issue=><p className="knowledge-editor-inline-reason" key={issue.key}><strong>AI가 확인을 요청한 이유</strong><br/>{issue.reason} <a href={'#problem-'+issue.key}>해결 방법</a></p>)
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
    <label className="knowledge-draft-field">제목<input disabled={disabled} value={brief.title} onChange={event => onChange(setText(brief, 'title', event.target.value))} /></label>

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
          aria-label={label}
          disabled={disabled}
          value={String(brief[key] ?? '')}
          onChange={(event) => onChange(setText(brief, key, event.target.value))}
        />
        {reasons(String(brief[key]??''))}
      </label>
    )}

    <section><h3>자료 연결</h3>{((brief.tools??[]) as unknown[]).map((tool,i)=><div key={i}><p>{typeof tool==='string'?tool:'title' in (tool as object)?String((tool as {title:string}).title):'연결된 자료'}</p><button disabled={disabled} onClick={()=>{const next=clone(brief);(next.tools as unknown[]).splice(i,1);onChange(next)}}>자료 연결 삭제</button></div>)}</section>
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
            <button type="button" className="operator-danger" disabled={disabled} onClick={() => {
              const next = clone(brief); next.sections.splice(sectionIndex, 1); onChange(next)
            }}>삭제</button>
          </div>
        </header>

        {section.blocks.map((block, blockIndex) => <article className="knowledge-draft-block" key={blockIndex}>
          <div className="knowledge-draft-block-head">
            <strong>{{prose:'문단',note:'주의',ordered_list:'순서 목록',unordered_list:'목록',image:'이미지',youtube:'영상',table:'표','download/tool':'자료'}[block.type]}</strong>
            <div>
              <button type="button" disabled={disabled || blockIndex === 0} onClick={() => moveBlock(sectionIndex, blockIndex, -1)}>↑</button>
              <button type="button" disabled={disabled || blockIndex === section.blocks.length - 1} onClick={() => moveBlock(sectionIndex, blockIndex, 1)}>↓</button>
              <button type="button" className="operator-danger" disabled={disabled} onClick={() => updateSection(sectionIndex, (target) => { target.blocks.splice(blockIndex, 1) })}>삭제</button>
            </div>
          </div>

          {(block.type === 'prose' || block.type === 'note') && <textarea
            disabled={disabled}
            value={block.text}
            onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => {
              if (target.type === 'prose' || target.type === 'note') target.text = event.target.value
            })}
          />}
          {'text' in block&&reasons(block.text)}

          {(block.type === 'ordered_list' || block.type === 'unordered_list') && <textarea
            disabled={disabled}
            value={block.items.join('\n')}
            placeholder="한 줄에 한 항목"
            onChange={(event) => updateBlock(sectionIndex, blockIndex, (target) => {
              if (target.type === 'ordered_list' || target.type === 'unordered_list') target.items = event.target.value.split('\n').filter(item => item.trim())
            })}
          />}
          {'items' in block&&reasons(block.items.join('\n'))}

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

          {block.type === 'table' && <div className="knowledge-preview-table"><table><thead><tr>{block.headers.map((cell, ci) => <th key={ci}><input aria-label={'표 제목 '+(ci+1)} disabled={disabled} value={cell} onChange={e=>updateBlock(sectionIndex,blockIndex,b=>{if(b.type==='table')b.headers[ci]=e.target.value})} /></th>)}</tr></thead><tbody>{block.rows.map((row,ri)=><tr key={ri}>{row.map((cell,ci)=><td key={ci}><input aria-label={'표 '+(ri+1)+'행 '+(ci+1)+'열'} disabled={disabled} value={cell} onChange={e=>updateBlock(sectionIndex,blockIndex,b=>{if(b.type==='table')b.rows[ri][ci]=e.target.value})}/></td>)}<td><button disabled={disabled} onClick={()=>updateBlock(sectionIndex,blockIndex,b=>{if(b.type==='table')b.rows.splice(ri,1)})}>행 삭제</button></td></tr>)}</tbody></table><button disabled={disabled} onClick={()=>updateBlock(sectionIndex,blockIndex,b=>{if(b.type==='table')b.rows.push(b.headers.map(()=>''))})}>행 추가</button></div>}
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

    <section aria-label="출처 편집"><h3>출처 보강</h3>{(brief.sources??[]).map((source,index)=><fieldset key={index}><legend>출처 {index+1}</legend>{(['title','url','note','checked_at'] as const).map(key=><label key={key}>{{title:'자료 제목',url:'원문 주소',note:'확인한 내용과 한계',checked_at:'확인 날짜'}[key]}<input disabled={disabled} value={source[key]??''} onChange={e=>{const next=clone(brief);next.sources![index][key]=e.target.value;onChange(next)}} /></label>)}<button disabled={disabled} onClick={()=>{const next=clone(brief);next.sources!.splice(index,1);onChange(next)}}>출처 삭제</button></fieldset>)}<button disabled={disabled} onClick={()=>{const next=clone(brief);next.sources??=[];let i=1;while(next.sources.some(s=>s.id==='S-'+i))i++;next.sources.push({id:'S-'+i,title:'',url:'',note:'',checked_at:new Date().toISOString().slice(0,10)});onChange(next)}}>출처 추가</button></section>
    <button type="button" className="operator-secondary knowledge-add-section" disabled={disabled} onClick={() => {
      const next = clone(brief)
      next.sections.push({ heading: '새 섹션', blocks: [{ type: 'prose', text: '' }] })
      onChange(next)
    }}>+ 섹션 추가</button>
  </div>
}

function highlightText(value:string,quotes:string[]):ReactNode {
  const matching=quotes.filter(q=>q&&value.includes(q))
  if(!matching.length)return value
  const quote=matching.sort((a,b)=>b.length-a.length)[0],parts=value.split(quote)
  return parts.flatMap((part,index)=>index?[<mark key={'q'+index}>{quote}</mark>,part]:[part])
}
function renderBlock(block: KnowledgeDraftBlock, key: number, quotes:string[]=[]): ReactNode {
  if (block.type === 'prose') return <p key={key}>{highlightText(block.text,quotes)}</p>
  if (block.type === 'note') return <div className="knowledge-preview-note" key={key}>{highlightText(block.text,quotes)}</div>
  if (block.type === 'ordered_list') return <ol key={key}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{highlightText(item,quotes)}</li>)}</ol>
  if (block.type === 'unordered_list') return <ul key={key}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{highlightText(item,quotes)}</li>)}</ul>
  if (block.type === 'image') return block.src.startsWith('https://') ? <figure className="knowledge-preview-media" key={key}><img src={block.src} alt={block.alt} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure> : null
  if (block.type === 'youtube') {
    const id = youtubeId(block.url)
    return id ? <figure className="knowledge-preview-media" key={key}><div className="knowledge-preview-video"><iframe src={`https://www.youtube-nocookie.com/embed/${id}`} title={block.title} loading="lazy" allowFullScreen /></div></figure> : null
  }
  if (block.type === 'table') return <div className="knowledge-preview-table" key={key}><table><thead><tr>{block.headers.map((item, index) => <th key={index}>{item}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((item, index) => <td key={index}>{item}</td>)}</tr>)}</tbody></table></div>
  if (block.type === 'download/tool') return <div className="knowledge-preview-note" key={key}>다운로드 도구: {block.tool_path}</div>
  return null
}

export function KnowledgeDraftPreview({ brief, highlights=[] }: { brief: KnowledgeDraftBrief; highlights?:string[] }) {
  return <article className="knowledge-draft-preview">
    <p className="archive-eyebrow">{brief.label}</p>
    <h2>{brief.title}</h2>
    <p className="knowledge-preview-lead">{highlightText(brief.lead,highlights)}</p>
    {brief.sections.map((section, sectionIndex) => <section key={sectionIndex}>
      <h3>{section.heading}</h3>
      {section.blocks.map((block,i)=>renderBlock(block,i,highlights))}
    </section>)}
    {!!brief.sources?.length && <section>
      <h3>출처와 확인 범위</h3>
      <ul>{brief.sources.map((source, index) => <li key={index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title ?? source.url}</a> : source.title}{source.note && <> · {source.note}</>}</li>)}</ul>
    </section>}
    <footer>{brief.footer}</footer>
  </article>
}
