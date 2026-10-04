import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

export const root = resolve(import.meta.dirname, '../../..')
const content = join(root, 'knowledge/content')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const fail = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_CONTRACT: ${message}`) }
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const localPath = (value) => typeof value === 'string' && /^\/knowledge\/[a-z0-9/-]+\.(xlsx|pdf|csv)$/.test(value) && !value.includes('..')
const httpsUrl = (value) => typeof value === 'string' && /^https:\/\//i.test(value)
export function youtubeVideoId(value) {
  if (!httpsUrl(value)) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'youtu.be') return /^[A-Za-z0-9_-]{6,20}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const direct = url.searchParams.get('v')
      if (direct && /^[A-Za-z0-9_-]{6,20}$/.test(direct)) return direct
      const parts = url.pathname.split('/').filter(Boolean)
      if (['shorts','embed','live'].includes(parts[0]) && /^[A-Za-z0-9_-]{6,20}$/.test(parts[1] ?? '')) return parts[1]
    }
  } catch {}
  return null
}
const lowRiskDomains = new Set(['GENERAL_PREPAREDNESS', 'FOOD_STORAGE', 'COMMUNICATION', 'EVACUATION'])
const highRiskDomains = new Set(['MEDICAL', 'MEDICATION', 'FIRST_AID_PROCEDURE', 'WATER_PURIFICATION', 'GENERATOR', 'COMBUSTION_CO', 'ELECTRICAL', 'RESCUE', 'SHELTER_STRUCTURAL', 'OTHER_SEVERE_HARM'])
const allowedRiskDomains = new Set([...lowRiskDomains, ...highRiskDomains])
const publicationModes = new Set(['PR_ONLY', 'AUTO_LOW_RISK_SHADOW', 'AUTO_LOW_RISK'])
const readerBookRef = 'archive/content/stories/C03-AFTERFALL/BOOK.json'

async function verifiedReaderReference(item, base, label) {
  fail(item.source_kind === 'PUBLIC_READER' && item.reader_book_ref === readerBookRef && /^[a-f0-9]{64}$/.test(item.reader_book_sha256), `${label} Reader identity`)
  fail(nonempty(item.reader_chapter_id) && /^[a-f0-9]{64}$/.test(item.reader_chapter_sha256) && Array.isArray(item.source_refs) && item.source_refs.length > 0 && Array.isArray(item.source_hashes) && item.source_hashes.length === item.source_refs.length && item.source_hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)), `${label} Reader fields`)
  const bytes = await readFile(join(base, item.reader_book_ref))
  // The BOOK hash records discovery-time context; new chapters may grow BOOK.json.
  const book = JSON.parse(bytes.toString('utf8'))
  const chapter = book.chapters.find((entry) => entry.id === item.reader_chapter_id)
  fail(chapter?.sourceKind === 'VERIFIED_GM_NARRATIVE' && chapter.body?.trim(), `${label} Reader chapter missing`)
  fail(createHash('sha256').update(JSON.stringify(chapter)).digest('hex') === item.reader_chapter_sha256, `${label} Reader chapter changed`)
  fail(JSON.stringify(item.source_refs) === JSON.stringify(chapter.sourceRefs) && JSON.stringify(item.source_hashes) === JSON.stringify(chapter.sourceHashes), `${label} Reader provenance mismatch`)
}

export async function loadKnowledge(base = root) {
  const dir = join(base, 'knowledge/content')
  const briefNames = (await readdir(join(dir, 'briefs'))).filter((name) => name.endsWith('.json')).sort()
  const briefs = await Promise.all(briefNames.map((name) => readJson(join(dir, 'briefs', name))))
  const candidates = await Promise.all((await readdir(join(dir, 'candidates'))).filter((name) => name.endsWith('.json')).sort().map((name) => readJson(join(dir, 'candidates', name))))
  const evidence = new Map()
  for (const name of (await readdir(join(dir, 'evidence'))).filter((name) => name.endsWith('.json')).sort()) {
    const item = await readJson(join(dir, 'evidence', name))
    fail(!evidence.has(item.brief_id), `duplicate evidence ${item.brief_id}`)
    evidence.set(item.brief_id, item)
  }
  return { briefs, candidates, evidence, topics: await readJson(join(dir, 'topics.json')),
    guides: await readJson(join(dir, 'guides.json')), stories: await readJson(join(dir, 'stories.json')),
    config: await readJson(join(base, 'knowledge/automation/config.json')), base }
}

export function publicationConfigIssue(config) {
  if (!publicationModes.has(config?.publication_mode)) return 'unknown publication mode'
  if (typeof config.auto_publish_enabled !== 'boolean') return 'invalid auto_publish_enabled flag'
  if (config.publication_mode !== 'AUTO_LOW_RISK' && config.auto_publish_enabled !== false) return 'auto_publish_enabled must be false outside AUTO_LOW_RISK mode'
  return null
}

export async function validateKnowledge(data) {
  const { briefs, candidates, evidence, topics, guides, stories, config, base } = data
  fail(publicationConfigIssue(config) === null, publicationConfigIssue(config))
  fail(/^https:\/\/[^/]+$/.test(config.site_origin), 'invalid site origin')
  const ids = new Set(), slugs = new Set(), topicIds = new Set()
  const guideIds = new Set(), storyIds = new Set()
  for (const guide of guides) {
    fail(nonempty(guide.id) && !guideIds.has(guide.id) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug) && nonempty(guide.title) && ['DRAFT', 'PUBLISHED'].includes(guide.status), 'invalid guide registry')
    if (guide.status === 'PUBLISHED') fail((await stat(join(base, 'archive/web/public/knowledge/guides', guide.slug, 'index.html')).catch(() => null))?.isFile(), `broken guide ${guide.id}`)
    guideIds.add(guide.id)
  }
  for (const story of stories) {
    fail(nonempty(story.id) && !storyIds.has(story.id) && nonempty(story.title) && /^\/[^/]/.test(story.path) && story.verified === true, 'invalid story registry')
    if (story.source_kind === 'PUBLIC_READER') await verifiedReaderReference(story, base, `${story.id} story`)
    else fail(/^archive\/content\/transcripts\/C03-AFTERFALL\//.test(story.source_manifest_ref), 'invalid story registry source')
    storyIds.add(story.id)
  }
  for (const topic of topics) {
    fail(nonempty(topic.id) && !topicIds.has(topic.id), 'duplicate or empty topic id')
    topicIds.add(topic.id)
    fail(Array.isArray(topic.brief_ids) && Array.isArray(topic.tools) && Array.isArray(topic.story_refs), `topic ${topic.id} relations`)
  }
  for (const brief of briefs) {
    fail(/^K-\d{3,}$/.test(brief.id) && !ids.has(brief.id), `duplicate or invalid brief id ${brief.id}`)
    ids.add(brief.id)
    fail(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brief.slug) && !slugs.has(brief.slug), `duplicate or invalid slug ${brief.slug}`)
    slugs.add(brief.slug)
  }
  for (const brief of briefs) {
    fail(brief.content_type === 'BRIEF' && topicIds.has(brief.topic_id), `${brief.id} type/topic`)
    for (const field of ['title', 'summary', 'meta_description', 'lead', 'label', 'scope', 'basis', 'footer']) fail(nonempty(brief[field]), `${brief.id} ${field}`)
    fail(['LOW', 'HIGH'].includes(brief.risk_level) && ['HUMAN_APPROVED', 'AUTO_LOW_RISK'].includes(brief.publication_policy), `${brief.id} policy`)
    fail(Array.isArray(brief.risk_domains) && brief.risk_domains.length > 0 && brief.risk_domains.every((domain) => allowedRiskDomains.has(domain)), `${brief.id} risk domains`)
    fail(['PASS', 'REVIEW', 'HOLD'].includes(brief.semantic_qa_status) && ['PUBLISHED', 'READY', 'HOLD', 'DRAFT'].includes(brief.status), `${brief.id} status`)
    fail(date(brief.source_checked_at) && date(brief.published_at) && date(brief.updated_at), `${brief.id} dates`)
    fail(brief.updated_at >= brief.published_at && typeof brief.ai_assisted === 'boolean' && nonempty(brief.editorial_note), `${brief.id} provenance`)
    fail(Array.isArray(brief.sections) && brief.sections.length > 0 && Array.isArray(brief.sources) && brief.sources.length > 0, `${brief.id} sections/sources`)
    fail(Array.isArray(brief.related_brief_ids) && Array.isArray(brief.tools) && Array.isArray(brief.story_refs), `${brief.id} relations`)
    fail(brief.related_brief_ids.every((id) => id !== brief.id && ids.has(id)), `${brief.id} related ref`)
    fail(brief.guide_id == null || guideIds.has(brief.guide_id), `${brief.id} guide ref`)
    fail(brief.story_refs.every((id) => storyIds.has(id)), `${brief.id} story refs`)
    const sourceIds = new Set()
    for (const source of brief.sources) {
      fail(nonempty(source.id) && !sourceIds.has(source.id) && nonempty(source.title) && /^https:\/\//.test(source.url) && nonempty(source.note) && date(source.checked_at), `${brief.id} source`)
      sourceIds.add(source.id)
    }
    for (const section of brief.sections) {
      fail(nonempty(section.heading) && Array.isArray(section.blocks) && section.blocks.length > 0, `${brief.id} section`)
      for (const block of section.blocks) {
        fail(['prose', 'table', 'ordered_list', 'unordered_list', 'note', 'download/tool', 'image', 'youtube'].includes(block.type), `${brief.id} block type`)
        if (['prose', 'note'].includes(block.type)) fail(nonempty(block.text), `${brief.id} block text`)
        if (block.type === 'table') fail(Array.isArray(block.headers) && block.headers.length > 0 && Array.isArray(block.rows) && block.rows.every((row) => row.length === block.headers.length), `${brief.id} table`)
        if (block.type.endsWith('list')) fail(Array.isArray(block.items) && block.items.length > 0, `${brief.id} list`)
        if (block.type === 'download/tool') fail(brief.tools.some((tool) => tool.path === block.tool_path), `${brief.id} tool block`)
        if (block.type === 'image') fail(httpsUrl(block.src) && nonempty(block.alt) && (block.caption == null || typeof block.caption === 'string'), `${brief.id} image block`)
        if (block.type === 'youtube') fail(Boolean(youtubeVideoId(block.url)) && nonempty(block.title), `${brief.id} youtube block`)
      }
    }
    for (const tool of brief.tools) {
      fail(localPath(tool.path) && nonempty(tool.title) && nonempty(tool.description) && nonempty(tool.label) && tool.availability === 'AVAILABLE', `${brief.id} tool`)
      const file = join(base, 'archive/web/public', tool.path.slice(1))
      fail((await stat(file).catch(() => null))?.isFile(), `${brief.id} broken tool ${tool.path}`)
    }
    const pack = evidence.get(brief.id)
    fail(pack?.brief_id === brief.id && pack.question === brief.title && Array.isArray(pack.claims) && pack.claims.length > 0, `${brief.id} evidence`)
    fail(Array.isArray(pack.conflicts) && Array.isArray(pack.unknowns) && Array.isArray(pack.risk_notes) && nonempty(pack.story_source_status), `${brief.id} evidence fields`)
    for (const claim of pack.claims) fail(nonempty(claim.claim) && Array.isArray(claim.source_ids) && claim.source_ids.length > 0 && claim.source_ids.every((id) => sourceIds.has(id)) && nonempty(claim.context) && nonempty(claim.limitation), `${brief.id} claim`)
    if (brief.publication_policy === 'AUTO_LOW_RISK' && ['READY', 'PUBLISHED'].includes(brief.status)) {
      fail(publicationEligibility(brief, pack, config) === 'AUTO_PUBLISH_ELIGIBLE', `${brief.id} publication eligibility`)
    }
  }
  for (const topic of topics) fail(topic.brief_ids.every((id) => ids.has(id) && briefs.find((b) => b.id === id).topic_id === topic.id), `topic ${topic.id} brief refs`)
  for (const topic of topics) fail(topic.guide_id == null || guideIds.has(topic.guide_id), `topic ${topic.id} guide ref`)
  const candidateIds = new Set()
  for (const candidate of candidates) {
    fail(/^KC-[A-Za-z0-9-]+$/.test(candidate.id) && !candidateIds.has(candidate.id), `duplicate or invalid candidate ${candidate.id}`)
    candidateIds.add(candidate.id)
    fail(nonempty(candidate.question) && topicIds.has(candidate.topic_id), `${candidate.id} question/topic`)
    if (candidate.source_kind === 'PUBLIC_READER') await verifiedReaderReference(candidate, base, candidate.id)
    else if (candidate.source_kind === 'USER_REPORTED_EXPERIENCE') {
      fail(/^knowledge\/content\/experience-seeds\/EX-[0-9]{3,}-[a-z0-9-]+\.json$/.test(candidate.source_ref) && /^[a-f0-9]{64}$/.test(candidate.source_sha256), candidate.id + ' experience identity')
      const seedBytes = await readFile(join(base, candidate.source_ref))
      const seed = JSON.parse(seedBytes.toString('utf8'))
      fail(candidate.source_ref.split('/').at(-1).startsWith(seed.id + '-') && seed.source_kind === 'USER_REPORTED_EXPERIENCE' && seed.status === 'RESEARCH_REQUIRED' && createHash('sha256').update(Buffer.from(seedBytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')).digest('hex') === candidate.source_sha256, candidate.id + ' experience changed')
      const pack = evidence.get(candidate.brief_id)
      fail(pack?.story_source_status === 'USER_REPORTED_EXPERIENCE' && pack.experience_provenance?.source_ref === candidate.source_ref && pack.experience_provenance?.source_sha256 === candidate.source_sha256, candidate.id + ' experience provenance')
    } else fail(/^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/SESSION_\d{3}\/SOURCE_MANIFEST\.json$/.test(candidate.source_manifest_ref) && /^[a-f0-9]{64}$/.test(candidate.source_manifest_sha256), `${candidate.id} public source identity`)
    fail(['DISCOVERED', 'HOLD', 'HUMAN_REVIEW', 'BRIEF_PROPOSED'].includes(candidate.status) && nonempty(candidate.disposition_note), `${candidate.id} disposition`)
    fail(candidate.brief_id == null || ids.has(candidate.brief_id), `${candidate.id} brief ref`)
  }
  fail(evidence.size === briefs.length, 'orphan evidence')
  return true
}

export function publicationEligibility(brief, pack, config) {
  if (!publicationModes.has(config.publication_mode)) return 'HOLD'
  if (!pack || !Array.isArray(pack.claims) || !pack.claims.length || !brief.sources?.length || !brief.source_checked_at) return 'HOLD'
  if (!Array.isArray(pack.conflicts) || !Array.isArray(pack.unknowns) || pack.conflicts.length || pack.unknowns.length || pack.copyright_status !== 'CLEAR') return 'HOLD'
  if (!['VERIFIED_PUBLIC_READER_BACKFILL', 'VERIFIED_PUBLIC_ARCHIVE'].includes(pack.story_source_status)) return 'HUMAN_REVIEW'
  if (brief.content_type !== 'BRIEF' || brief.risk_level !== 'LOW' || brief.publication_policy !== 'AUTO_LOW_RISK') return 'HUMAN_REVIEW'
  if (!Array.isArray(brief.risk_domains) || brief.risk_domains.length === 0 || brief.risk_domains.some((domain) => !lowRiskDomains.has(domain))) return 'HUMAN_REVIEW'
  if (brief.semantic_qa_status !== 'PASS' || !['READY', 'PUBLISHED'].includes(brief.status)) return 'HUMAN_REVIEW'
  return 'AUTO_PUBLISH_ELIGIBLE'
}
