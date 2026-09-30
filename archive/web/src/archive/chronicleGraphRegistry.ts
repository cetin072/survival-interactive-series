const graphFiles = Object.keys(import.meta.glob('../../../content/graphs/*/GRAPH.json'))
export const chronicleGraphIds = new Set(graphFiles.map((path) => path.match(/\/graphs\/([^/]+)\/GRAPH\.json$/)?.[1]).filter((id): id is string => Boolean(id)))
export const chronicleHasGraph = (chronicleId: string) => chronicleGraphIds.has(chronicleId)
