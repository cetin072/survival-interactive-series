import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'

export const root = resolve(import.meta.dirname, '../../..')
const content = join(root, 'knowledge/content')
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const fail = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_CONTRACT: ${message}`) }
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const localPath = (value) => typeof value === 'string' && /^\/knowledge\/[a-z0-9/-]+\.(xlsx|pdf|csv)$/.test(value) && !value.includes('..')
const lowRiskDomains = new Set(['GENERAL_PREPAREDNESS', 'FOOD_STORAGE', 'COMMUNICATION', 'EVACUATION'])
const highRiskDomains = new Set(['MEDICAL', 'MEDICATION', 'FIRST_AID_PROCEDURE', 'WATER_PURIFICATION', 'GENERATOR', 'COMBUSTION_CO', 'ELECTRICAL', 'RESCUE', 'SHELTER_STRUCTURAL', 'OTHER_SEVERE_HARM'])
const allowedRiskDomains = new Set([...lowRiskDomains, ...highRiskDomains])

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

export async function validateKnowledge(data) {
  const { briefs, candidates, evidence, topics, guides, stories, config, base } = data
  fail(config.publication_mode === 'PR_ONLY', 'V1 only supports PR_ONLY')
  fail(/^https:\/\/[^/]+$/.test(config.site_origin), 'invalid site origin')
  const ids = new Set(), slugs = new Set(), topicIds = new Set()
  const guideIds = new Set(), storyIds = new Set()
  for (const guide of guides) {
    fail(nonempty(guide.id) && !guideIds.has(guide.id) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug) && nonempty(guide.title) && ['DRAFT', 'PUBLISHED'].includes(guide.status), 'invalid guide registry')
    if (guide.status === 'PUBLISHED') fail((await stat(join(base, 'archive/web/public/knowledge/guides', guide.slug, 'index.html')).catch(() => null))?.isFile(), `broken guide ${guide.id}`)
    guideIds.add(guide.id)
  }
  for (const story of stories) {
    fail(nonempty(story.id) && !storyIds.has(story.id) && nonempty(story.title) && /^\/[^/]/.test(story.path) && story.verified === true && /^archive\/content\/transcripts\/C03-AFTERFALL\//.test(story.source_manifest_ref), 'invalid story registry')
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
        fail(['prose', 'table', 'ordered_list', 'unordered_list', 'note', 'download/tool'].includes(block.type), `${brief.id} block type`)
        if (['prose', 'note'].includes(block.type)) fail(nonempty(block.text), `${brief.id} block text`)
        if (block.type === 'table') fail(Array.isArray(block.headers) && block.headers.length > 0 && Array.isArray(block.rows) && block.rows.every((row) => row.length === block.headers.length), `${brief.id} table`)
        if (block.type.endsWith('list')) fail(Array.isArray(block.items) && block.items.length > 0, `${brief.id} list`)
        if (block.type === 'download/tool') fail(brief.tools.some((tool) => tool.path === block.tool_path), `${brief.id} tool block`)
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
    fail(/^archive\/content\/transcripts\/C03-AFTERFALL\/S\d{2,3}\/SESSION_\d{3}\/SOURCE_MANIFEST\.json$/.test(candidate.source_manifest_ref) && /^[a-f0-9]{64}$/.test(candidate.source_manifest_sha256), `${candidate.id} public source identity`)
    fail(['DISCOVERED', 'HOLD', 'HUMAN_REVIEW', 'BRIEF_PROPOSED'].includes(candidate.status) && nonempty(candidate.disposition_note), `${candidate.id} disposition`)
    fail(candidate.brief_id == null || ids.has(candidate.brief_id), `${candidate.id} brief ref`)
  }
  fail(evidence.size === briefs.length, 'orphan evidence')
  return true
}

export function publicationEligibility(brief, pack, config) {
  if (config.publication_mode !== 'PR_ONLY') return 'HOLD'
  if (!pack || !Array.isArray(pack.claims) || !pack.claims.length || !brief.sources?.length || !brief.source_checked_at) return 'HOLD'
  if (pack.conflicts?.length || pack.unknowns?.length || pack.copyright_status !== 'CLEAR' || pack.story_source_status === 'UNCLEAR') return 'HOLD'
  if (brief.content_type !== 'BRIEF' || brief.risk_level !== 'LOW' || brief.publication_policy !== 'AUTO_LOW_RISK') return 'HUMAN_REVIEW'
  if (!Array.isArray(brief.risk_domains) || brief.risk_domains.length === 0 || brief.risk_domains.some((domain) => !lowRiskDomains.has(domain))) return 'HUMAN_REVIEW'
  if (brief.semantic_qa_status !== 'PASS' || !['READY', 'PUBLISHED'].includes(brief.status)) return 'HUMAN_REVIEW'
  return 'AUTO_PUBLISH_ELIGIBLE'
}
