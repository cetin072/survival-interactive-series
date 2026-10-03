import { useMemo, useState } from 'react'
import { searchPublicArchive, searchResultGroups, type PublicSearchEntry } from './wikiSearch'

const groupMeta = {
  wiki: { title: '이야기 Wiki', empty: '일치하는 세계관 문서가 없습니다.' },
  knowledge: { title: '생존 지식', empty: '일치하는 공개 생존 지식이 없습니다.' },
  resource: { title: '자료실', empty: '일치하는 공개 자료가 없습니다.' },
} as const

function SearchGroup({ title, entries }: { title: string; entries: PublicSearchEntry[] }) {
  if (!entries.length) return null
  return <section className="wiki-search-group">
    <h2>{title}</h2>
    <div>
      {entries.map((entry) => <a key={entry.id} href={entry.href}>
        <span className="wiki-search-kind">{entry.kindLabel}</span>
        <strong>{entry.title}</strong>
        <small>{entry.subtitle}</small>
        <p>{entry.summary}</p>
      </a>)}
    </div>
  </section>
}

export function WikiSearchBox() {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchPublicArchive(query), [query])
  const groups = useMemo(() => searchResultGroups(results), [results])
  const hasQuery = query.trim().length > 0

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (results[0]) window.location.assign(results[0].href)
  }

  return <div className="wiki-search-area">
    <form className="wiki-search" onSubmit={submit} role="search">
      <input
        aria-label="통합 검색"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="인물, 장소, 사건, 생존 지식 검색"
      />
      <button type="submit">검색</button>
    </form>

    {hasQuery && <div className="wiki-search-results" aria-live="polite">
      <div className="wiki-search-result-head">
        <strong>통합 검색</strong>
        <span>{results.length}건</span>
      </div>
      {results.length
        ? <>
            <SearchGroup title={groupMeta.wiki.title} entries={groups.wiki} />
            <SearchGroup title={groupMeta.knowledge.title} entries={groups.knowledge} />
            <SearchGroup title={groupMeta.resource.title} entries={groups.resource} />
          </>
        : <p className="wiki-search-empty">일치하는 공개 문서나 자료가 없습니다.</p>}
    </div>}
  </div>
}
