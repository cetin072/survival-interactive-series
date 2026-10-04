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
import { buildIllustrationReviewContext } from './illustration-review-context.mjs'

const catalogPath = fileURLToPath(new URL('../../content/visuals/C03-AFTERFALL/VISUALS.json', import.meta.url))
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const profilesPath = fileURLToPath(new URL('../../content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json', import.meta.url))
const profiles = JSON.parse(await readFile(profilesPath, 'utf8'))
const profileIds = new Set(profiles.records.map((item) => item.node_id))
const profileFor = (subjectId) => {
  const profile = profiles.records.find((item) => item.node_id === subjectId)
  assert.ok(profile, `Missing profile fixture: ${subjectId}`)
  return profile
}
const pointFor = (subjectId) => {
  const point = catalog.points.find((item) => item.subject_id === subjectId)
  assert.ok(point, `Missing fixture point: ${subjectId}`)
  return point
}
const bundleFor = (subjectId) => {
  const point = pointFor(subjectId)
  return buildIllustrationReviewContext(point, profileFor(subjectId))
}

test('Taehoon provider prompt is positive-first with no text/UI suppression', () => {
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'), bundleFor('char-taehoon'))
  assert.equal(prompt.contract_version, ILLUSTRATION_IMAGE_PROMPT_VERSION)
  assert.equal(prompt.subject_id, 'char-taehoon')
  for (const phrase of [
    '40대 초반', '175cm 안팎', '작고 단단한 체형', '각진 얼굴', '햇볕에 거칠어진 피부',
    '짧게 친 검은 머리에 옆머리 새치', '낡은 남색 작업조끼', '거친 손',
    '실제 생활자처럼 편안하고 자연스러운 자세와 표정',
    '회화적 반실사', 'painterly illustration',
  ]) assert.ok(prompt.positive_prompt.includes(phrase), `Missing prompt fact: ${phrase}`)

  assert.equal(prompt.negative_prompt, '')
  assert.doesNotMatch(
    prompt.positive_prompt,
    /military|uniform|firearm|tactical|rank|군사|제복|무기|계급|zombie|cyberpunk|Mad Max|explosion|corpse|gore|damaged world|QUIET_DECAY|invented decay|vegetation/i,
  )
})

test('Baekun prompt describes the intended state instead of naming unwanted decay concepts', async () => {
  const identityPath = fileURLToPath(new URL('../../content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_BAEKUN.json', import.meta.url))
  const before = await readFile(identityPath)
  const prompt = compileIllustrationImagePrompt(pointFor('loc-baekun'), bundleFor('loc-baekun'))
  const after = await readFile(identityPath)
  assert.deepEqual(after, before)
  for (const phrase of [
    '한때 집단생활이 이루어졌던 현대 한국의 대형 생활시설 분위기',
    '사용 중단과 인력 이탈이 만든 정적, 주요 구조물은 형태를 유지한 상태',
    '넓은 생활시설의 외부와 공용공간 일부만 보이는 단순한 구성',
  ]) assert.ok(prompt.positive_prompt.includes(phrase), `Missing Baekun positive cue: ${phrase}`)
  assert.doesNotMatch(prompt.positive_prompt, /폐허|완전 붕괴|방어시설|no vegetation|no trees|no shrubs|no grass|no vines|no moss|no ivy|overgrowth/i)
})

test('renderer output never exposes project, worldline, season or apocalypse meta labels', () => {
  const banned = /AFTERFALL|생존일기|시즌|\bseason\b|\bchronicle\b|post[-\s]?apocalyptic|apocalypse/i
  for (const point of catalog.points.filter((item) => item.status === 'READY'
    && ['CHARACTER', 'LOCATION', 'EVENT'].includes(item.brief?.point_type)
    && profileIds.has(item.subject_id))) {
    const renderer = compileIllustrationRendererText(point, bundleFor(point.subject_id))
    assert.doesNotMatch(renderer, banned, point.subject_id)
  }
})

