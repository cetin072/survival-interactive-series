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
  EXTRACTOR_READY: 'Extractor 대기',
  EXTRACTOR_SUBMITTED: 'Extractor 제출 완료',
  REVIEW_READY: 'Reviewer 대기',
  REVIEW_SUBMITTED: 'Reviewer 제출 완료',
  REJECT: '반려',
  PREPARED: '생성 준비',
  INGESTING: '파일 처리 중',
  READY_FOR_REVIEW: '검수 대기',
  REVIEW_PASS_STAGED: '검수 통과 파일 준비',
  FINALIZE_QUEUED: '후처리 대기',
  FINALIZING: '후처리 중',
  REVIEW_REJECTED: '품질 검수 재시도',
  HUMAN_REVIEW: '사람 검토 필요',
  HOLD: '보류',
  SUBMITTED: '제출 완료',
  PR_OPEN: 'PR 검증 중',
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
  RENDERER_NOT_CONSUMED: 'Renderer 미실행 또는 장기 대기 의심',
  REVIEWER_NOT_CONSUMED: 'Reviewer 미실행 또는 파일 처리 지연 의심',
  REVIEWER_NOT_COMPLETED: 'Reviewer 판정 장기 대기 의심',
  A_WIKI_COMMAND_GH_1: 'GitHub 처리 실패 · 재시도 또는 권한 상태 확인',
  A_WIKI_GRAPH_CHANGED_REPREPARE_REQUIRED: 'Graph 변경 감지 · 새 기준으로 재준비 필요',
  A_WIKI_PR_NOT_CLEAN: 'A-Wiki 게시 PR 검증 미완료',
  A_WIKI_PUBLICATION_SCOPE_INVALID: 'A-Wiki 게시 변경 범위 확인 필요',
}

const knownSubjects: Record<string, string> = {
  'char-taehoon': '장태훈',
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
