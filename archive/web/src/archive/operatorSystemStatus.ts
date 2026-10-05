import archiveConfig from '../../../automation/config.json'
import releasePolicy from '../../../automation/release-policy.json'
import knowledgeState from '../../../../knowledge/automation/state.json'
import knowledgeRuntime from '../../../../knowledge/automation/runtime-state.json'
import knowledgePolicy from '../../../../knowledge/automation/worker-policy.json'

type KnowledgeSource = {
  status: string
  processed_at?: string
  brief_ids?: string[]
  source_manifest_ref?: string
}

const sources = (knowledgeState.sources ?? []) as KnowledgeSource[]
const latestKnowledgeSource = [...sources]
  .filter((item) => item.processed_at)
  .sort((a, b) => Date.parse(b.processed_at ?? '') - Date.parse(a.processed_at ?? ''))[0] ?? null

export const operatorStaticStatus = {
  archive: {
    mode: archiveConfig.mode,
  },
  knowledge: {
    workerEnabled: knowledgePolicy.worker_enabled,
    triggerIntervalHours: knowledgePolicy.dispatcher.trigger_interval_hours,
    timezone: knowledgePolicy.dispatcher.timezone,
    latestStatus: latestKnowledgeSource?.status ?? null,
    latestProcessedAt: latestKnowledgeSource?.processed_at ?? null,
    latestBriefIds: latestKnowledgeSource?.brief_ids ?? [],
    latestSourceRef: latestKnowledgeSource?.source_manifest_ref ?? null,
    backfillLastResult: knowledgeRuntime.backfill?.last_result ?? null,
    backfillLastAttemptedAt: knowledgeRuntime.backfill?.last_attempted_at ?? null,
  },
  release: {
    mode: releasePolicy.mode,
    productionIntervalDays: releasePolicy.production_interval_days,
    releaseHourKst: releasePolicy.release_hour_kst,
    maxProductionDeploysPerDay: releasePolicy.max_production_deploys_per_day,
  },
} as const

export function formatOperatorRefreshTime(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return '아직 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function formatOperatorTime(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function shortSha(value?: string | null) {
  if (!value) return '없음'
  return value.slice(0, 8)
}

export function visualStatusTone(status?: string | null) {
  const normalized = (status ?? '').toUpperCase()
  if (['SUCCESS', 'SUCCEEDED', 'PASS', 'COMPLETED', 'PUBLISHED'].includes(normalized)) return 'ok'
  if (['BLOCKED', 'FAILED', 'ERROR', 'REJECT', 'REJECTED', 'REVIEW_REJECTED', 'HUMAN_REVIEW'].includes(normalized)) return 'warning'
  return 'neutral'
}

export function productionStatusTone(context?: string | null) {
  return context === 'production' ? 'ok' : 'neutral'
}


const statusKorean: Record<string, string> = {
  AUTO: '자동 운영',
  BLOCKED: '작업 중단',
  SUCCESS: '성공',
  SUCCEEDED: '성공',
  PASS: '통과',
  COMPLETED: '완료',
  PUBLISHED: '게시 완료',
  EXTRACTOR_READY: '내용 추출 대기',
  EXTRACTOR_SUBMITTED: '내용 추출 완료',
  REVIEW_READY: '내용 검수 대기',
  REVIEW_SUBMITTED: '내용 검수 완료',
  REJECT: '반려',
  PREPARED: '작업 준비',
  INGESTING: '파일 처리 중',
  READY_FOR_REVIEW: '검수 대기',
  REVIEW_PASS_STAGED: '검수 통과',
  FINALIZE_QUEUED: '게시 준비',
  FINALIZING: '게시 반영 중',
  REVIEW_REJECTED: '품질 검수 재시도',
  HUMAN_REVIEW: '사람 검토 필요',
  SUPERSEDED: '새 승인 결과로 대체됨',
  HOLD: '보류',
  SUBMITTED: '제출 완료',
  PR_OPEN: '게시 전 검증 중',
  FAILED: '실패',
  ERROR: '오류',
  REJECTED: '거절됨',
  PROCESSED: '처리 완료',
  PENDING: '대기 중',
  READY: '준비 완료',
}

