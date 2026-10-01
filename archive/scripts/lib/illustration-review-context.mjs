import { createHash } from 'node:crypto'

export const ILLUSTRATION_REVIEW_CONTEXT_VERSION = 'illustration-review-context-v1'

const POINT_ID = /^point-[a-f0-9]{64}$/
const GENERATION_KEY = /^generation-[a-f0-9]{64}$/
const SUBJECT_ID = /^(?:char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*$/
const RENDERABLE_TYPES = new Set(['CHARACTER', 'LOCATION', 'EVENT'])

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const demand = (ok, code) => { if (!ok) throw new Error(code) }

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  demand(value === null || ['string', 'boolean'].includes(typeof value)
    || typeof value === 'number' && Number.isFinite(value), 'ILLUSTRATION_REVIEW_CONTEXT_NON_JSON')
  return value
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function canonicalIllustrationReviewContextJson(context) {
  demand(isRecord(context), 'ILLUSTRATION_REVIEW_CONTEXT_INVALID')
  return JSON.stringify(stable(context))
}

export function illustrationReviewContextSha256(context) {
  return createHash('sha256').update(canonicalIllustrationReviewContextJson(context)).digest('hex')
}

function validateProfile(point, profile) {
  demand(isRecord(profile), 'ILLUSTRATION_REVIEW_PROFILE_MISSING')
  demand(profile.node_id === point.subject_id, 'ILLUSTRATION_REVIEW_PROFILE_SUBJECT_MISMATCH')
  demand(profile.type === point.brief.point_type.toLowerCase(), 'ILLUSTRATION_REVIEW_PROFILE_TYPE_MISMATCH')
  demand(typeof profile.label === 'string' && profile.label.trim(), 'ILLUSTRATION_REVIEW_PROFILE_INVALID')
  demand(Array.isArray(profile.render_cues) && profile.render_cues.length > 0
    && profile.render_cues.every((cue) => typeof cue === 'string' && cue.trim()), 'ILLUSTRATION_REVIEW_PROFILE_INVALID')
  demand(typeof profile.canon_policy === 'string' && profile.canon_policy.trim(), 'ILLUSTRATION_REVIEW_PROFILE_INVALID')
  demand(typeof profile.source_note === 'string' && profile.source_note.trim(), 'ILLUSTRATION_REVIEW_PROFILE_INVALID')
}

export function buildIllustrationReviewContext(point, profile) {
  demand(isRecord(point) && POINT_ID.test(point.point_id ?? '')
    && GENERATION_KEY.test(point.generation_key ?? '')
    && SUBJECT_ID.test(point.subject_id ?? ''), 'ILLUSTRATION_REVIEW_POINT_INVALID')
  demand(isRecord(point.brief) && RENDERABLE_TYPES.has(point.brief.point_type)
    && isRecord(point.brief.subject) && point.brief.subject.node_id === point.subject_id
    && isRecord(point.brief.canon_facts)
    && Array.isArray(point.brief.safeguards), 'ILLUSTRATION_REVIEW_BRIEF_INVALID')
  validateProfile(point, profile)

  const reviewContext = {
    version: ILLUSTRATION_REVIEW_CONTEXT_VERSION,
    point_id: point.point_id,
    generation_key: point.generation_key,
    subject_id: point.subject_id,
    point_type: point.brief.point_type,
    visual_brief: cloneJson(point.brief),
    visual_profile: {
      node_id: profile.node_id,
      type: profile.type,
      label: profile.label,
      render_cues: cloneJson(profile.render_cues),
      canon_policy: profile.canon_policy,
      source_note: profile.source_note,
    },
    cue_semantics: {
      canon_facts: 'CONFIRMED_PUBLIC_CANON',
      render_cues: 'ALLOWED_NOT_REQUIRED_NOT_NEW_CANON',
    },
  }

  return {
    review_context_version: ILLUSTRATION_REVIEW_CONTEXT_VERSION,
    review_context: reviewContext,
    review_context_sha256: illustrationReviewContextSha256(reviewContext),
  }
}

export function assertIllustrationReviewContext(point, bundle) {
  demand(isRecord(bundle) && bundle.review_context_version === ILLUSTRATION_REVIEW_CONTEXT_VERSION
    && /^[a-f0-9]{64}$/.test(bundle.review_context_sha256 ?? '')
    && isRecord(bundle.review_context), 'ILLUSTRATION_REVIEW_CONTEXT_INVALID')
  const context = bundle.review_context
  demand(context.version === bundle.review_context_version
    && context.point_id === point.point_id
    && context.generation_key === point.generation_key
    && context.subject_id === point.subject_id
    && context.point_type === point.brief.point_type, 'ILLUSTRATION_REVIEW_CONTEXT_BINDING_MISMATCH')
  demand(illustrationReviewContextSha256(context) === bundle.review_context_sha256,
    'ILLUSTRATION_REVIEW_CONTEXT_HASH_MISMATCH')
  return bundle
}

export function reviewContextRenderCues(point, bundle) {
  if (bundle === null || bundle === undefined) return []
  assertIllustrationReviewContext(point, bundle)
  const cues = bundle.review_context.visual_profile?.render_cues
  demand(Array.isArray(cues) && cues.every((cue) => typeof cue === 'string' && cue.trim()),
    'ILLUSTRATION_REVIEW_CONTEXT_INVALID')
  return cues.map((cue) => cue.trim())
}
