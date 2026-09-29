import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  compileIllustrationImagePrompt,
  compileIllustrationRendererText,
  ILLUSTRATION_IMAGE_PROMPT_VERSION,
  validateIllustrationImagePrompt,
} from './illustration-image-prompt.mjs'

const catalogPath = fileURLToPath(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url))
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const pointFor = (subjectId) => {
  const point = catalog.points.find((item) => item.subject_id === subjectId)
  assert.ok(point, `Missing fixture point: ${subjectId}`)
  return point
}

test('Taehoon prompt contains only the requested appearance and AFTERFALL portrait direction', () => {
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'))
  assert.equal(prompt.contract_version, ILLUSTRATION_IMAGE_PROMPT_VERSION)
  assert.equal(prompt.subject_id, 'char-taehoon')
  for (const phrase of [
    '40대 초반', '한국 남성', '175cm 안팎', '작고 단단한 체형', '각진 얼굴', '햇볕에 거칠어진 피부',
    '짧게 친 검은 머리에 옆머리 새치', '낡은 남색 작업조끼', '거친 손',
    'single-subject master portrait', 'simple non-identifying background', 'AFTERFALL_ARCHIVE_V1',
    '회화적 반실사', 'painterly semi-realistic',
  ]) assert.ok(prompt.positive_prompt.includes(phrase), `Missing prompt fact: ${phrase}`)
  for (const phrase of [
    'no military history', 'no military uniform', 'no firearms', 'no tactical equipment', 'no rank insignia',
    'no scars', 'no tattoos', 'no added accessories', 'no invented occupation', 'no additional people',
    'no identifiable location',
  ]) assert.ok(prompt.negative_prompt.includes(phrase), `Missing visual exclusion: ${phrase}`)
  assert.doesNotMatch(prompt.positive_prompt, /military|uniform|firearm|tactical|rank|scar|tattoo|accessor|occupation|other people|location/i)
  assert.doesNotMatch(`${prompt.positive_prompt} ${prompt.negative_prompt} ${prompt.review_checklist.join(' ')}`, /github|supabase|netlify|workflow|provider|storage|registry|handoff|scheduler|automation|json|sha|\bci\b|\bpr\b|api|deploy|receipt/i)
})

test('Baekun prompt preserves its accepted visual exclusions without changing its state', async () => {
  const identityPath = fileURLToPath(new URL('../../content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_BAEKUN.json', import.meta.url))
  const before = await readFile(identityPath)
  const prompt = compileIllustrationImagePrompt(pointFor('loc-baekun'))
  const after = await readFile(identityPath)
  assert.deepEqual(after, before)
  for (const phrase of [
    'no vegetation', 'no trees', 'no shrubs', 'no grass', 'no vines', 'no moss', 'no ivy', 'no overgrowth',
    'no invented weather', 'no readable signs', 'no invented security details', 'no invented layout details',
  ]) assert.ok(prompt.negative_prompt.includes(phrase), `Missing Baekun exclusion: ${phrase}`)
})

test('required embedded-text and interface exclusions are present in every prompt', () => {
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'))
  for (const phrase of [
    'no text', 'no readable writing', 'no labels', 'no numbers', 'no UI', 'no interface', 'no dashboard',
    'no infographic', 'no table', 'no report layout', 'no poster layout', 'no watermark',
  ]) assert.ok(prompt.negative_prompt.includes(phrase), `Missing default exclusion: ${phrase}`)
})

test('operational context in any visual input fails closed', () => {
  const operationalTerms = [
    'GitHub', 'Supabase', 'Netlify', 'workflow', 'provider', 'storage', 'registry', 'handoff', 'scheduler',
    'automation', 'report', 'dashboard', 'JSON', 'SHA', 'CI', 'PR', 'API', 'deploy', 'receipt',
  ]
  for (const term of operationalTerms) {
    const point = structuredClone(pointFor('char-taehoon'))
    point.brief.art_direction.theme = `Quiet survival with ${term}`
    assert.throws(() => compileIllustrationImagePrompt(point), /ILLUSTRATION_PROMPT_OPERATIONAL_CONTEXT_REJECTED/, term)
  }
})

test('unknown or malformed visual briefs fail closed', () => {
  const missing = structuredClone(pointFor('char-taehoon'))
  delete missing.brief.art_direction.rendering
  assert.throws(() => compileIllustrationImagePrompt(missing), /INVALID_ILLUSTRATION_VISUAL_BRIEF/)

  const unknown = structuredClone(pointFor('char-taehoon'))
  unknown.brief.version = 'visual-brief-v99'
  assert.throws(() => compileIllustrationImagePrompt(unknown), /INVALID_ILLUSTRATION_VISUAL_BRIEF/)

  const mismatchedSubject = structuredClone(pointFor('char-taehoon'))
  mismatchedSubject.brief.subject.node_id = 'char-other'
  assert.throws(() => compileIllustrationImagePrompt(mismatchedSubject), /INVALID_ILLUSTRATION_VISUAL_BRIEF/)
})

test('provider prompt validation rejects extra operational fields and contaminated text', () => {
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'))
  assert.strictEqual(validateIllustrationImagePrompt(structuredClone(prompt)).contract_version, prompt.contract_version)
  assert.throws(() => validateIllustrationImagePrompt({ ...prompt, provider: 'native_chatgpt' }), /INVALID_ILLUSTRATION_IMAGE_PROMPT/)
  assert.throws(() => validateIllustrationImagePrompt({ ...prompt, positive_prompt: `${prompt.positive_prompt}. Netlify.` }), /ILLUSTRATION_PROMPT_OPERATIONAL_CONTEXT_REJECTED/)
})


test('renderer text is visual-only and omits operational/report vocabulary', () => {
  const text = compileIllustrationRendererText(pointFor('char-taehoon'))
  for (const phrase of [
    '40대 초반', '한국 남성', '낡은 남색 작업조끼', '회화적 반실사',
    '글자, 숫자, 라벨, 워터마크 또는 인터페이스 요소는 넣지 않는다',
  ]) assert.ok(text.includes(phrase), `Missing renderer phrase: ${phrase}`)
  assert.doesNotMatch(text, /github|supabase|netlify|workflow|provider|storage|registry|handoff|scheduler|automation|report|dashboard|json|sha|\bci\b|\bpr\b|api|deploy|receipt/i)
  assert.ok(text.length < 6000)
})