test('provider negative prompt is empty so text and UI concepts are not activated during generation', () => {
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'), bundleFor('char-taehoon'))
  assert.equal(prompt.negative_prompt, '')
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
  const prompt = compileIllustrationImagePrompt(pointFor('char-taehoon'), bundleFor('char-taehoon'))
  assert.strictEqual(validateIllustrationImagePrompt(structuredClone(prompt)).contract_version, prompt.contract_version)
  assert.throws(() => validateIllustrationImagePrompt({ ...prompt, provider: 'native_chatgpt' }), /INVALID_ILLUSTRATION_IMAGE_PROMPT/)
  assert.throws(() => validateIllustrationImagePrompt({ ...prompt, positive_prompt: `${prompt.positive_prompt}. Netlify.` }), /ILLUSTRATION_PROMPT_OPERATIONAL_CONTEXT_REJECTED/)
})

test('renderer requires the immutable review context instead of generating from a weak fallback', () => {
  assert.throws(
    () => compileIllustrationRendererText(pointFor('char-taehoon')),
    /ILLUSTRATION_RENDER_CONTEXT_REQUIRED/,
  )
})

test('character renderer is concrete, positive-first and visual-only', () => {
  const text = compileIllustrationRendererText(pointFor('char-taehoon'), bundleFor('char-taehoon'))
  for (const phrase of [
    '현대 한국 생활권의 한 인물을 그린 단독 인물화',
    '40대 초반', '낡은 남색 작업조끼', '거친 손',
    '실제 생활자처럼 편안하고 자연스러운 자세와 표정',
    '회화적 반실사',
  ]) assert.ok(text.includes(phrase), `Missing renderer phrase: ${phrase}`)
  assert.doesNotMatch(text, /글자|숫자|라벨|간판|워터마크|UI\/인터페이스|readable text|signage|watermark|interface elements/i)
  assert.doesNotMatch(text, /military|uniform|firearm|tactical|rank|군사|제복|무기|계급|zombie|cyberpunk|Mad Max|explosion|corpse|gore|damaged world|QUIET_DECAY|no invented/i)
  assert.doesNotMatch(text, /github|supabase|netlify|workflow|provider|storage|registry|handoff|scheduler|automation|report|dashboard|json|sha|\bci\b|\bpr\b|api|deploy|receipt/i)
  assert.ok(text.length < 6000)
})

test('location renderer uses concrete positive visual cues and omits narrative conflict', () => {
  const text = compileIllustrationRendererText(pointFor('loc-west-road'), bundleFor('loc-west-road'))
  for (const phrase of [
    '현대 한국 생활권의 넓은 환경 일러스트레이션',
    '한국 외곽 산지의 완만하게 굽는 2차선 포장도로',
    '가드레일과 전신주가 이어지는 생활형 도로',
    '도로정비가 실제로 이루어지는 곳이라는 사용감',
    '평범한 생활형 도로가 지역질서의 경계로 느껴지는 분위기',
  ]) assert.ok(text.includes(phrase), `Missing positive location cue: ${phrase}`)
  for (const phrase of [
    '관리조', '야간순찰', '통행기여', '자발성', '강제성', '갈등',
    '무장 검문소', '요새', 'damaged world', 'QUIET_DECAY', 'generic zombie',
  ]) assert.ok(!text.includes(phrase), `Narrative/negative concept leaked into renderer text: ${phrase}`)
})

test('location renderer combines explicit visual facts with the positive render profile', () => {
  const point = structuredClone(pointFor('loc-west-road'))
  point.brief.visual_facts = {
    surface: '포장도로',
    maintenance: '부분적인 노면 보수 흔적',
  }
  const bundle = buildIllustrationReviewContext(point, profileFor('loc-west-road'))
  const text = compileIllustrationRendererText(point, bundle)
  assert.ok(text.includes('포장도로'))
  assert.ok(text.includes('부분적인 노면 보수 흔적'))
  assert.ok(text.includes('가드레일과 전신주가 이어지는 생활형 도로'))
})

