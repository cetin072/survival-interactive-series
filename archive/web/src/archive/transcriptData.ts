import c01S01Part1 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_001.md?raw'
import c01S01Part2 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_002.md?raw'
import c01S01Part3 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_003.md?raw'
import c01S01Part4 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_004.md?raw'
import c01S01Part5 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_005.md?raw'
import c01S01Part6 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_006.md?raw'
import c01S01Part7 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_007.md?raw'
import c01S01Part8 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_008.md?raw'
import c01S01Part9 from '../../../content/transcripts/C01-HAN-JUNHO/S01/PART_009.md?raw'
import c01S02Part1 from '../../../content/transcripts/C01-HAN-JUNHO/S02/PART_001.md?raw'
import c02Fragment2032 from '../../../content/transcripts/C02-STRONGHOLD/FRAGMENTS/RAW_2032_03_TO_2032_09_PARTIAL_01.md?raw'
import c02Fragment2038 from '../../../content/transcripts/C02-STRONGHOLD/FRAGMENTS/RAW_2032_09_TO_2038_04_PARTIAL_01.md?raw'
import c02Fragment2039 from '../../../content/transcripts/C02-STRONGHOLD/FRAGMENTS/RAW_2038_05_TO_2039_12_PARTIAL_01.md?raw'

export type ChronicleId = string
export type TranscriptStatus = 'verified_transcript' | 'verified_fragment' | 'missing_transcript'
export type ChronicleTranscriptStatus = 'available' | 'partial' | 'backfill_required'

export type Chronicle = {
  id: ChronicleId
  ipId: 'survival-diary'
  label: string
  protagonist: string
  worldlineId: string
  isActive: boolean
  transcriptStatus: ChronicleTranscriptStatus
  sourceRoot: string
  availabilityNote: string
}

export type TranscriptPart = {
  id: string
  ipId: 'survival-diary'
  chronicleId: ChronicleId
  worldlineId: string
  seasonId: string
  number: number
  title: string
  range: string
  status: TranscriptStatus
  source: string
  sourceVerified: boolean
  relatedNodeIds: string[]
  content?: string
  contentFormat?: 'conversation' | 'raw_fragment'
}

export const chronicles: Chronicle[] = [
  { id: 'C01-HAN-JUNHO', ipId: 'survival-diary', label: 'C01 · 한준호', protagonist: '한준호', worldlineId: 'CANON-V2', isActive: false, transcriptStatus: 'partial', sourceRoot: 'seasons_v2', availabilityNote: 'S01 원문 9개와 S02 후반부 1개가 검증되어 있습니다. S02 초반은 원문 미확보입니다.' },
  { id: 'C02-STRONGHOLD', ipId: 'survival-diary', label: 'C02 · 박도현', protagonist: '박도현', worldlineId: 'STRONGHOLD', isActive: false, transcriptStatus: 'partial', sourceRoot: 'worldlines/STRONGHOLD', availabilityNote: '세 시기의 USER 공개 원문 일부가 검증되어 있습니다. GM 공개 장면과 나머지 구간은 BACKFILL REQUIRED입니다.' },
  { id: 'C03-AFTERFALL', ipId: 'survival-diary', label: 'C03 AFTERFALL · 서진우', protagonist: '서진우', worldlineId: 'AFTERFALL', isActive: true, transcriptStatus: 'backfill_required', sourceRoot: 'worldlines/AFTERFALL', availabilityNote: '현재 생존기의 S01 공개 원문은 BACKFILL REQUIRED 상태입니다. 정본 요약은 원문과 분리해 표시합니다.' },
]

export function partitionChronicles(registry: Chronicle[] = chronicles) {
  const active = registry.filter((chronicle) => chronicle.isActive)
  if (active.length !== 1) throw new Error('Chronicle registry must have exactly one active record.')
  return { active: active[0], past: registry.filter((chronicle) => !chronicle.isActive) }
}

export const { active: activeChronicle, past: pastChronicles } = partitionChronicles()

export function getChronicle(id: ChronicleId) {
  const chronicle = chronicles.find((item) => item.id === id)
  if (!chronicle) throw new Error('Unknown Chronicle: ' + id)
  return chronicle
}

