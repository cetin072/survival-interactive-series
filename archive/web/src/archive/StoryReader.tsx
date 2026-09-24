import { useEffect, useMemo, useState } from 'react'
import { archiveNodes } from './archiveData'
import { chronicleChapters, seasonSummaries, type ChronicleChapter } from './storyData'

const STORY_PROGRESS_KEY = 'survival-diary-archive:story-progress'
const archiveNodeById = new Map(archiveNodes.map((node) => [node.id, node]))

function statusLabel(status: ChronicleChapter['status']) {
  if (status === 'VERBATIM_PARTIAL') return '정본 서사 · 원문 일부 회수'
  if (status === 'ONGOING') return '진행 중'
  return '정본 서사'
}

export function StoryReader({
  onOpenNode,
}: {
  onOpenNode: (id: string) => void
}) {
  const [selectedId, setSelectedId] = useState(chronicleChapters[0].id)
  const [season, setSeason] = useState<'S01' | 'S02'>('S01')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORY_PROGRESS_KEY)
      if (saved && chronicleChapters.some((chapter) => chapter.id === saved)) {
        const chapter = chronicleChapters.find((item) => item.id === saved)
        if (chapter) {
          setSelectedId(chapter.id)
          setSeason(chapter.season)
        }
      }
    } catch {
      // 읽기 기능은 저장 실패와 무관하게 계속 동작한다.
    }
  }, [])

  const chapters = useMemo(
    () => chronicleChapters.filter((chapter) => chapter.season === season),
    [season],
  )
  const selected =
    chronicleChapters.find((chapter) => chapter.id === selectedId) ??
    chronicleChapters[0]
  const selectedIndex = chronicleChapters.findIndex((chapter) => chapter.id === selected.id)
  const previous = selectedIndex > 0 ? chronicleChapters[selectedIndex - 1] : null
  const next = selectedIndex < chronicleChapters.length - 1 ? chronicleChapters[selectedIndex + 1] : null

  function openChapter(chapter: ChronicleChapter) {
    setSelectedId(chapter.id)
    setSeason(chapter.season)
    try {
      window.localStorage.setItem(STORY_PROGRESS_KEY, chapter.id)
    } catch {
      // no-op
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="chronicle-shell">
      <aside className="chronicle-sidebar">
        <div className="chronicle-intro-card">
          <p className="archive-eyebrow">CHRONICLE</p>
          <h2>처음부터 읽기</h2>
          <p>실제 플레이에서 확정된 사건만 작품처럼 다시 엮은 공개 정본입니다.</p>
          <button onClick={() => openChapter(chronicleChapters[0])}>Season 1부터 시작</button>
        </div>

        <div className="season-switcher">
          {(['S01', 'S02'] as const).map((seasonId) => (
            <button
              key={seasonId}
              className={season === seasonId ? 'active' : ''}
              onClick={() => {
                setSeason(seasonId)
                const first = chronicleChapters.find((chapter) => chapter.season === seasonId)
                if (first) openChapter(first)
              }}
            >
              <strong>{seasonId}</strong>
              <span>{seasonSummaries[seasonId].title.replace(/^Season \d · /, '')}</span>
            </button>
          ))}
        </div>

        <div className="chapter-list">
          {chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={selected.id === chapter.id ? 'selected' : ''}
              onClick={() => openChapter(chapter)}
            >
              <span>{String(chapter.number).padStart(2, '0')}</span>
              <div>
                <strong>{chapter.title}</strong>
                <small>{chapter.dateLabel}</small>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <article className="chronicle-reader">
        <header className="chronicle-reader-header">
          <p className="chronicle-season-label">{selected.season} · CHAPTER {String(selected.number).padStart(2, '0')}</p>
          <h1>{selected.title}</h1>
          <p className="chronicle-subtitle">{selected.subtitle}</p>
          <div className="chronicle-meta-row">
            <span>{selected.dateLabel}</span>
            <span>{statusLabel(selected.status)}</span>
          </div>
        </header>

        <div className="chronicle-prose">
          {selected.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        <aside className="chronicle-source-note">
          <strong>기록 상태</strong>
          <p>{selected.sourceNote}</p>
          {selected.status === 'VERBATIM_PARTIAL' && (
            <p>정확한 공개 대화 원문이 검증되는 구간은 이후 별도 ‘대화 기록’ 층으로 백필합니다. 현재 없는 원문을 기억으로 만들어 넣지 않습니다.</p>
          )}
        </aside>

        {selected.relatedNodeIds.length > 0 && (
          <section className="chronicle-related">
            <p className="archive-eyebrow">RELATED ARCHIVE</p>
            <h2>이 장면의 인물·장소·사건</h2>
            <div>
              {selected.relatedNodeIds.map((id) => {
                const node = archiveNodeById.get(id)
                if (!node) return null
                return (
                  <button key={id} onClick={() => onOpenNode(id)}>
                    <strong>{node.label}</strong>
                    <span>{node.subtitle}</span>
                    <small>Archive →</small>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <nav className="chronicle-pager">
          {previous ? (
            <button onClick={() => openChapter(previous)}>
              <span>← 이전</span>
              <strong>{previous.title}</strong>
            </button>
          ) : <span />}
          {next ? (
            <button className="next" onClick={() => openChapter(next)}>
              <span>다음 →</span>
              <strong>{next.title}</strong>
            </button>
          ) : <span />}
        </nav>
      </article>
    </section>
  )
}
