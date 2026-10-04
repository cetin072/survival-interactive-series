import { reviewContextRenderCues } from './illustration-review-context.mjs'

export const ILLUSTRATION_IMAGE_PROMPT_VERSION = 'illustration-image-prompt-v1'

const POINT_ID = /^point-[a-f0-9]{64}$/
const GENERATION_KEY = /^generation-[a-f0-9]{64}$/
const SUBJECT_ID = /^[a-z][a-z0-9-]{1,79}$/
const STYLE_VERSION = 'AFTERFALL_ARCHIVE_V1'
const OPERATIONAL_TERM = /\b(github|supabase|netlify|workflow|provider|storage|registry|handoff|scheduler|automation|report|dashboard|json|sha|ci|pr|api|deploy|receipt)\b/i
const GENERATION_META_TERM = /(?:AFTERFALL|생존일기|시즌(?:\s*\d+)?|\bchronicle\b(?:\s*\d+)?|\bseason\b(?:\s*\d+)?|\bpost[-\s]?apocalyptic\b|\bapocalypse\b)/i
const NEGATING_RENDER_CUE = /(?:아니라|아닌|추가하지|사용하지|식별되지|과장하지|제외|금지|넣지|보이지 않|읽을 수 있는[^.;]*없이|\bno\b|\bwithout\b|\bdo not\b|\bnever\b|\bexclude\w*\b|\bforbid\w*\b)/i
const NEGATING_RENDER_STYLE = /(?:\bnon-photorealistic\b|\bno\b|\bwithout\b|\bdo not\b|\bnever\b)/i
const SHARED_RENDER_GUIDANCE = [
  '배경의 글자·간판·표지판·안내문은 장면의 핵심 요소가 되지 않도록 최소화한다',
  '불필요한 읽을 수 있는 문구, 브랜드명, 지명, 숫자, 광고 문구를 새로 만들어 넣지 않는다',
  '필요한 생활 표식은 작고 비식별적인 배경 요소로만 표현한다',
  '사진처럼 과도하게 사실적인 렌더링보다 붓터치와 회화성이 분명하게 느껴지는 painterly illustration을 유지한다',
].join('. ')

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const requireRecord = (value) => {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
  return value
}

function requireText(value, { maxLength = 2000 } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
  }
  return value.trim()
}

function requireTextList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
  return value.map((item) => requireText(item))
}

function assertNoOperationalText(value) {
  if (OPERATIONAL_TERM.test(value)) throw new Error('ILLUSTRATION_PROMPT_OPERATIONAL_CONTEXT_REJECTED')
}

function assertNoGenerationMetaText(value) {
  if (GENERATION_META_TERM.test(value)) throw new Error('ILLUSTRATION_PROMPT_WORLD_META_REJECTED')
}

function visualFactValues(value) {
  if (typeof value === 'string') {
    const text = requireText(value)
    assertNoOperationalText(text)
    return [text]
  }
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
    return value.flatMap((item) => visualFactValues(item))
  }
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
  return Object.keys(value).sort().flatMap((key) => visualFactValues(value[key]))
}

function dedupeText(values) {
  return [...new Set(values.map((value) => requireText(value)))]
}

function positiveReviewCues(source, reviewContextBundle, { required = false } = {}) {
  const cues = reviewContextRenderCues(source, reviewContextBundle)
  if (required && cues.length === 0) throw new Error('ILLUSTRATION_RENDER_CONTEXT_REQUIRED')
  for (const cue of cues) {
    assertNoOperationalText(cue)
    if (NEGATING_RENDER_CUE.test(cue)) throw new Error('ILLUSTRATION_RENDER_CUE_MUST_BE_POSITIVE')
  }
  return cues
}

function positiveStyleDescriptors(art) {
  const moodRules = requireTextList(art.mood_rules)
  const rendering = requireTextList(art.rendering)
  for (const text of [...moodRules, ...rendering]) assertNoOperationalText(text)

  const positiveMood = moodRules.filter((text) => !NEGATING_RENDER_CUE.test(text))
  const positiveRendering = rendering.filter((text) => !NEGATING_RENDER_STYLE.test(text))
  return dedupeText([
    ...positiveMood,
    '회화적 반실사',
    '붓터치가 느껴지는 현대적 painterly illustration',
    ...positiveRendering,
  ])
}