const blockerKorean: Record<string, string> = {
  NO_ACCEPTABLE_CANDIDATE: '사용할 수 있는 결과가 없음',
  QUALITY_GATE: '품질 검수 단계',
  PROVIDER_NOT_ACTIVE: '작업 제공 기능이 비활성화됨',
  HUMAN_REVIEW_REQUIRED: '사람의 검토가 필요함',
  RENDERER_NOT_CONSUMED: '이미지 생성 작업이 오래 시작되지 않았습니다.',
  REVIEWER_NOT_CONSUMED: '이미지 검수 작업이 오래 시작되지 않았습니다.',
  REVIEWER_NOT_COMPLETED: '이미지 검수가 오래 끝나지 않고 있습니다.',
  A_WIKI_COMMAND_GH_1: '위키 게시 반영 작업에 실패했습니다. 재시도가 필요합니다.',
  A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED: '세계관 데이터가 바뀌어 새 기준으로 다시 준비해야 합니다.',
  A_WIKI_PR_NOT_CLEAN: '위키 게시 전 검증이 아직 끝나지 않았습니다.',
  A_WIKI_PUBLICATION_SCOPE_INVALID: '위키 게시 변경 범위를 확인해야 합니다.',
  NO_DISTINCT_LOW_RISK_QUESTION: '새로 만들 만한 안전한 지식 주제를 찾지 못했습니다.',
  SEMANTIC_OVERLAP_NO_DISTINCT_LOW_RISK_QUESTION: '기존 글과 겹치지 않는 새 지식 주제를 찾지 못했습니다.',
  KNOWLEDGE_CONTRACT: '지식 글 형식 검증에서 문제가 발견됐습니다.',
  DEFERRED_FRESH_CHARACTER_PRIORITY: '새 인물 삽화를 우선하기 위해 이번 작업을 미뤘습니다.',
}

const knownSubjects: Record<string, string> = {
  'char-taehoon': '장태훈',
}

export function statusLabel(value?: string | null) {
  if (!value) return '기록 없음'
  return statusKorean[value.toUpperCase()] ?? '상태 확인 필요'
}

export function blockerLabel(value?: string | null) {
  if (!value) return '없음'
  return blockerKorean[value.toUpperCase()] ?? '기술 상세 확인이 필요합니다.'
}

const jobTypeKorean: Record<string, string> = {
  BACKFILL_BRIEF: '기존 기록에서 지식 글 만들기',
  FRESH_BRIEF: '새 기록에서 지식 글 만들기',
}

export function jobTypeLabel(value?: string | null) {
  if (!value) return '기록 없음'
  return jobTypeKorean[value.toUpperCase()] ?? '지식 글 작업'
}

const sourceKindKorean: Record<string, string> = {
  PUBLIC_READER: '공개 이야기 기록',
  PUBLIC_ARCHIVE: '공개 아카이브 기록',
}

export function sourceKindLabel(value?: string | null) {
  if (!value) return '기록 없음'
  return sourceKindKorean[value.toUpperCase()] ?? '공개 기록'
}

const decisionKorean: Record<string, string> = {
  BRIEF_READY: '글 초안 준비 완료',
  HOLD: '보류',
  APPROVE: '승인',
  APPROVED: '승인',
  REJECT: '반려',
  REJECTED: '거절',
  PUBLISHED: '게시 완료',
}

export function decisionLabel(value?: string | null) {
  if (!value) return '아직 없음'
  return decisionKorean[value.toUpperCase()] ?? statusLabel(value)
}

export function sessionLabel(value?: string | null) {
  if (!value) return '기록 없음'
  const match = /^SESSION_(\d+)$/.exec(value.toUpperCase())
  return match ? `${Number(match[1])}번째 기록 묶음` : '기록 묶음'
}

export function timezoneLabel(value?: string | null) {
  if (!value) return '시간대 미설정'
  return value === 'Asia/Seoul' ? '한국시간' : value
}

export function statusWithKorean(value?: string | null) {
  if (!value) return '기록 없음'
  const code = value.toUpperCase()
  const ko = statusKorean[code]
  return ko ? `${value} · ${ko}` : value
}

export function explainMachineCode(value?: string | null) {
  if (!value) return null
  return blockerKorean[value.toUpperCase()] ?? null
}

export function subjectWithKorean(value?: string | null) {
  if (!value) return '없음'
  const ko = knownSubjects[value]
  return ko ? `${ko} · ${value}` : value
}

export function timezoneWithKorean(value?: string | null) {
  if (!value) return '시간대 미설정'
  return value === 'Asia/Seoul' ? '한국시간 · Asia/Seoul' : value
}