const c01 = (part: Omit<TranscriptPart, 'ipId' | 'chronicleId' | 'worldlineId' | 'relatedNodeIds'>): TranscriptPart => ({ ...part, ipId: 'survival-diary', chronicleId: 'C01-HAN-JUNHO', worldlineId: 'CANON-V2', relatedNodeIds: [] })
const c02 = (part: Omit<TranscriptPart, 'ipId' | 'chronicleId' | 'worldlineId' | 'relatedNodeIds'>): TranscriptPart => ({ ...part, ipId: 'survival-diary', chronicleId: 'C02-STRONGHOLD', worldlineId: 'STRONGHOLD', relatedNodeIds: [] })

export const transcriptParts: TranscriptPart[] = [
  c01({ id: 'c01-s01-001', seasonId: 'S01', number: 1, title: '부팅과 첫 장면', range: 'Canon v2 부팅 → 19:01 농로 위기', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_001.md', sourceVerified: true, content: c01S01Part1 }),
  c01({ id: 'c01-s01-002', seasonId: 'S01', number: 2, title: '후퇴와 합류', range: '정호 후퇴 → 학교 대피소 → 남쪽 분산 제안', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_002.md', sourceVerified: true, content: c01S01Part2 }),
  c01({ id: 'c01-s01-003', seasonId: 'S01', number: 3, title: '첫날 밤', range: '남쪽 대피소 → 차량 회수', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_003.md', sourceVerified: true, content: c01S01Part3 }),
  c01({ id: 'c01-s01-004', seasonId: 'S01', number: 4, title: '가족 전원 합류', range: '차량 복귀 → 가족 전원 합류', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_004.md', sourceVerified: true, content: c01S01Part4 }),
  c01({ id: 'c01-s01-005', seasonId: 'S01', number: 5, title: '거점 0', range: '가족 판단기준 → 후보 B 직전', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_005.md', sourceVerified: true, content: c01S01Part5 }),
  c01({ id: 'c01-s01-006', seasonId: 'S01', number: 6, title: '반복 정전', range: '후보 B 준비 → 전력·급수 동시 장애', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_006.md', sourceVerified: true, content: c01S01Part6 }),
  c01({ id: 'c01-s01-007', seasonId: 'S01', number: 7, title: '두 거점', range: '근거리 호텔 → 후반부 진입', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_007.md', sourceVerified: true, content: c01S01Part7 }),
  c01({ id: 'c01-s01-008', seasonId: 'S01', number: 8, title: '180일차', range: '외곽주택 강화 → 180일차', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_008.md', sourceVerified: true, content: c01S01Part8 }),
  c01({ id: 'c01-s01-009', seasonId: 'S01', number: 9, title: '첫해의 끝', range: '지역 생활서비스 → S01 종료', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_009.md', sourceVerified: true, content: c01S01Part9 }),
  c01({ id: 'c01-s02-missing', seasonId: 'S02', number: 0, title: '시즌 초반~선택 54', range: 'S02 시작 → SEASON 02 · 54 선택지', status: 'missing_transcript', source: 'seasons_v2/S02/raw_transcript/INDEX.md', sourceVerified: true }),
  c01({ id: 'c01-s02-001', seasonId: 'S02', number: 1, title: '선택 54 이후', range: '도심 아파트 정리 → S02 종료 결정', status: 'verified_transcript', source: 'seasons_v2/S02/raw_transcript/PART_001.md', sourceVerified: true, content: c01S02Part1 }),
  c02({ id: 'c02-2032-03-fragment', seasonId: '2032-03~09', number: 1, title: '산업단지 사고 이후', range: '2032-03 → 2032-09 · USER 공개 입력 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2032_03_TO_2032_09_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2032, contentFormat: 'raw_fragment' }),
  c02({ id: 'c02-2032-09-fragment', seasonId: '2032-09~2038-04', number: 1, title: '기록·신원 붕괴 이후', range: '2032-09 → 2038-04 · USER 공개 입력 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2032_09_TO_2038_04_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2038, contentFormat: 'raw_fragment' }),
  c02({ id: 'c02-2038-05-fragment', seasonId: '2038-05~2039-12', number: 1, title: '이상 일사와 기록현실', range: '2038-05 → 2039-12 · USER 공개 입력·종료 피드백 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2038_05_TO_2039_12_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2039, contentFormat: 'raw_fragment' }),
  { id: 'c03-s01-missing', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 0, title: 'Season 1 공개 원문', range: 'C03 AFTERFALL · S01', status: 'missing_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/INDEX.md', sourceVerified: false, relatedNodeIds: [] },
]

export function transcriptPartsFor(chronicleId: ChronicleId) { return transcriptParts.filter((part) => part.chronicleId === chronicleId) }
