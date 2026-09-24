import s01Part1 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_001.md?raw'
import s01Part2 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_002.md?raw'
import s01Part3 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_003.md?raw'
import s01Part4 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_004.md?raw'
import s01Part5 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_005.md?raw'
import s01Part6 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_006.md?raw'
import s01Part7 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_007.md?raw'
import s01Part8 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_008.md?raw'
import s01Part9 from '../../../content/transcripts/C03-AFTERFALL/S01/PART_009.md?raw'
import s02Part1 from '../../../content/transcripts/C03-AFTERFALL/S02/PART_001.md?raw'

export type TranscriptStatus = 'verified_transcript' | 'missing_transcript'

export type TranscriptPart = {
  id: string
  ipId: 'survival-diary'
  chronicleId: 'C03-AFTERFALL'
  worldlineId: 'AFTERFALL'
  seasonId: 'S01' | 'S02'
  number: number
  title: string
  range: string
  status: TranscriptStatus
  source: string
  sourceVerified: true
  relatedNodeIds: string[]
  content?: string
}

export const activeChronicle = {
  ipId: 'survival-diary',
  id: 'C03-AFTERFALL',
  label: 'C03 AFTERFALL',
  protagonist: '서진우',
  worldlineId: 'AFTERFALL',
} as const

export const transcriptParts: TranscriptPart[] = [
  { id: 'c03-s01-001', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 1, title: '부팅과 첫 장면', range: 'Canon v2 부팅 → 19:01 농로 위기', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_001.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo', 'char-seojin'], content: s01Part1 },
  { id: 'c03-s01-002', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 2, title: '후퇴와 합류', range: '정호 후퇴 → 학교 대피소 → 남쪽 분산 제안', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_002.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo'], content: s01Part2 },
  { id: 'c03-s01-003', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 3, title: '첫날 밤', range: '남쪽 대피소 → 차량 회수', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_003.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo'], content: s01Part3 },
  { id: 'c03-s01-004', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 4, title: '가족 전원 합류', range: '차량 복귀 → 가족 전원 합류', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_004.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo'], content: s01Part4 },
  { id: 'c03-s01-005', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 5, title: '거점 0', range: '가족 판단기준 → 후보 B 직전', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_005.md', sourceVerified: true, relatedNodeIds: ['loc-nw-center'], content: s01Part5 },
  { id: 'c03-s01-006', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 6, title: '반복 정전', range: '후보 B 준비 → 전력·급수 동시 장애', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_006.md', sourceVerified: true, relatedNodeIds: ['loc-nw-center'], content: s01Part6 },
  { id: 'c03-s01-007', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 7, title: '두 거점', range: '근거리 호텔 → 후반부 진입', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_007.md', sourceVerified: true, relatedNodeIds: ['loc-nw-center', 'loc-agri'], content: s01Part7 },
  { id: 'c03-s01-008', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 8, title: '180일차', range: '외곽주택 강화 → 180일차', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_008.md', sourceVerified: true, relatedNodeIds: ['loc-nw-center', 'loc-agri'], content: s01Part8 },
  { id: 'c03-s01-009', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S01', number: 9, title: '첫해의 끝', range: '지역 생활서비스 → S01 종료', status: 'verified_transcript', source: 'seasons_v2/S01/raw_transcript/PART_009.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo', 'loc-nw-center'], content: s01Part9 },
  { id: 'c03-s02-missing', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S02', number: 0, title: '시즌 초반~선택 54', range: 'S02 시작 → SEASON 02 · 54 선택지', status: 'missing_transcript', source: 'seasons_v2/S02/raw_transcript/INDEX.md', sourceVerified: true, relatedNodeIds: [] },
  { id: 'c03-s02-001', ipId: 'survival-diary', chronicleId: 'C03-AFTERFALL', worldlineId: 'AFTERFALL', seasonId: 'S02', number: 1, title: '선택 54 이후', range: '도심 아파트 정리 → S02 종료 결정', status: 'verified_transcript', source: 'seasons_v2/S02/raw_transcript/PART_001.md', sourceVerified: true, relatedNodeIds: ['char-jinwoo', 'loc-nw-center'], content: s02Part1 },
]
