import { WikiDocumentPage } from './WikiDocumentPage'
import { buildWikiDocument, wikiCharacterIndex, wikiCharacterNodeIds } from './wikiDocument'

const defaultNodeId = 'char-jinwoo'

function selectedCharacterNodeId(requested?: string) {
  return requested && wikiCharacterNodeIds.includes(requested) ? requested : defaultNodeId
}

export function WikiShellPreview({ nodeId }: { nodeId?: string }) {
  const selectedNodeId = selectedCharacterNodeId(nodeId)
  const document = buildWikiDocument(selectedNodeId)

  const previewTools = <form className="wiki-preview-tools" action="/" method="get">
    <input type="hidden" name="view" value="wiki-preview" />
    <label>
      <span>인물 문서 미리보기</span>
      <select name="node" defaultValue={selectedNodeId}>
        {wikiCharacterIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.subtitle}</option>)}
      </select>
    </label>
    <button type="submit">열기</button>
    <small>현재 4단계는 인물만 Wiki 문서로 연결합니다. 장소·사건은 다음 단계에서 전환합니다.</small>
  </form>

  return <WikiDocumentPage
    document={document}
    previewTools={previewTools}
    relationHref={(relation) => relation.type === 'character'
      ? '/?view=wiki-preview&node=' + encodeURIComponent(relation.nodeId)
      : '/?view=archive&node=' + encodeURIComponent(relation.nodeId)}
  />
}
