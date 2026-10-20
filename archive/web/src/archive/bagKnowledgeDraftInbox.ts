/** PR #566 read-only shelf; manuscript storage, review, approval and deployed output are separate. */
// @ts-expect-error The existing static catalog is the sole identity source.
import { CATALOG } from '../../public/bag-lab/catalog.mjs'
export const BAG_REPO = 'cetin072/survival-interactive-series'
export const BAG_WRITING_BRANCH = 'feat/bag-side-item-knowledge-template-v1'
export const BAG_QUEUE_PATH = 'docs/bunker_os/bag_knowledge/DRAFT_QUEUE_V1.json'
const BAG_DIR = 'docs/bunker_os/bag_knowledge/'
const FILE = /^GUIDE_(\d{2})(?:_[A-Z0-9]+)*_DRAFT_V01\.md$/
type Catalog = { id: string; name: string; group: string; category: string }
const catalog = CATALOG as Catalog[]
export type BagDraftEntry = { state: string; file: string; catalogName?: string; sourceSha256?: string; approvedAt?: string; approvalEvidence?: string }
export type BagDraftQueue = { catalogTotal: number; nextCandidate?: string; articles: Record<string, BagDraftEntry> }
export type BagDraftDirectoryItem = { id: string; file: string; name: string; blob: string }
export type BagDraftItem = {
  id: string; name: string; file: string | null; state: string; approved: boolean;
  blob: string | null; origin: 'GITHUB' | 'LIBRARY' | null; publication: 'VERIFIED' | 'BUILD_ONLY' | 'UNKNOWN';
}
export type DeploymentEvidence = { production: boolean; listed: { id: string; href: string; sourceSha256?: string }[] }
type Receipts = { articles?: Record<string, { file: string; origin: 'GITHUB' | 'LIBRARY'; sha256: string; blob?: string }> }
const validId = (id: string) => catalog.some(c => c.id === id)
export function checkedDraftFile(id: string, file: string): string {
  if (!validId(id)) throw new Error('INVALID_BAG_DRAFT_ID')
  if (FILE.exec(file)?.[1] !== id.slice(-2)) throw new Error('INVALID_BAG_DRAFT_FILENAME')
  return file
}
export function githubContentUrl(path: string, ref = BAG_WRITING_BRANCH): string {
  if (path !== BAG_QUEUE_PATH && path !== BAG_DIR + 'SOURCE_RECEIPTS_V1.json' && !new RegExp('^' + BAG_DIR + 'GUIDE_\\d{2}(?:_[A-Z0-9]+)*_DRAFT_V01\\.md$').test(path)) throw new Error('INVALID_BAG_DRAFT_PATH')
  if (ref !== BAG_WRITING_BRANCH && ref !== 'main') throw new Error('INVALID_BAG_DRAFT_REF')
  const url = new URL(`https://api.github.com/repos/${BAG_REPO}/contents/` + path.split('/').map(encodeURIComponent).join('/'))
  url.searchParams.set('ref', ref); return url.toString()
}
export function decodeGithubText(payload: unknown): string {
  const d = payload as { type?: unknown; encoding?: unknown; content?: unknown }
  if (d?.type !== 'file' || d.encoding !== 'base64' || typeof d.content !== 'string') throw new Error('GITHUB_CONTENT_NOT_A_FILE')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(d.content.replace(/\s/g, '')), c => c.charCodeAt(0))) }
  catch { throw new Error('INVALID_GITHUB_FILE_ENCODING') }
}
export async function fetchGithubDraft(path: string, ref = BAG_WRITING_BRANCH, expectedBlob?: string): Promise<string> {
  const response = await fetch(githubContentUrl(path, ref), { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GITHUB_DRAFT_HTTP_${response.status}`)
  const payload = await response.json()
  if (expectedBlob && payload.sha !== expectedBlob) throw new Error('BAG_DRAFT_CHANGED_REFRESH_REQUIRED')
  return decodeGithubText(payload)
}
export function readBagDraftQueue(raw: string): BagDraftQueue {
  const q = JSON.parse(raw) as BagDraftQueue
  if (q?.catalogTotal !== 49 || !q.articles || Array.isArray(q.articles) || typeof q.articles !== 'object') throw new Error('INVALID_BAG_QUEUE')
  for (const [id, item] of Object.entries(q.articles)) {
    if (!item || typeof item.state !== 'string' || typeof item.file !== 'string') throw new Error('INVALID_BAG_QUEUE_ITEM')
    checkedDraftFile(id, item.file)
  }
  return q
}
export function readBagDraftDirectory(payload: unknown): BagDraftDirectoryItem[] {
  if (!Array.isArray(payload)) throw new Error('INVALID_BAG_DRAFT_DIRECTORY')
  const seen = new Set<string>(), docs: BagDraftDirectoryItem[] = []
  for (const v of payload) {
    if (v?.type !== 'file' || typeof v.name !== 'string' || !/^GUIDE_\d/.test(v.name)) continue
    const m = FILE.exec(v.name)
    if (!m) throw new Error('INVALID_BAG_DRAFT_FILENAME')
    const id = 'guide-' + m[1]; checkedDraftFile(id, v.name)
    if (seen.has(id)) throw new Error('DUPLICATE_BAG_DRAFT_ID')
    if (!/^[a-f0-9]{40}$/.test(v.sha)) throw new Error('INVALID_BAG_DRAFT_BLOB')
    seen.add(id); docs.push({ id, file: v.name, name: catalog.find(c => c.id === id)!.name, blob: v.sha })
  }
  return docs.sort((a,b) => a.id.localeCompare(b.id))
}
export async function fetchGithubDraftDirectory(ref = BAG_WRITING_BRANCH): Promise<BagDraftDirectoryItem[]> {
  const url = new URL(`https://api.github.com/repos/${BAG_REPO}/contents/${BAG_DIR}`); url.searchParams.set('ref', ref)
  const response = await fetch(url, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error('GITHUB_DRAFT_LIST_HTTP_' + response.status)
  return readBagDraftDirectory(await response.json())
}
export function joinBagReviewStates(working: BagDraftQueue, publicQueue: BagDraftQueue, directory: BagDraftDirectoryItem[], mainDirectory: BagDraftDirectoryItem[], deployment?: DeploymentEvidence, receipts?: Receipts): BagDraftItem[] {
  const sources = new Map(directory.map(d => [d.id, d])), main = new Map(mainDirectory.map(d => [d.id, d]))
  return catalog.map(c => {
    const d = sources.get(c.id), a = publicQueue.articles[c.id], currentMain = main.get(c.id)
    // Legacy eight approvals remain valid: exact main/draft blob equality + existing evidence.
    // A changed writing revision is never labelled approved because its filename happens to match.
    const approved = !!(d && currentMain && a?.state === 'USER_APPROVED_FOR_PUBLICATION' && a.file === d.file &&
      currentMain.file === d.file && currentMain.blob === d.blob && a.approvalEvidence?.trim() && /^20\d\d-\d\d-\d\d$/.test(a.approvedAt ?? ''))
    const candidate = working.articles[c.id]?.state
    const state = !d ? 'SOURCE_NOT_RECEIVED' : approved ? 'USER_APPROVED_FOR_PUBLICATION' :
      candidate && candidate !== 'USER_APPROVED_FOR_PUBLICATION' ? candidate : 'PENDING_INDEPENDENT_REVIEW'
    const listed = deployment?.listed.find(p => p.id === c.id)
    const receipt = receipts?.articles?.[c.id]
    const publication = approved && listed && a.sourceSha256 && listed.sourceSha256 === a.sourceSha256 && /^\/knowledge\/bag\/[a-z0-9-]+\/$/.test(listed.href) ?
      deployment?.production ? 'VERIFIED' : 'BUILD_ONLY' : 'UNKNOWN'
    return { id: c.id, name: c.name, file: d?.file ?? null, state, approved, blob: d?.blob ?? null,
      origin: d ? receipt?.file === d.file && receipt.blob === d.blob ? receipt.origin : 'GITHUB' : null, publication }
  })
}
export function bagDraftLabel(state: string): string {
  if (state === 'SOURCE_NOT_RECEIVED') return '원문 미확보'
  if (state === 'USER_APPROVED_FOR_PUBLICATION') return '발행 승인'
  if (state === 'LIGHT_REVIEW_PASS_USER_PENDING') return '간편 검수 · 발행 승인 대기'
  if (state === 'INDEPENDENT_PASS_USER_PENDING') return '독립 검수 · 발행 승인 대기'
  if (state === 'PENDING_INDEPENDENT_REVIEW' || state === 'DRAFT_NEEDS_INDEPENDENT_REVIEW') return '작성됨 · 검수 대기'
  return '상태 확인 필요'
}
export function parseBagDraft(raw: string, expectedId: string): { title: string; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
  if (!match) throw new Error('INVALID_BAG_DRAFT_FRONT_MATTER')
  const entry = catalog.find(c => c.id === expectedId)
  const field = (key: string) => {
    const matches = [...match[1].matchAll(new RegExp('^' + key + ': (.+)$', 'gm'))]
    return matches.length === 1 ? matches[0][1].trim() : null
  }
  if (!entry || field('contentType') !== 'bag-item-knowledge' || field('catalogId') !== expectedId || field('catalogName') !== entry.name ||
    field('group') !== entry.group || field('category') !== entry.category || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field('slug') ?? '')) throw new Error('BAG_DRAFT_CATALOG_MISMATCH')
  const title = field('title')
  if (!title || !match[2].trim()) throw new Error('EMPTY_BAG_DRAFT')
  return { title, content: match[2].trim() }
}
export function githubDraftWebUrl(file: string, id: string): string {
  return `https://github.com/${BAG_REPO}/blob/${BAG_WRITING_BRANCH}/${BAG_DIR}${checkedDraftFile(id, file)}`
}
export async function fetchBuildPublication(): Promise<DeploymentEvidence> {
  const [metaResponse, listResponse] = await Promise.all([
    fetch('/deploy-meta.json', { cache: 'no-store', credentials: 'omit' }),
    fetch('/knowledge/bag/index.json', { cache: 'no-store', credentials: 'omit' }),
  ])
  if (!metaResponse.ok || !listResponse.ok) throw new Error('BAG_PUBLICATION_EVIDENCE_UNAVAILABLE')
  const meta = await metaResponse.json(), listed = await listResponse.json()
  if (!Array.isArray(listed) || listed.some(p => !validId(p.id) || typeof p.href !== 'string') || new Set(listed.map(p => p.id)).size !== listed.length) throw new Error('BAG_PUBLICATION_EVIDENCE_INVALID')
  return { production: meta.context === 'production', listed }
}
