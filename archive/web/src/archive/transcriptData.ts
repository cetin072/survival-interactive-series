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

const c02SessionRaw = import.meta.glob(
  '../../../content/transcripts/C02-STRONGHOLD/SESSIONS/**/PART_*.md',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>
import c03S01Part1 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_001.md?raw'
import c03S01Part2 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_002.md?raw'
import c03S01Part3 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_003.md?raw'
import c03S01Part4 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_004.md?raw'
import c03S01Part5 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_005.md?raw'
import c03S01Part6 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_006.md?raw'
import c03S01Part7 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_007.md?raw'
import c03S01Part8 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_008.md?raw'
import c03S01Part9 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_009.md?raw'
import c03S01Part10 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_C03_010.md?raw'
const c03S02Raw = import.meta.glob(
  '../../../content/transcripts/C03-AFTERFALL/S02/SESSION_*/PART_*.md',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>
const c03S02Manifests = import.meta.glob(
  '../../../content/transcripts/C03-AFTERFALL/S02/MANIFEST.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>

import { activeChronicle, chronicleRegistry, getChronicle, partitionChronicles, type Chronicle, type ChronicleId, type ChronicleTranscriptStatus } from './chronicleRegistry'
export { activeChronicle, getChronicle, partitionChronicles, type Chronicle, type ChronicleId, type ChronicleTranscriptStatus }
export type TranscriptStatus = 'verified_transcript' | 'verified_fragment' | 'missing_transcript'

export type TranscriptPart = {
  id: string
  ipId: 'survival-diary'
  chronicleId: ChronicleId
  worldlineId: string
  seasonId: string
  sessionId?: string
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

export const chronicles = chronicleRegistry

const c01 = (part: Omit<TranscriptPart, 'ipId' | 'chronicleId' | 'worldlineId' | 'relatedNodeIds'>): TranscriptPart => ({ ...part, ipId: 'survival-diary', chronicleId: 'C01-HAN-JUNHO', worldlineId: 'CANON-V2', relatedNodeIds: [] })
const c02 = (part: Omit<TranscriptPart, 'ipId' | 'chronicleId' | 'worldlineId' | 'relatedNodeIds'>): TranscriptPart => ({ ...part, ipId: 'survival-diary', chronicleId: 'C02-STRONGHOLD', worldlineId: 'STRONGHOLD', relatedNodeIds: [] })
const c03 = (part: Omit<TranscriptPart, 'ipId' | 'chronicleId' | 'worldlineId' | 'relatedNodeIds'>): TranscriptPart => ({ ...part, ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', relatedNodeIds: [] })

type C03S02Session = {
  session_id: string
  verified_range: string
  capture_quality?: string
}

const c03S02Manifest = Object.values(c03S02Manifests)[0] as { sessions: C03S02Session[] }
const c03S02Sessions = new Map(c03S02Manifest.sessions.map((session) => [session.session_id, session]))
const c03S02TranscriptParts: TranscriptPart[] = Object.entries(c03S02Raw)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, content]) => {
    const match = path.match(/S02\/(SESSION_\d{3})\/(PART_(\d{3})\.md)$/)
    if (!match) throw new Error('Unexpected C03 S02 Archive transcript path: ' + path)
    const [, sessionId, partFile, partNumber] = match
    const session = c03S02Sessions.get(sessionId)
    if (!session) throw new Error('C03 S02 Archive part has no manifest session: ' + path)
    const incomplete = session.capture_quality === 'PARTIAL_CAPTURE_INCOMPLETE_PAIRING'
    return c03({
      id: `c03-s02-${sessionId.toLowerCase().replace(/_/g, '-')}-${partNumber}`,
      seasonId: 'S02',
      sessionId,
      number: Number(partNumber),
      title: `${sessionId} · PART ${partNumber}${incomplete ? ' · 불완전 캡처' : ''}`,
      range: session.verified_range,
      status: incomplete ? 'verified_fragment' : 'verified_transcript',
      source: `worldlines/AFTERFALL/seasons/S02/raw_transcript/${sessionId}/${partFile}`,
      sourceVerified: true,
      content,
    })
  })


type C02SessionCatalog = {
  sessionId: string
  seasonId: string
  title: string
  range: string
  parts: number
  sourceRoot: string
}

const c02SessionCatalog: C02SessionCatalog[] = [
  {
    sessionId: 'SESSION_2031_02_TO_2031_03_ROOM_20260925',
    seasonId: '2031-02~03',
    title: '정전·침입 이후와 산불장 진입',
    range: '2031-02 → 2031-03 산불장 진입 · 현재 보이는 공개 원문',
    parts: 5,
    sourceRoot: 'worldlines/STRONGHOLD/raw_transcript/SESSION_2031_02_TO_2031_03_ROOM_20260925',
  },
  {
    sessionId: 'SESSION_20260925_CURRENT_ROOM',
    seasonId: '2031-12~2032-01',
    title: '산불 후일담과 다음 국면',
    range: '2031-12-13 → 2032-01-17 가시구간 · 현재 보이는 공개 원문',
    parts: 4,
    sourceRoot: 'worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_CURRENT_ROOM',
  },
  {
    sessionId: 'SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925',
    seasonId: '2032-봄~여름',
    title: '회사·지역망·폐목장 운영',
    range: '2032 봄 → 여름 · 현재 보이는 공개 원문',
    parts: 6,
    sourceRoot: 'worldlines/STRONGHOLD/raw_transcript/SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925',
  },
  {
    sessionId: 'SESSION_C02_20260925_ROOM_01',
    seasonId: '2032-09~2038-04',
    title: '기록·신원 붕괴와 장기 재편',
    range: '2032-09 → 2038-04 · 현재 보이는 공개 원문',
    parts: 5,
    sourceRoot: 'worldlines/STRONGHOLD/raw_transcript/SESSION_C02_20260925_ROOM_01',
  },
  {
    sessionId: 'SESSION_20260925_2039_CURRENT_ROOM',
    seasonId: '2039-01~10',
    title: '야간·지하사회와 기록현실',
    range: '2039-01-19 → 2039-10-20 · 현재 보이는 공개 원문',
    parts: 4,
    sourceRoot: 'worldlines/STRONGHOLD/raw_transcript/SESSION_20260925_2039_CURRENT_ROOM',
  },
]

function c02SessionContent(sessionId: string, partNumber: number) {
  const partName = 'PART_' + String(partNumber).padStart(3, '0') + '.md'
  const key = '../../../content/transcripts/C02-STRONGHOLD/SESSIONS/' + sessionId + '/' + partName
  const content = c02SessionRaw[key]
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('Missing C02 Archive session RAW: ' + key)
  }
  return content
}

const c02RecoveredSessionParts: TranscriptPart[] = c02SessionCatalog.flatMap((session) => [
  c02({
    id: 'c02-' + session.sessionId.toLowerCase().replace(/_/g, '-') + '-gap',
    seasonId: session.seasonId,
    sessionId: session.sessionId,
    number: 0,
    title: session.title + ' · 직접 확인 전 구간',
    range: '이 source room의 첫 직접 확인 USER 메시지 이전',
    status: 'missing_transcript',
    source: session.sourceRoot + '/INDEX.md',
    sourceVerified: true,
  }),
  ...Array.from({ length: session.parts }, (_, index) => {
    const partNumber = index + 1
    return c02({
      id: 'c02-' + session.sessionId.toLowerCase().replace(/_/g, '-') + '-' + String(partNumber).padStart(3, '0'),
      seasonId: session.seasonId,
      sessionId: session.sessionId,
      number: partNumber,
      title: session.title + ' · PART ' + String(partNumber).padStart(3, '0'),
      range: session.range,
      status: 'verified_transcript',
      source: session.sourceRoot + '/PART_' + String(partNumber).padStart(3, '0') + '.md',
      sourceVerified: true,
      content: c02SessionContent(session.sessionId, partNumber),
    })
  }),
])

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
  ...c02RecoveredSessionParts,
  c02({ id: 'c02-2032-03-fragment', seasonId: '2032-03~09', number: 1, title: '산업단지 사고 이후', range: '2032-03 → 2032-09 · USER 공개 입력 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2032_03_TO_2032_09_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2032, contentFormat: 'raw_fragment' }),
  c02({ id: 'c02-2032-09-fragment', seasonId: '2032-09~2038-04', number: 1, title: '기록·신원 붕괴 이후', range: '2032-09 → 2038-04 · USER 공개 입력 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2032_09_TO_2038_04_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2038, contentFormat: 'raw_fragment' }),
  c02({ id: 'c02-2038-05-fragment', seasonId: '2038-05~2039-12', number: 1, title: '이상 일사와 기록현실', range: '2038-05 → 2039-12 · USER 공개 입력·종료 피드백 일부', status: 'verified_fragment', source: 'worldlines/STRONGHOLD/raw_transcript/RAW_2038_05_TO_2039_12_PARTIAL_01.md', sourceVerified: true, content: c02Fragment2039, contentFormat: 'raw_fragment' }),
  c03({ id: 'c03-s01-missing-before', seasonId: 'S01', number: 0, title: '직접 확인 전 구간', range: 'S01 · 직접 확인 가능한 첫 USER 메시지 이전', status: 'missing_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/INDEX.md', sourceVerified: true }),
  c03({ id: 'c03-s01-001', seasonId: 'S01', number: 1, title: '두 거점 연합시험', range: '직접확인 시작점 → 두 거점 연합시험 최종평가 진입', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_001.md', sourceVerified: true, content: c03S01Part1 }),
  c03({ id: 'c03-s01-002', seasonId: 'S01', number: 2, title: '외부 신뢰망', range: '정식 두 거점 연합 → 북쪽 의원 외부관찰', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_002.md', sourceVerified: true, content: c03S01Part2 }),
  c03({ id: 'c03-s01-003', seasonId: 'S01', number: 3, title: '교환망과 정찰', range: '북쪽 의원 첫 접촉 → 백운생활관 정찰', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_003.md', sourceVerified: true, content: c03S01Part3 }),
  c03({ id: 'c03-s01-004', seasonId: 'S01', number: 4, title: '백운 불개입', range: '백운 이탈자 → 동천교·한지수·송대근', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_004.md', sourceVerified: true, content: c03S01Part4 }),
  c03({ id: 'c03-s01-005', seasonId: 'S01', number: 5, title: '겨울 전 갈무리', range: '본진 복귀 → 겨울 전 갈무리 회의', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_005.md', sourceVerified: true, content: c03S01Part5 }),
  c03({ id: 'c03-s01-006', seasonId: 'S01', number: 6, title: '시즌 1 복기', range: '시즌 1 종료 선언 → 전체 복기', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_006.md', sourceVerified: true, content: c03S01Part6 }),
  c03({ id: 'c03-s01-007', seasonId: 'S01', number: 7, title: '공개 피드백', range: 'NPC 오프스크린 관계 → 시즌 2 강도 피드백', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_007.md', sourceVerified: true, content: c03S01Part7 }),
  c03({ id: 'c03-s01-008', seasonId: 'S01', number: 8, title: '스포일러 지적', range: '스포일러 지적 + 첫 GM 답변; 후속 GM 1건 미확보', status: 'verified_fragment', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_008.md', sourceVerified: true, content: c03S01Part8, contentFormat: 'raw_fragment' }),
  c03({ id: 'c03-s01-009', seasonId: 'S01', number: 9, title: '시즌 종료 저장', range: '시즌 종료 저장 요청 → 공개 저장 진행 업데이트', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_009.md', sourceVerified: true, content: c03S01Part9 }),
  c03({ id: 'c03-s01-010', seasonId: 'S01', number: 10, title: '저장 완료 공개 보고', range: '시즌 종료 저장 완료 공개 보고', status: 'verified_transcript', source: 'worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_010.md', sourceVerified: true, content: c03S01Part10 }),
  c03({ id: 'c03-s02-session-001-gap', seasonId: 'S02', sessionId: 'SESSION_001', number: 0, title: '세션 001 직접 확인 전 구간', range: '2026-11-22 industrial-fire response 이전', status: 'missing_transcript', source: 'worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_001/SOURCE_INDEX.md', sourceVerified: true }),
  c03({ id: 'c03-s02-session-002-gap', seasonId: 'S02', sessionId: 'SESSION_002', number: 0, title: '세션 002 직접 확인 전 구간', range: '2027-01-04 first-winter discussion 이전', status: 'missing_transcript', source: 'worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_002/SOURCE_INDEX.md', sourceVerified: true }),
  ...c03S02TranscriptParts,
]

export function transcriptPartsFor(chronicleId: ChronicleId) { return transcriptParts.filter((part) => part.chronicleId === chronicleId) }