function validateBriefStructure(source) {
  if (!POINT_ID.test(source.point_id ?? '') || !GENERATION_KEY.test(source.generation_key ?? '')
    || !SUBJECT_ID.test(source.subject_id ?? '')) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')

  const brief = requireRecord(source.brief)
  const subject = requireRecord(brief.subject)
  const canonFacts = requireRecord(brief.canon_facts)
  const art = requireRecord(brief.art_direction)
  const composition = requireText(art.composition)
  const mood = requireText(art.mood)
  const theme = requireText(art.theme)
  const moodRules = requireTextList(art.mood_rules)
  const rendering = requireTextList(art.rendering)
  const avoid = requireTextList(art.avoid)
  const safeguards = requireTextList(brief.safeguards)
  const subjectLabel = requireText(subject.label)

  if (brief.version !== 'visual-brief-v1' || !['CHARACTER', 'LOCATION', 'EVENT'].includes(brief.point_type)
    || subject.node_id !== source.subject_id || art.style_version !== STYLE_VERSION) {
    throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')
  }

  const factValues = visualFactValues(canonFacts)
  if (factValues.length === 0) throw new Error('INVALID_ILLUSTRATION_VISUAL_BRIEF')

  for (const text of [
    subjectLabel, composition, mood, theme, ...moodRules, ...rendering, ...avoid, ...safeguards,
  ]) assertNoOperationalText(text)

  return { brief, art, factValues }
}

function compileCharacterPositiveText(source, brief, art, reviewContextBundle, { requireContext = false } = {}) {
  const cues = positiveReviewCues(source, reviewContextBundle, { required: requireContext })
  const details = dedupeText([...visualFactValues(brief.canon_facts), ...cues])
  const style = positiveStyleDescriptors(art)

  return [
    '현대 한국 생활권의 한 인물을 그린 단독 인물화',
    `확인된 외형과 허용된 표현 범위: ${details.join('; ')}`,
    '한 사람만 화면의 중심에 두고 실제 생활자처럼 편안하고 자연스러운 자세와 표정을 보여준다',
    '배경은 단순하고 중립적인 현대 한국 생활공간으로 두며 얼굴, 체형, 옷감과 손의 사용감이 자연스럽게 드러나게 한다',
    `빛·색감·화풍: ${style.join('; ')}`,
  ].join('. ')
}

function compileLocationPositiveText(source, brief, art, reviewContextBundle, { requireContext = false } = {}) {
  const cues = positiveReviewCues(source, reviewContextBundle, { required: requireContext })
  const visualFacts = brief.visual_facts === undefined
    ? []
    : visualFactValues(requireRecord(brief.visual_facts))
  const details = dedupeText([...visualFacts, ...cues])
  const style = positiveStyleDescriptors(art)

  return [
    '현대 한국 생활권의 넓은 환경 일러스트레이션',
    details.length
      ? `장면에 보이는 구체적 요소: ${details.join('; ')}`
      : '시설과 생활 흔적을 단순하고 절제된 범위로 보여주는 넓은 환경 장면',
    '전경·중경·후경이 자연스럽게 이어지고 시설, 작업 흔적, 생활 소품이 실제 사용 공간처럼 배치된다',
    '사람이 필요한 경우에는 아주 작은 비식별 배경 인물만 두어 환경의 규모와 생활감을 보조한다',
    `빛·색감·화풍: ${style.join('; ')}`,
  ].join('. ')
}

function compileEventPositiveText(source, brief, art, reviewContextBundle, { requireContext = false } = {}) {
  const cues = positiveReviewCues(source, reviewContextBundle, { required: requireContext })
  const style = positiveStyleDescriptors(art)

  return [
    '현대 한국 생활권의 사건을 한 순간의 현실적인 환경 장면으로 보여주는 일러스트레이션',
    cues.length
      ? `장면에 보이는 구체적 요소: ${cues.join('; ')}`
      : '실제 공간, 생활 소품, 사람의 행동과 환경 변화가 중심인 절제된 사건 장면',
    '사건의 의미는 실제 공간과 생활 흔적의 변화로 전달하고 장면 자체가 자연스럽게 상황을 설명하게 한다',
    '인물은 장면 이해에 필요한 수만 작고 자연스럽게 배치해 환경과 행동이 함께 보이게 한다',
    `빛·색감·화풍: ${style.join('; ')}`,
  ].join('. ')
}

