/** Read-only Operator view of bag-knowledge drafts stored in the existing GitHub work PR. */
export const BAG_REPO = 'cetin072/survival-interactive-series'
export const BAG_WRITING_BRANCH = 'feat/bag-side-item-knowledge-template-v1'
export const BAG_QUEUE_PATH = 'docs/bunker_os/bag_knowledge/DRAFT_QUEUE_V1.json'
const BAG_DIR = 'docs/bunker_os/bag_knowledge/'
const BAG_API = `https://api.github.com/repos/${BAG_REPO}/contents/`
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

export type BagDraftDirectoryItem = { id: string; file: string; name: string }

// Fixed 49-item catalog mapping; never derive identity from a user-edited item name.
const CATALOG_NAMES = [
  '방수 서류 파우치','신분증 사본','가족 비상연락처 메모','소액권 현금','중요 서류 사본','여분 열쇠',
  '우의','여벌 속옷','여벌 양말','계절용 보온 의류','모자·장갑','편한 여벌 신발',
  '구급함','개인 상비약','밴드·거즈','마스크','의료 보조기기 예비품','처방약 예비품',
  '호루라기','종이 지도','다목적 도구','방수 비닐봉투','작은 수리 테이프','고무장갑',
  '생수','간편식','고열량 간식','통조림','식수 정화 도구','수동 캔따개','휴대용 식기',
  '화장지','물티슈','손소독제','칫솔·치약','수건','개인 위생용품','아기용 위생용품',
  '담요','단열 매트','침낭','작은 방수포','손전등','휴대용 라디오','보조배터리',
  '충전 케이블','예비 건전지','충전 어댑터','휴대용 태양광 패널',
] as const

/**
 * Actual GitHub Markdown files are the progress source of truth.
 * The legacy JSON draft queue can lag behind repeated hourly writes.
 */
export function readBagDraftDirectory(payload: unknown): BagDraftDirectoryItem[] {
  if (!Array.isArray(payload)) throw new Error('INVALID_BAG_DRAFT_DIRECTORY')
  const seen = new Set<string>()
  const docs: BagDraftDirectoryItem[] = []
  for (const v of payload) {
    if (!v || typeof v !== 'object' || (v as { type?: unknown }).type !== 'file') continue
    const file = (v as { name?: unknown }).name
    if (typeof file !== 'string') continue
    const match = SAFE_DRAFT_FILE.exec(file)
    if (!match) continue
    const id = 'guide-' + match[1]
    checkedDraftFile(id, file)
    if (seen.has(id)) throw new Error('DUPLICATE_BAG_DRAFT_ID')
    seen.add(id)
    docs.push({ id, file, name: CATALOG_NAMES[Number(match[1]) - 1] ?? id })
  }
  if (docs.length > 49) throw new Error('INVALID_BAG_DRAFT_DIRECTORY')
  return docs.sort((a, b) => Number(a.id.slice(-2)) - Number(b.id.slice(-2)))
}

export async function fetchGithubDraftDirectory(fetcher: typeof fetch = fetch): Promise<BagDraftDirectoryItem[]> {
  const url = new URL(BAG_API + BAG_DIR.split('/').filter(Boolean).map(encodeURIComponent).join('/'))
  url.searchParams.set('ref', BAG_WRITING_BRANCH)
  const response = await fetcher(url.toString(), {
    cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok) throw new Error('GITHUB_DRAFT_LIST_HTTP_' + response.status)
  return readBagDraftDirectory(await response.json())
}

export function joinBagReviewStates(
  working: BagDraftQueue, publicQueue: BagDraftQueue, directory?: BagDraftDirectoryItem[],
): BagDraftItem[] {
  // Only main's explicit approval can mark a draft published.
  // A saved Markdown file remains visible even if legacy queue metadata is stale.
  const sources = directory ?? Object.entries(working.articles).map(([id, entry]) => ({
    id, file: checkedDraftFile(id, entry.file), name: entry.catalogName?.trim() || id,
  }))
  return sources.map(({id, file, name}) => {
    checkedDraftFile(id, file)
    const entry = working.articles[id]
    const approved = publicQueue.articles[id]?.state === 'USER_APPROVED_FOR_PUBLICATION' &&
      publicQueue.articles[id]?.file === file
    const state = approved ? 'USER_APPROVED_FOR_PUBLICATION' :
      entry?.state === 'USER_APPROVED_FOR_PUBLICATION' ? 'PENDING_INDEPENDENT_REVIEW' :
      entry?.state ?? 'PENDING_INDEPENDENT_REVIEW'
    return { id, name: entry?.catalogName?.trim() || name, file, state, published: approved }
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
