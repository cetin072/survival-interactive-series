export type ChronicleId = string
export type ChronicleTranscriptStatus = 'available' | 'partial' | 'backfill_required'

/** The only active/past Chronicle source of truth for Reader and RAW routes. */
export type Chronicle = {
  id: ChronicleId; ipId: 'survival-diary'; label: string; title: string; protagonist: string
  worldlineId: string; active: boolean; transcriptStatus: ChronicleTranscriptStatus
  sourceRoot: string; readerAvailable: boolean; availabilityNote: string
}

export const chronicleRegistry: Chronicle[] = [
  { id: 'C01-HAN-JUNHO', ipId: 'survival-diary', label: 'C01 · 한준호', title: '한준호의 생존기', protagonist: '한준호', worldlineId: 'CANON-V2', active: false, transcriptStatus: 'partial', sourceRoot: 'seasons_v2', readerAvailable: true, availabilityNote: '검증된 공개 원문 구간을 수록합니다.' },
  { id: 'C02-STRONGHOLD', ipId: 'survival-diary', label: 'C02 · 박도현', title: '박도현의 생존기', protagonist: '박도현', worldlineId: 'STRONGHOLD', active: false, transcriptStatus: 'partial', sourceRoot: 'worldlines/STRONGHOLD', readerAvailable: true, availabilityNote: '복구된 공개 GM 원문 구간을 수록합니다.' },
  { id: 'C03-AFTERFALL', ipId: 'survival-diary', label: 'C03 AFTERFALL · 서진우', title: '서진우의 생존기', protagonist: '서진우', worldlineId: 'AFTERFALL', active: true, transcriptStatus: 'partial', sourceRoot: 'worldlines/AFTERFALL', readerAvailable: true, availabilityNote: '검증된 공개 GM 원문 구간을 수록합니다.' },
]

export function partitionChronicles(registry: Chronicle[] = chronicleRegistry) {
  const active = registry.filter((chronicle) => chronicle.active)
  if (active.length !== 1) throw new Error('Chronicle registry must have exactly one active record.')
  return { active: active[0], past: registry.filter((chronicle) => !chronicle.active) }
}
export const { active: activeChronicle, past: pastChronicles } = partitionChronicles()
export const getChronicle = (id: string) => {
  const chronicle = chronicleRegistry.find((item) => item.id === id)
  if (!chronicle) throw new Error('Unknown Chronicle: ' + id)
  return chronicle
}
