/**
 * Read-only bridge to the existing GitHub draft queue.
 * No manuscript text or GitHub credentials are bundled into public build artifacts.
 * The repository is public: this Operator UI is not a substitute for private storage.
 */
export const BAG_DRAFT_BRANCH = 'feat/bag-side-item-knowledge-template-v1'
const API_ROOT = 'https://api.github.com/repos/cetin072/survival-interactive-series/contents/docs/bunker_os/bag_knowledge'
const GITHUB_TREE = 'https://github.com/cetin072/survival-interactive-series/blob/'
const DRAFT_FILENAME = /^GUIDE_(\d{2})(?:_[A-Z0-9]+)*_DRAFT_V01\.md$/

export type BagDraftEntry = { state: string; file: string; approvedAt?: string }
export type BagDraftQueue = {
  catalogTotal: number
  nextCandidate: string
  articles: Record<string, BagDraftEntry>
}
export type BagDraftRow = BagDraftEntry & { id: string; label: string }
export type BagDraftFilter = 'ALL' | 'PENDING' | 'APPROVED'

const approvedStates = new Set(['USER_APPROVED_FOR_PUBLICATION', 'PUBLISHED'])

export function bagDraftStateLabel(state: string) {
  switch (state) {
    case 'USER_APPROVED_FOR_PUBLICATION': return '사용자 발행 승인'
    case 'PUBLISHED': return '게시 완료'
    case 'INDEPENDENT_PASS_USER_PENDING': return '사용자 검수 대기'
    case 'LIGHT_REVIEW_PASS_USER_PENDING': return '간편 검수 완료'
    case 'PENDING_INDEPENDENT_REVIEW': return '원고 검수 대기'
    default: return '상태 확인 필요'
  }
}

export function bagDraftIsApproved(state: string) { return approvedStates.has(state) }

export function bagDraftFileValid(id: string, file: string) {
  const match = DRAFT_FILENAME.exec(file)
  return /^guide-\d{2}$/.test(id) && match?.[1] === id.slice(6)
}

function githubApiUrl(file: string) {
  const url = new URL(API_ROOT + '/' + file)
  url.searchParams.set('ref', BAG_DRAFT_BRANCH)
  return url.toString()
}

export function bagDraftFileUrl(id: string, file: string) {
  if (!bagDraftFileValid(id, file)) throw new Error('INVALID_BAG_DRAFT_FILE')
  return GITHUB_TREE + encodeURIComponent(BAG_DRAFT_BRANCH) + '/docs/bunker_os/bag_knowledge/' + encodeURIComponent(file)
}

type GithubBlob = { content?: unknown; encoding?: unknown; type?: unknown }
export function decodeBagGithubContent(data: unknown): string {
  const blob = data as GithubBlob | null
  if (!blob || typeof blob.content !== 'string' || blob.encoding !== 'base64' || blob.type !== 'file') {
    throw new Error('BAG_DRAFT_CONTENT_INVALID')
  }
  // Convert base64 to UTF-8 without obsolete escape()/unescape() or unsafe HTML rendering.
  const base64 = blob.content.replace(/\s/g, '')
  if (base64.length > 180000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('BAG_DRAFT_CONTENT_INVALID')
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch { throw new Error('BAG_DRAFT_CONTENT_INVALID') }
}

async function getGithubText(filename: string, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(githubApiUrl(filename), {
    cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429
    ? 'GITHUB_RATE_LIMIT_OR_DENIED' : 'GITHUB_DRAFT_READ_FAILED')
  return decodeBagGithubContent(await response.json())
}

export function parseBagDraftQueue(text: string): BagDraftQueue {
  const value = JSON.parse(text) as BagDraftQueue
  if (!value || value.catalogTotal !== 49 || !value.articles ||
      typeof value.articles !== 'object' || Array.isArray(value.articles) ||
      typeof value.nextCandidate !== 'string') throw new Error('BAG_DRAFT_QUEUE_INVALID')
  const entries = Object.entries(value.articles)
  if (entries.length > value.catalogTotal ||
      entries.some(([id, row]) => !row || typeof row.state !== 'string' ||
        typeof row.file !== 'string' || !bagDraftFileValid(id, row.file))) {
    throw new Error('BAG_DRAFT_QUEUE_INVALID')
  }
  return value
}

export function bagDraftRows(queue: BagDraftQueue, filter: BagDraftFilter = 'ALL'): BagDraftRow[] {
  const rows = Object.entries(queue.articles).map(([id, row]) => ({
    ...row, id, label: bagDraftStateLabel(row.state),
  })).sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)))
  if (filter === 'PENDING') return rows.filter((row) => !bagDraftIsApproved(row.state))
  if (filter === 'APPROVED') return rows.filter((row) => bagDraftIsApproved(row.state))
  return rows
}

export async function loadBagDraftQueue(fetcher: typeof fetch = fetch) {
  return parseBagDraftQueue(await getGithubText('DRAFT_QUEUE_V1.json', fetcher))
}

export async function loadBagDraftBody(id: string, file: string, fetcher: typeof fetch = fetch) {
  if (!bagDraftFileValid(id, file)) throw new Error('INVALID_BAG_DRAFT_FILE')
  const text = await getGithubText(file, fetcher)
  const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n/
  if (!front.test(text) || !text.includes('catalogId: ' + id) ||
      !text.includes('contentType: bag-item-knowledge')) throw new Error('BAG_DRAFT_ID_MISMATCH')
  return text.replace(front, '').trim()
}
