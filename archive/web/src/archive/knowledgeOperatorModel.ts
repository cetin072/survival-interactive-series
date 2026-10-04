export type KnowledgeItem = {
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

export type KnowledgeFilter = 'ALL' | 'WORKING' | 'REVIEW' | 'HELD' | 'PUBLISHED'

export const emptyKnowledgeInbox: KnowledgeInbox = {
  total_count: 0,
  working_count: 0,
  review_count: 0,
  held_count: 0,
  published_count: 0,
  items: [],
}

export const knowledgeBucketFor = (item: KnowledgeItem): Exclude<KnowledgeFilter, 'ALL'> => {
  if (item.status === 'PUBLISHED') return 'PUBLISHED'
  if (item.status === 'HUMAN_REVIEW') return 'REVIEW'
  if (item.status === 'HOLD' || item.status === 'BLOCKED') return 'HELD'
  return 'WORKING'
}

export const knowledgeSourceLabel = (kind?: string | null): string =>
  kind === 'USER_REPORTED_EXPERIENCE' ? '개인 경험' : kind ?? '—'

export const knowledgeBucketLabel: Record<Exclude<KnowledgeFilter, 'ALL'>, string> = {
  WORKING: '작업 중',
  REVIEW: '사람 검토',
  HELD: '보관',
  PUBLISHED: '게시됨',
}