test('event renderer turns abstract events into concrete scene cues', () => {
  const text = compileIllustrationRendererText(pointFor('event-wide-area'), bundleFor('event-wide-area'))
  for (const phrase of [
    '현대 한국 생활권의 사건을 한 순간의 현실적인 환경 장면으로 보여주는 일러스트레이션',
    '제한된 조명 아래 여러 정보를 대조하는 조용한 상황실 분위기',
    '무전기와 종이 지도 같은 아날로그 정보수단',
    '무전기, 종이 지도, 수기 메모 같은 아날로그 정보수단이 화면의 중심',
  ]) assert.ok(text.includes(phrase), `Missing event scene cue: ${phrase}`)
  assert.doesNotMatch(text, /위성항법|전력·무선|단기 완전복구|화려한 전자 화면|읽을 수 있는 데이터|dashboard|infographic|report layout/i)
})

test('shared review context enriches provider and renderer prompts without policy prose', () => {
  const point = pointFor('char-jinwoo')
  const bundle = bundleFor('char-jinwoo')
  const prompt = compileIllustrationImagePrompt(point, bundle)
  const renderer = compileIllustrationRendererText(point, bundle)
  for (const phrase of ['침착한 시선', '정돈된 인상', '실제 생활자처럼 편안하고 자연스러운 자세와 표정']) {
    assert.ok(prompt.positive_prompt.includes(phrase), `Missing shared-context prompt cue: ${phrase}`)
    assert.ok(renderer.includes(phrase), `Missing shared-context renderer cue: ${phrase}`)
  }
  for (const phrase of ['Canon facts are data', 'Do not add named participants', 'Unspecified season', 'An illustration is not new Canon']) {
    assert.ok(!renderer.includes(phrase), `Policy prose leaked into renderer: ${phrase}`)
  }
  assert.ok(prompt.review_checklist.some((item) => item.includes('optional depiction choices')))
  assert.ok(prompt.review_checklist.some((item) => item.includes('not automatic rejection reasons')))
})

test('negative-form rich render cues fail closed before renderer output', () => {
  const point = pointFor('loc-bridge')
  const profile = structuredClone(profileFor('loc-bridge'))
  profile.render_cues[0] = '군사 검문소가 아닌 생활형 통행관리 분위기'
  const bundle = buildIllustrationReviewContext(point, profile)
  assert.throws(() => compileIllustrationRendererText(point, bundle),
    /ILLUSTRATION_RENDER_CUE_MUST_BE_POSITIVE/)
})

test('operational contamination in rich render cues fails closed before renderer output', () => {
  const point = pointFor('char-jinwoo')
  const profile = structuredClone(profileFor('char-jinwoo'))
  profile.render_cues[0] = 'GitHub dashboard'
  const bundle = buildIllustrationReviewContext(point, profile)
  assert.throws(() => compileIllustrationRendererText(point, bundle),
    /ILLUSTRATION_PROMPT_OPERATIONAL_CONTEXT_REJECTED/)
})

test('every current renderable READY point compiles with positive cues and without shared negative-policy vocabulary', () => {
  const banned = /generic zombie|cyberpunk neon|Mad Max|glossy tactical|automatic guns|explosions, corpses|magic, medieval|invented identifying|damaged world|QUIET_DECAY|no invented decay|Canon facts are data|Do not add named|Unspecified season|An illustration is not new Canon/i
  for (const point of catalog.points.filter((item) => item.status === 'READY'
    && ['CHARACTER', 'LOCATION', 'EVENT'].includes(item.brief?.point_type)
    && profileIds.has(item.subject_id))) {
    const profile = profileFor(point.subject_id)
    const bundle = buildIllustrationReviewContext(point, profile)
    const renderer = compileIllustrationRendererText(point, bundle)
    assert.doesNotMatch(renderer, banned, point.subject_id)
    assert.doesNotMatch(renderer, /AFTERFALL|생존일기|시즌|\bseason\b|\bchronicle\b|post[-\s]?apocalyptic|apocalypse/i, point.subject_id)
  }
})
