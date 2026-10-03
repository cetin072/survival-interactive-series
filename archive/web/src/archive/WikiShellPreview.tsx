import { WikiDocumentPage } from './WikiDocumentPage'
import { buildWikiDocument } from './wikiDocument'

const previewDocument = buildWikiDocument('char-jinwoo')

export function WikiShellPreview() {
  return <WikiDocumentPage document={previewDocument} />
}
