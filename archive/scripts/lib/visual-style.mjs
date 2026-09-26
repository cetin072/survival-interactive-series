/** One shared art direction. Style choices are not new facts about the world. */
const freeze = (value) => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
export const VISUAL_STYLE = freeze({
  id: 'AFTERFALL_ARCHIVE_V1', brief_version: 'afterfall-visual-brief-v1',
  rendering: ['non-photorealistic painterly illustration', 'realistic human proportions',
    'believable contemporary Korean environment', 'quiet cinematic composition',
    'low-to-medium saturation', 'natural light', 'atmospheric depth and negative space'],
  theme: 'Small humans in a beautiful, vast damaged world; quiet survival, not spectacle.',
  avoid: ['embedded typography, labels or numbers', 'generic zombie poster',
    'cyberpunk neon by default', 'Mad Max brown desert by default',
    'glossy tactical poster', 'automatic guns, explosions, corpses or gore',
    'magic, medieval buildings or fantasy creatures', 'invented identifying features'],
  moods: {
    QUIET_DECAY: ['cool blue-gray', 'quiet lived-in survival atmosphere; no invented decay or vegetation'],
    VAST_WORLD: ['wide composition', 'small anonymous human silhouettes', 'awe and quiet distance'],
    RED_HORIZON: ['cool base palette', 'red/orange horizon accent only when explicitly present in the public source'],
    QUIET_FANTASY: ['lyrical landscape sensibility', 'soft natural light and atmospheric perspective',
      'no magical or medieval objects; weather and vegetation follow source facts'],
  },
})
export function selectVisualMood(pointType, tags = []) {
  // Explicit source tags, not the current season or private plot, choose variants.
  if (tags.some((t) => ['RED_HORIZON', '붉은하늘', '붉은노을'].includes(t))) return 'RED_HORIZON'
  if (pointType === 'CHARACTER') return 'QUIET_DECAY'
  if (tags.some((t) => ['봄전환', '봄', '해빙', 'QUIET_FANTASY'].includes(t))) return 'QUIET_FANTASY'
  if (tags.some((t) => ['VAST_WORLD', '광역풍경', '거대한공간'].includes(t))) return 'VAST_WORLD'
  return 'QUIET_DECAY'
}
export function artDirection(pointType, tags) {
  const mood = selectVisualMood(pointType, tags)
  return {
    style_version: VISUAL_STYLE.id, brief_version: VISUAL_STYLE.brief_version, mood,
    rendering: [...VISUAL_STYLE.rendering], theme: VISUAL_STYLE.theme,
    mood_rules: [...VISUAL_STYLE.moods[mood]], avoid: [...VISUAL_STYLE.avoid],
    composition: pointType === 'CHARACTER' ? 'single-subject master portrait; simple non-identifying background'
      : pointType === 'MAP' ? 'decorative atmosphere layer only; no map geometry or text'
      : 'wide environmental illustration; no close-up identities unless explicitly sourced',
  }
}
