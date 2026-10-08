/** Stable pair identity. Bare legacy C03 links remain accepted by the router. */
export const wikiLobbyHref = '/?view=wiki-preview&page=worlds'
export const worldWikiHref = (chronicleId: string) => '/?view=wiki-preview&page=world&chronicle=' + encodeURIComponent(chronicleId)
export const wikiNodeHref = (chronicleId: string, nodeId: string) => '/?view=wiki-preview&node=' + encodeURIComponent(nodeId) + '&chronicle=' + encodeURIComponent(chronicleId)
