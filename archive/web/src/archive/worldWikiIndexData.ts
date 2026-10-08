import {
  buildWikiDocuments,
  wikiCharacterIndex,
  wikiDocumentChronicleId,
  wikiEventIndex,
  wikiLocationIndex,
  wikiSupportedNodeIds,
} from './wikiDocument'

export type WorldWikiIndexItem = { id: string; title: string; subtitle: string }

export const hasPublishedWorldWiki = (chronicleId: string) =>
  chronicleId === wikiDocumentChronicleId

/** One data boundary per Chronicle: no cross-world fallback to the active graph. */
export function publishedWorldWikiIndex(chronicleId: string) {
  if (!hasPublishedWorldWiki(chronicleId)) return null
  const recent = buildWikiDocuments(wikiSupportedNodeIds)
    .sort((a, b) => b.anchor.gameTime.localeCompare(a.anchor.gameTime)
      || (b.anchor.saveVersion ?? 0) - (a.anchor.saveVersion ?? 0))
    .slice(0, 7)
  return {
    recent,
    categories: [
      { id: 'characters', label: '인물', counter: '명', items: wikiCharacterIndex },
      { id: 'locations', label: '장소', counter: '곳', items: wikiLocationIndex },
      { id: 'events', label: '사건', counter: '건', items: wikiEventIndex },
    ],
  }
}
