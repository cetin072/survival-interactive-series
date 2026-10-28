import type {EditorialRequest} from './knowledgeEditorialModel'
export type KnowledgeItem = {
  slug?: string | null
  draft_revision?: number
  published_on_site?: boolean
  technical_only?: boolean
  editor_archived?: boolean
  editor_request?: EditorialRequest | null
  public_record?: EditorialRequest | null
  updated_at?: string | null
  has_body?: boolean
  job_id: string
  job_type?: string | null
  status: string
  source_kind?: string | null
  source_ref?: string | null
  prepared_at?: string | null
  submitted_at?: string | null
  published_at?: string | null
  result_decision?: string | null
  brief_id?: string | null
  candidate_id?: string | null
  title?: string | null
  risk_level?: string | null
  code?: string | null
  note?: string | null
  final_pr_number?: number | null
  merge_sha?: string | null
  review_item_id?: string | null
  review_status?: string | null
  review_decision_note?: string | null
}

export type KnowledgeInbox = {
  total_count: number
  working_count: number
  review_count: number
  held_count: number
  published_count: number
  items: KnowledgeItem[]
}

export type KnowledgeDetail = KnowledgeItem & {
  source_sha256?: string | null
  work_key?: string | null
  policy_version?: string | null
  main_sha_at_prepare?: string | null
  blocker_code?: string | null
  blocker_stage?: string | null
  final_head_ref?: string | null
  final_head_sha?: string | null
  context?: Record<string, unknown> | null
  result?: Record<string, unknown> | null
}

export type KnowledgeFilter = 'ALL' | 'WORKING' | 'REVIEW' | 'APPROVED' | 'HELD' | 'PUBLISHED'

export const emptyKnowledgeInbox: KnowledgeInbox = {
  total_count: 0,
  working_count: 0,
  review_count: 0,
  held_count: 0,
  published_count: 0,
  items: [],
}

export const knowledgeBucketFor = (item: KnowledgeItem): Exclude<KnowledgeFilter, 'ALL'> => {
  if (item.editor_archived === true) return 'HELD'
  if(item.editor_request&&item.editor_request.revision<(item.draft_revision??0))return 'REVIEW'
  if (item.editor_request?.status === 'PUBLISHED') return 'PUBLISHED'
  if (item.editor_request && ['QUEUED','CHECKING','WAITING_CI','PUBLISHING'].includes(item.editor_request.status)) return item.editor_request.publish_requested ? 'APPROVED' : 'REVIEW'
  if (item.editor_request && ['FAILED','RETRYABLE','CHECKED','CANCELLED'].includes(item.editor_request.status)) return 'REVIEW'
  if(item.status==='PUBLISHED'&&(item.draft_revision??0)>0&&(!item.public_record||(item.draft_revision??0)>item.public_record.revision))return 'REVIEW'
  if (item.status === 'PUBLISHED') return item.published_on_site===true||!!item.public_record?'PUBLISHED':'APPROVED'
  if (item.editor_archived === false && ['HOLD','BLOCKED'].includes(item.status)) return 'REVIEW'
  if (item.status === 'HUMAN_REVIEW') {
    if (item.review_status === 'APPROVED') return 'APPROVED'
    if (item.review_status === 'HOLD' || item.review_status === 'REJECTED') return 'HELD'
    return 'REVIEW'
  }
  if (item.status === 'HOLD' || item.status === 'BLOCKED') return 'HELD'
  return 'WORKING'
}

export const knowledgeSourceLabel = (kind?: string | null): string =>
  kind === 'USER_REPORTED_EXPERIENCE' ? '개인 경험' : kind ?? '—'

export const knowledgeBucketLabel: Record<Exclude<KnowledgeFilter, 'ALL'>, string> = {
  WORKING: '초안 작성 중',
  REVIEW: '검토할 글',
  APPROVED: '발행 중',
  HELD: '보관함',
  PUBLISHED: '게시됨',
}


// The dashboard's general review queue and the C knowledge editor share the
// same existing review_item_id. Only use verified UUIDs to construct local URLs.
export function knowledgeReviewJobMap(inbox: KnowledgeInbox | null): Record<string, string> {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  const result: Record<string, string> = {}
  for (const item of inbox?.items ?? []) {
    if (typeof item.review_item_id === 'string' && uuid.test(item.review_item_id)
      && typeof item.job_id === 'string' && uuid.test(item.job_id)) {
      result[item.review_item_id] = item.job_id
    }
  }
  return result
}
