import { chronicleBooks } from './storyData'
import { activeChronicle, chronicleRegistry } from './chronicleRegistry'

type Props = {
  onOpenChronicle: (id: string) => void
  onOpenBook: (id: string) => void
  onOpenExplorer: (id: string) => void
}

const sourceClassLabel = (value: string) => ({
  LIVE_RPG: '현재 플레이',
  LEGACY_RPG: '이전 플레이',
  MANUSCRIPT_IMPORT: '원고',
  CHAT_IMPORT: '대화 기록',
  NOTE_IMPORT: '메모',
  AUDIO_TRANSCRIPT: '음성 기록',
  EXTERNAL_CONTRIBUTION: '외부 기고',
}[value] ?? '기록')

export function StoryLibrary({ onOpenChronicle, onOpenBook, onOpenExplorer }: Props) {
  return <section className="story-library archive-hub" aria-label="생존일기 이야기 보관소">
    <header className="library-intro hub-intro">
      <p className="archive-eyebrow">SURVIVAL DIARY · STORY ARCHIVE</p>
      <h1>생존일기</h1>
      <p>여러 생존 이야기를 기록하고, 그 안의 인물과 장소, 사건을 모아 하나의 세계로 이어갑니다.</p>
    </header>

    <section className="featured-chronicle" aria-labelledby="featured-title">
      <div><p className="archive-eyebrow">현재 진행 중 · 생존기 {String(activeChronicle.number).padStart(2, '0')}</p>
        <h2 id="featured-title">{activeChronicle.title}</h2>
        <p>{activeChronicle.protagonist} 생존기 · 시즌 3</p>
        <div className="hub-actions">
          <button className="primary" onClick={() => onOpenBook(activeChronicle.id)}>이야기 읽기</button>
          <button onClick={() => onOpenExplorer(activeChronicle.id)}>세계관 보기</button>
          <button onClick={() => onOpenChronicle(activeChronicle.id)}>생존기 보기</button>
        </div>
      </div>
      <span className="featured-index">{String(activeChronicle.number).padStart(2, '0')}</span>
    </section>

    <section aria-labelledby="chronicles-title">
      <div className="hub-section-heading"><div><p className="archive-eyebrow">STORIES</p><h2 id="chronicles-title">생존기</h2></div><span>{chronicleRegistry.length}개의 이야기</span></div>
      <div className="book-shelf chronicle-shelf">
        {chronicleRegistry.map((chronicle) => {
          const book = chronicleBooks.find((item) => item.chronicleId === chronicle.id)
          return <article className="book-card chronicle-card" key={chronicle.id}>
            <p className="archive-eyebrow">생존기 {String(chronicle.number).padStart(2, '0')} · {chronicle.status === 'LIVE' ? '현재 진행 중' : '완결'}</p>
            <h3>{chronicle.title}</h3>
            <p className="book-subtitle">{chronicle.protagonist} 생존기</p>
            <p>{book?.description ?? chronicle.availabilityNote}</p>
            <dl><div><dt>기록 형태</dt><dd>{sourceClassLabel(chronicle.sourceClass)}</dd></div><div><dt>이야기</dt><dd>{book ? '읽기 가능' : '아직 정리 중'}</dd></div></dl>
            <button className="primary" onClick={() => onOpenChronicle(chronicle.id)}>생존기 보기</button>
          </article>
        })}
      </div>
    </section>

    <section className="shared-archive-links shared-archive-links-simple" aria-label="생존일기 공용 메뉴">
      <a href="/knowledge/"><span>현실에서 쓸 수 있는 정보</span><strong>생존 지식 →</strong></a>
      <a href="/?view=tools"><span>삽화 · 지도 · 체크리스트 · 파일</span><strong>자료실 →</strong></a>
    </section>
  </section>
}
