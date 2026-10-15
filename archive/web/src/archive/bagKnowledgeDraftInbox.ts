/** Read-only Operator view of bag-knowledge drafts stored in the existing GitHub work PR. */
export const BAG_REPO = 'cetin072/survival-interactive-series'
export const BAG_WRITING_BRANCH = 'feat/bag-side-item-knowledge-template-v1'
export const BAG_QUEUE_PATH = 'docs/bunker_os/bag_knowledge/DRAFT_QUEUE_V1.json'
const BAG_DIR = 'docs/bunker_os/bag_knowledge/'
const SAFE_DRAFT_FILE = /^GUIDE_(\d{2})(?:_[A-Z0-9]+)*_DRAFT_V01\.md$/

export type BagDraftEntry = {
  state: string
  file: string
  catalogName?: string
  approvedAt?: string
}
export type BagDraftQueue = {
  catalogTotal: number
  nextCandidate: string
  articles: Record<string, BagDraftEntry>
}
export type BagDraftItem = {
  id: string
  name: string
  file: string
  state: string
  published: boolean
}

const validId = (id: string) => /^guide-(?:0[1-9]|[1-3]\d|4[0-9])$/.test(id)

export function checkedDraftFile(id: string, file: string): string {
  if (!validId(id)) throw new Error('INVALID_BAG_DRAFT_ID')
  const match = SAFE_DRAFT_FILE.exec(file)
  if (!match || match[1] !== id.slice(-2)) throw new Error('INVALID_BAG_DRAFT_FILENAME')
  return file
}

export function githubContentUrl(path: string, ref = BAG_WRITING_BRANCH): string {
  if (!/^docs\/bunker_os\/bag_knowledge\/DRAFT_QUEUE_V1\.json$/.test(path) &&
      !/^docs\/bunker_os\/bag_knowledge\/GUIDE_\d{2}(?:_[A-Z0-9]+)*_DRAFT_V01\.md$/.test(path)) {
    throw new Error('INVALID_BAG_DRAFT_PATH')
  }
  if (ref !== BAG_WRITING_BRANCH && ref !== 'main') throw new Error('INVALID_BAG_DRAFT_REF')
  const url = new URL(`https://api.github.com/repos/${BAG_REPO}/contents/` +
    path.split('/').map(encodeURIComponent).join('/'))
  url.searchParams.set('ref', ref)
  return url.toString()
}

export function decodeGithubText(payload: unknown): string {
  const data = payload as { encoding?: unknown; content?: unknown; type?: unknown }
  if (!data || data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') {
    throw new Error('GITHUB_CONTENT_NOT_A_FILE')
  }
  try {
    const binary = atob(data.content.replace(/\s/g, ''))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (v) => v.charCodeAt(0)))
  } catch {
    throw new Error('INVALID_GITHUB_FILE_ENCODING')
  }
}

export async function fetchGithubDraft(path: string, ref = BAG_WRITING_BRANCH): Promise<string> {
  const response = await fetch(githubContentUrl(path, ref), {
    cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error(`GITHUB_DRAFT_HTTP_${response.status}`)
  return decodeGithubText(await response.json())
}

export function readBagDraftQueue(raw: string): BagDraftQueue {
  const queue = JSON.parse(raw) as Partial<BagDraftQueue>
  if (queue.catalogTotal !== 49 || !queue.articles || typeof queue.articles !== 'object' ||
      typeof queue.nextCandidate !== 'string') throw new Error('INVALID_BAG_QUEUE')
  for (const [id, item] of Object.entries(queue.articles)) {
    if (!item || typeof item.state !== 'string' || typeof item.file !== 'string') throw new Error('INVALID_BAG_QUEUE_ITEM')
    checkedDraftFile(id, item.file)
  }
  return queue as BagDraftQueue
}

export function joinBagReviewStates(working: BagDraftQueue, publicQueue: BagDraftQueue): BagDraftItem[] {
  // Only the main publication manifest has the authority to say an article was approved.
  return Object.entries(working.articles).map(([id, entry]) => {
    const approved = publicQueue.articles[id]?.state === 'USER_APPROVED_FOR_PUBLICATION' &&
      publicQueue.articles[id].file === entry.file
    const state = approved ? 'USER_APPROVED_FOR_PUBLICATION'
      : entry.state === 'USER_APPROVED_FOR_PUBLICATION' ? 'PENDING_INDEPENDENT_REVIEW' : entry.state
    return {
      id, name: entry.catalogName?.trim() || id, file: checkedDraftFile(id, entry.file),
      state, published: approved,
    }
  }).sort((a, b) => Number(a.id.slice(-2)) - Number(b.id.slice(-2)))
}

export function bagDraftLabel(state: string): string {
  if (state === 'USER_APPROVED_FOR_PUBLICATION') return '게시 승인 완료'
  if (state === 'LIGHT_REVIEW_PASS_USER_PENDING') return '간편 검수 · 승인 대기'
  if (state === 'INDEPENDENT_PASS_USER_PENDING') return '독립 검수 · 승인 대기'
  if (state === 'PENDING_INDEPENDENT_REVIEW' || state === 'DRAFT_NEEDS_INDEPENDENT_REVIEW') return '미검수 · 보관'
  return '확인 필요 · 보관'
}

export function parseBagDraft(raw: string, expectedId: string): { title: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
  if (!match) throw new Error('INVALID_BAG_DRAFT_FRONT_MATTER')
  if (!match[1].split(/\r?\n/).some((line) => line.trim() === `catalogId: ${expectedId}`)) {
    throw new Error('BAG_DRAFT_ID_MISMATCH')
  }
  const title = match[1].match(/^title:\s*(.+)$/m)?.[1]?.trim()
  if (!title || !match[2].trim()) throw new Error('EMPTY_BAG_DRAFT')
  return { title, content: match[2].trim() }
}

export function githubDraftWebUrl(file: string, id: string): string {
  const valid = checkedDraftFile(id, file)
  return `https://github.com/${BAG_REPO}/blob/${BAG_WRITING_BRANCH}/${BAG_DIR}${valid}`
}
