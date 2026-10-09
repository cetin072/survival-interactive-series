import sourceInboxJson from '../../../../knowledge/content/source-inbox.json'

// This registry stores public source metadata only. It does not authorize copying,
// reworking, citing as evidence, or publishing an external article.
export type SourceStatus = 'RECEIVED' | 'UPDATE_CANDIDATE' | 'REVIEW_NEEDED' | 'USED' | 'HELD'
export type SourceDecision = 'NEW' | 'UPDATE' | 'EVIDENCE_ONLY' | 'HOLD' | 'OFFICIAL_LINK_ONLY'
export type SourceUse = 'ALLOWED' | 'PROHIBITED' | 'UNKNOWN'

export type SourceRecord = {
  id: string
  url: string
  title: string
  publisher: string
  kind: string
  published_at: string | null
  modified_at: string | null
  checked_at: string
  status: SourceStatus
  decision: SourceDecision
  role: string
  topics: string[]
  question: string
  note: string
  rights: {
    label: string
    checked_at: string
    notice_url: string
    policy_url: string
    attribution: 'REQUIRED' | 'NOT_REQUIRED' | 'UNKNOWN'
    commercial_use: SourceUse
    modification: SourceUse
    scope_note: string
  }
  related_guides: Array<{ id: string; relation: 'REVIEW_CANDIDATE' | 'EVIDENCE' | 'CITED'; reason: string }>
  next_action: string
  history: Array<{ date: string; decision: SourceDecision; note: string }>
}

export const sourceStatusLabel: Record<SourceStatus, string> = {
  RECEIVED: '새로 들어옴',
  UPDATE_CANDIDATE: '기존 글 보강 후보',
  REVIEW_NEEDED: '검토 대기',
  USED: '활용 이력',
  HELD: '보류·보관',
}

export const sourceDecisionLabel: Record<SourceDecision, string> = {
  NEW: '새 글 검토',
  UPDATE: '기존 글 개정 검토',
  EVIDENCE_ONLY: '근거만 기록',
  HOLD: '게시 보류',
  OFFICIAL_LINK_ONLY: '공식 안내만 연결',
}

export const sourceUseLabel: Record<SourceUse, string> = {
  ALLOWED: '허용 표시',
  PROHIBITED: '불가 표시',
  UNKNOWN: '미확인',
}

export function normalizeSourceUrl(value: string): string {
  const parsed = new URL(value.trim())
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('INVALID_SOURCE_URL')
  }
  parsed.hash = ''
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) {
      parsed.searchParams.delete(key)
    }
  }
  parsed.searchParams.sort()
  return parsed.toString()
}

export function validateSourceRecords(records: readonly SourceRecord[]): readonly SourceRecord[] {
  const ids = new Set<string>()
  const urls = new Set<string>()
  for (const record of records) {
    if (!record.id || !record.title || !record.publisher || !record.checked_at ||
        !record.rights?.label || !record.rights?.checked_at || !record.rights?.scope_note ||
        !Array.isArray(record.related_guides) || !Array.isArray(record.history)) {
      throw new Error('INCOMPLETE_SOURCE_RECORD')
    }
    const key = normalizeSourceUrl(record.url)
    if (ids.has(record.id)) throw new Error('DUPLICATE_SOURCE_ID')
    if (urls.has(key)) throw new Error('DUPLICATE_SOURCE_URL')
    ids.add(record.id)
    urls.add(key)
    if (!['HELD', 'RECEIVED', 'UPDATE_CANDIDATE', 'REVIEW_NEEDED', 'USED'].includes(record.status)) {
      throw new Error('UNKNOWN_SOURCE_STATUS')
    }
  }
  return records
}

const data = sourceInboxJson as unknown as { schema_version: number; sources: SourceRecord[] }
if (data.schema_version !== 1) throw new Error('UNSUPPORTED_SOURCE_INBOX_VERSION')
export const sourceInboxRecords = validateSourceRecords(data.sources)
