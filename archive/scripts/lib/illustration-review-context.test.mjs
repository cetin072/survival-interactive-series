import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  buildIllustrationReviewContext,
  illustrationReviewContextSha256,
  ILLUSTRATION_REVIEW_CONTEXT_VERSION,
} from './illustration-review-context.mjs'

const catalog = JSON.parse(await readFile(
  fileURLToPath(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url)), 'utf8',
))
const profiles = JSON.parse(await readFile(
  fileURLToPath(new URL('../../content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json', import.meta.url)), 'utf8',
))
const pointFor = (subjectId) => catalog.points.find((point) => point.subject_id === subjectId)
const profileFor = (subjectId) => profiles.records.find((profile) => profile.node_id === subjectId)

test('same point and rich profile produce the same deterministic review-context hash', () => {
  const point = pointFor('char-jinwoo')
  const profile = profileFor('char-jinwoo')
  const first = buildIllustrationReviewContext(point, profile)
  const second = buildIllustrationReviewContext(structuredClone(point), structuredClone(profile))
  assert.equal(first.review_context_version, ILLUSTRATION_REVIEW_CONTEXT_VERSION)
  assert.equal(first.review_context_sha256, second.review_context_sha256)
  assert.deepEqual(first.review_context, second.review_context)
  assert.equal(illustrationReviewContextSha256(first.review_context), first.review_context_sha256)
  assert.equal(first.review_context.cue_semantics.render_cues, 'ALLOWED_NOT_REQUIRED_NOT_NEW_CANON')
})

test('changing one rich render cue changes the immutable review-context hash', () => {
  const point = pointFor('char-jinwoo')
  const profile = structuredClone(profileFor('char-jinwoo'))
  const first = buildIllustrationReviewContext(point, profile)
  profile.render_cues[0] = profile.render_cues[0] + ' 보강'
  const second = buildIllustrationReviewContext(point, profile)
  assert.notEqual(first.review_context_sha256, second.review_context_sha256)
})

test('subject and type mismatches fail closed', () => {
  const point = pointFor('char-jinwoo')
  const wrongSubject = structuredClone(profileFor('char-seojin'))
  assert.throws(() => buildIllustrationReviewContext(point, wrongSubject),
    /ILLUSTRATION_REVIEW_PROFILE_SUBJECT_MISMATCH/)

  const wrongType = structuredClone(profileFor('char-jinwoo'))
  wrongType.type = 'location'
  assert.throws(() => buildIllustrationReviewContext(point, wrongType),
    /ILLUSTRATION_REVIEW_PROFILE_TYPE_MISMATCH/)
})

test('reference profiles cannot become Automation B render contexts', () => {
  const reference = profiles.records.find((profile) => profile.type === 'reference')
  const fakePoint = {
    point_id: 'point-' + 'a'.repeat(64),
    generation_key: 'generation-' + 'b'.repeat(64),
    subject_id: reference.node_id,
    brief: { point_type: 'REFERENCE', subject: { node_id: reference.node_id }, canon_facts: {}, safeguards: [] },
  }
  assert.throws(() => buildIllustrationReviewContext(fakePoint, reference),
    /ILLUSTRATION_REVIEW_POINT_INVALID|ILLUSTRATION_REVIEW_BRIEF_INVALID/)
})
