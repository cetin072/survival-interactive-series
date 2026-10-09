import { WikiWorldLobby } from './WikiWorldLobby'
import { chronicleRegistry } from './chronicleRegistry'
import { WikiTopbar } from './WikiTopbar'
import { readerWikiDocuments } from './readerWiki'
import { wikiLobbyHref, wikiNodeHref } from './wikiLinks'
import { WikiChroniclePreview } from './WikiChroniclePreview'
import { WikiDocumentPage } from './WikiDocumentPage'
import { WikiHomePreview } from './WikiHomePreview'
import { WikiWorldIndexPreview } from './WikiWorldIndexPreview'
import {
  buildWikiDocument,
  isWikiSupportedNodeId,
  wikiCharacterIndex,
  wikiEventIndex,
  wikiLocationIndex,
} from './wikiDocument'

export function WikiShellPreview({
  nodeId,
  page = 'home',
  chronicleId = 'C03-AFTERFALL',
}: {
  nodeId?: string
  page?: 'home' | 'chronicle' | 'world' | 'worlds'
  chronicleId?: string
}) {
  if (page === 'worlds') return <WikiWorldLobby />
  if ((nodeId || page === 'world' || page === 'chronicle') && !chronicleRegistry.some((item) => item.id === chronicleId)) return <WikiNotFound />
  if (nodeId && chronicleId !== 'C03-AFTERFALL') {
    const document = readerWikiDocuments(chronicleId).find((item) => item.id === nodeId)
    return document ? <WikiDocumentPage document={document} /> : <WikiNotFound />
  }
  if (nodeId && !isWikiSupportedNodeId(nodeId)) return <WikiNotFound />
  if (nodeId && isWikiSupportedNodeId(nodeId)) {
    const document = buildWikiDocument(nodeId)

    const previewTools = <form className="wiki-preview-tools" action="/" method="get" onSubmit={(event) => {
      event.preventDefault()
      const selected = new FormData(event.currentTarget).get('node')
      if (typeof selected === 'string' && isWikiSupportedNodeId(selected)) window.location.assign(wikiNodeHref(chronicleId, selected))
    }}>
      <input type="hidden" name="view" value="wiki-preview" />
      <label>
        <span>Wiki 문서 미리보기</span>
        <select name="node" defaultValue={nodeId}>
          <optgroup label="인물">
            {wikiCharacterIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.subtitle}</option>)}
          </optgroup>
          <optgroup label="장소">
            {wikiLocationIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.subtitle}</option>)}
          </optgroup>
          <optgroup label="사건">
            {wikiEventIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.subtitle}</option>)}
          </optgroup>
        </select>
      </label>
      <button type="submit">열기</button>
      <small>인물·장소·사건은 Wiki 문서로 연결합니다. 자료(reference)는 기존 Archive에서 유지합니다.</small>
    </form>

    return <WikiDocumentPage
      document={document}
      previewTools={previewTools}
      relationHref={(relation) => isWikiSupportedNodeId(relation.nodeId)
        ? wikiNodeHref(chronicleId, relation.nodeId)
        : '/?view=archive&node=' + encodeURIComponent(relation.nodeId)}
    />
  }

  if (page === 'chronicle') return <WikiChroniclePreview chronicleId={chronicleId} />
  if (page === 'world') return <WikiWorldIndexPreview chronicleId={chronicleId} />
  return <WikiHomePreview />
}

export function WikiNotFound() {
  return <main className="wiki-shell"><WikiTopbar /><div className="wiki-home-frame"><header className="wiki-home-intro"><h1>세계관 문서를 찾을 수 없습니다</h1><p>작품과 문서 주소를 확인해 주세요.</p><a href={wikiLobbyHref}>세계관 위키 선택으로</a></header></div></main>
}