function compilePositiveText(source, reviewContextBundle, { requireContext = false } = {}) {
  const { brief, art } = validateBriefStructure(source)
  const sceneText = brief.point_type === 'CHARACTER'
    ? compileCharacterPositiveText(source, brief, art, reviewContextBundle, { requireContext })
    : brief.point_type === 'LOCATION'
      ? compileLocationPositiveText(source, brief, art, reviewContextBundle, { requireContext })
      : compileEventPositiveText(source, brief, art, reviewContextBundle, { requireContext })
  return `${sceneText}. ${SHARED_RENDER_GUIDANCE}`
}

function assertNoOutputContamination(positivePrompt, negativePrompt, checklist) {
  assertNoOperationalText(positivePrompt)
  assertNoOperationalText(negativePrompt)
  assertNoGenerationMetaText(positivePrompt)
  assertNoGenerationMetaText(negativePrompt)
  for (const item of checklist) {
    assertNoOperationalText(item)
    assertNoGenerationMetaText(item)
  }
}

export function compileIllustrationRendererText(point, reviewContextBundle = null) {
  const source = requireRecord(point)
  const positiveText = compilePositiveText(source, reviewContextBundle, { requireContext: true })
  const text = positiveText

  assertNoOperationalText(text)
  assertNoGenerationMetaText(text)
  if (text.length < 40 || text.length > 6000) throw new Error('ILLUSTRATION_RENDERER_PROMPT_LENGTH_INVALID')
  return text
}

export function validateIllustrationImagePrompt(prompt) {
  const contract = requireRecord(prompt)
  const expectedKeys = [
    'contract_version', 'generation_key', 'negative_prompt', 'point_id', 'positive_prompt', 'review_checklist', 'subject_id',
  ]
  if (Object.keys(contract).sort().join('|') !== expectedKeys.join('|')
    || contract.contract_version !== ILLUSTRATION_IMAGE_PROMPT_VERSION
    || !POINT_ID.test(contract.point_id ?? '')
    || !GENERATION_KEY.test(contract.generation_key ?? '')
    || !SUBJECT_ID.test(contract.subject_id ?? '')) {
    throw new Error('INVALID_ILLUSTRATION_IMAGE_PROMPT')
  }
  const positivePrompt = requireText(contract.positive_prompt, { maxLength: 12000 })
  if (typeof contract.negative_prompt !== 'string' || contract.negative_prompt.length > 12000) {
    throw new Error('INVALID_ILLUSTRATION_IMAGE_PROMPT')
  }
  const negativePrompt = contract.negative_prompt
  const checklist = requireTextList(contract.review_checklist)
  assertNoOutputContamination(positivePrompt, negativePrompt, checklist)
  return contract
}

export function compileIllustrationImagePrompt(point, reviewContextBundle = null) {
  const source = requireRecord(point)
  validateBriefStructure(source)

  const positivePrompt = compilePositiveText(source, reviewContextBundle)
  const negativePrompt = ''
  const reviewChecklist = [
    'match visible appearance or scene facts to the stored Canon and allowed render cues',
    'treat rich render cues as optional depiction choices rather than mandatory new Canon',
    'keep a painterly semi-realistic direction with believable contemporary Korean material culture',
    'incidental text, numbers, labels, signage, watermark-like marks or UI are not automatic rejection reasons when coherent and non-dominant; reject only malformed or intrusive artifacts or unsupported story claims',
  ]

  return validateIllustrationImagePrompt({
    contract_version: ILLUSTRATION_IMAGE_PROMPT_VERSION,
    point_id: source.point_id,
    generation_key: source.generation_key,
    subject_id: source.subject_id,
    positive_prompt: positivePrompt,
    negative_prompt: negativePrompt,
    review_checklist: reviewChecklist,
  })
}
