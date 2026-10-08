import {
  buildWikiDocuments, wikiCharacterIndex, wikiDocumentChronicleId,
  wikiEventIndex, wikiLocationIndex, wikiSupportedNodeIds,
} from './wikiDocument'
import { readerWikiChronicleIds, readerWikiDocuments } from './readerWiki'

export type WorldWikiIndexItem = { id: string; title: string; subtitle: string }
export const hasPublishedWorldWiki = (chronicleId: string) =>
  chronicleId === wikiDocumentChronicleId || readerWikiChronicleIds.includes(chronicleId)

/** Each Chronicle resolves its own adapter; never substitute the active graph. */
export function publishedWorldWikiIndex(chronicleId: string) {
  if (!hasPublishedWorldWiki(chronicleId)) return null
  if (chronicleId !== wikiDocumentChronicleId) {
    const documents = readerWikiDocuments(chronicleId)
    return {
      recent: [...documents].sort((a,b) => (b.sourceOrder ?? 0) - (a.sourceOrder ?? 0) || a.id.localeCompare(b.id)).slice(0,7),
      categories: [
        { id: 'characters', label: '인물', counter: '명', items: documents.filter((document) => document.type === 'character') },
        { id: 'locations', label: '장소', counter: '곳', items: documents.filter((document) => document.type === 'location') },
        { id: 'events', label: '사건', counter: '건', items: documents.filter((document) => document.type === 'event') },
      ],
    }
  }
  const recent = buildWikiDocuments(wikiSupportedNodeIds)
    .sort((a, b) => b.anchor.gameTime.localeCompare(a.anchor.gameTime)
      || (b.anchor.saveVersion ?? 0) - (a.anchor.saveVersion ?? 0))
    .slice(0, 7)
  return { recent, categories: [
    { id: 'characters', label: '인물', counter: '명', items: wikiCharacterIndex },
    { id: 'locations', label: '장소', counter: '곳', items: wikiLocationIndex },
    { id: 'events', label: '사건', counter: '건', items: wikiEventIndex },
  ] }
}
