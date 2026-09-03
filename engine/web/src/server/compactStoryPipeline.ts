import type { JsonValue, PartyMemberId } from '../state/liveState'
import type { GMProposal } from '../runtime/gmProposal'
import type { GMProviderTurnRequest } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import type { QueuedAction } from '../validator/types'

const PARTY_IDS = new Set<PartyMemberId>(['player', 'wife', 'son', 'father'])
const MAX_HINTS = 6
const MAX_TIME_DELTA_MIN = 180
const MAX_SIGNALS = 6
const MAX_OPEN_THREADS = 4
const MAX_RECENT_STORY_MEMORY = 3
const MAX_STORY_MEMORY_CHARS = 900

export type StoryStateHint =
  | { kind: 'time'; minutes: number }
  | { kind: 'move'; entity: string; to: string }
  | { kind: 'resource'; resource_id: string; to: string }
  | { kind: 'base_capability'; base_id: string; add: string }
  | { kind: 'signal'; text: string }

export type ActionResolution = {
  status: 'attempted' | 'completed' | 'partial' | 'blocked'
  summary: string
}

export type CompactStoryCandidate = {
  story: string
  choices: string[]
  state_hints: StoryStateHint[]
  action_resolution?: ActionResolution
  open_threads?: string[]
}

export type StoryQualityIssue = 'missing_action_resolution' | 'action_not_grounded' | 'repeated_scene' | 'internal_repetition'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function choiceLabel(checkpoint: PublicRuntimeCheckpoint, id: number): string {
  return checkpoint.current_scene.choices.find((choice) => choice.id === id)?.label ?? `선택 ${id}`
}

function playerAction(request: GMProviderTurnRequest) {
  const { checkpoint, input } = request
  if (input.kind === 'free-action') return { kind: 'free-action', text: input.text.trim() }
  if (input.kind === 'ordered-choices') {
    return {
      kind: 'ordered-choices',
      ordered: input.choice_ids.map((id, index) => ({ order: index + 1, action: choiceLabel(checkpoint, id) })),
    }
  }
  return { kind: 'numbered-choice', action: choiceLabel(checkpoint, input.choice_id) }
}

function playerActionText(request: GMProviderTurnRequest): string {
  const action = playerAction(request)
  if (action.kind === 'free-action') return action.text
  if (action.kind === 'ordered-choices') return action.ordered.map((item) => item.action).join(' / ')
  return action.action
}

function stringArray(value: JsonValue | undefined, max = MAX_SIGNALS): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').slice(-max)
}

function boundedCharacterNotes(value: JsonValue | undefined): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .filter(([, note]) => typeof note === 'string')
    .slice(0, 4)
    .map(([id, note]) => [id, String(note).slice(0, 240)]))
}

function compactSceneMemory(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return ''

  const structural: string[] = []
  const prose: string[] = []
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line) || /^>/.test(line) || /^-\s/.test(line) || /^[^:：]{1,28}[:：]\s*[“"']/.test(line)) {
      structural.push(line)
    } else if (!/^###?\s*(현재|선택|행동)/.test(line)) {
      prose.push(line)
    }
  }

  const selected = [
    ...structural,
    ...prose.slice(0, 2),
    ...prose.slice(-2),
  ].filter((line, index, all) => all.indexOf(line) === index)

  return selected.join('\n').slice(0, MAX_STORY_MEMORY_CHARS)
}

function recentStoryMemory(checkpoint: PublicRuntimeCheckpoint): string[] {
  const scenes = checkpoint.committed_turn.log
    .filter((entry) => entry.kind === 'scene' && entry.text !== checkpoint.current_scene.narrative)
    .map((entry) => entry.text)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(-MAX_RECENT_STORY_MEMORY)
    .map(compactSceneMemory)
    .filter(Boolean)
  return scenes
}

/**
 * Public-only, bounded story brief. The engine keeps full authoritative state and history;
 * the model sees only enough information to continue the current scene coherently.
 */
export function buildCompactGMBrief(request: GMProviderTurnRequest) {
  const { checkpoint } = request
  const state = checkpoint.public_state
  const recentDecisions = checkpoint.committed_turn.log
    .filter((entry) => entry.kind === 'choice' || entry.kind === 'free-action')
    .slice(-4)
    .map((entry) => entry.text.slice(0, 240))

  return {
    turn: checkpoint.committed_turn.number + 1,
    player_action: playerAction(request),
    current_scene: checkpoint.current_scene.narrative,
    recent_story_memory: recentStoryMemory(checkpoint),
    open_threads: stringArray(state.public_world.gm_open_threads, MAX_OPEN_THREADS),
    now: {
      date: checkpoint.date,
      time: checkpoint.time,
      player_location: checkpoint.player_location,
      pressure: checkpoint.active_visible_pressure,
      recent_change: checkpoint.recent_visible_change,
    },
    family: Object.fromEntries(Object.entries(state.party).map(([id, member]) => [id, {
      name: member.name,
      location: member.location,
      status: member.status,
    }])),
    vehicles: Object.fromEntries(Object.entries(state.vehicles).map(([id, vehicle]) => [id, {
      name: vehicle.name,
      location: vehicle.location,
      status: vehicle.status,
      operator: vehicle.operator,
    }])),
    resources: Object.fromEntries(Object.entries(state.resources).map(([id, resource]) => [id, resource.band])),
    bases: Object.fromEntries(Object.entries(state.bases).map(([id, base]) => [id, {
      name: base.name,
      status: base.status,
      capabilities: base.capabilities.slice(0, 8),
    }])),
    public_signals: stringArray(state.public_world.current_public_signals),
    character_notes: boundedCharacterNotes(state.public_world.family_character_notes),
    recent_decisions: recentDecisions,
    writable_ids: {
      party: Object.keys(state.party),
      vehicles: Object.keys(state.vehicles),
      resources: Object.keys(state.resources),
      bases: Object.keys(state.bases),
    },
  }
}

function normalizeHint(value: unknown): StoryStateHint | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'time' && Number.isInteger(value.minutes)) {
    return { kind: 'time', minutes: Math.max(0, Math.min(MAX_TIME_DELTA_MIN, Number(value.minutes))) }
  }
  if (value.kind === 'move' && typeof value.entity === 'string' && typeof value.to === 'string' && value.to.trim()) {
    return { kind: 'move', entity: value.entity.trim(), to: value.to.trim().slice(0, 120) }
  }
  if (value.kind === 'resource' && typeof value.resource_id === 'string' && typeof value.to === 'string' && value.to.trim()) {
    return { kind: 'resource', resource_id: value.resource_id.trim(), to: value.to.trim().slice(0, 120) }
  }
  if (value.kind === 'base_capability' && typeof value.base_id === 'string' && typeof value.add === 'string' && value.add.trim()) {
    return { kind: 'base_capability', base_id: value.base_id.trim(), add: value.add.trim().slice(0, 120) }
  }
  if (value.kind === 'signal' && typeof value.text === 'string' && value.text.trim()) {
    return { kind: 'signal', text: value.text.trim().slice(0, 180) }
  }
  return undefined
}

function normalizeActionResolution(value: unknown): ActionResolution | undefined {
  if (!isRecord(value) || typeof value.status !== 'string' || typeof value.summary !== 'string') return undefined
  if (!['attempted', 'completed', 'partial', 'blocked'].includes(value.status)) return undefined
  const summary = value.summary.trim().slice(0, 240)
  if (!summary) return undefined
  return { status: value.status as ActionResolution['status'], summary }
}

function normalizeOpenThreads(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 180))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, MAX_OPEN_THREADS)
}

export function normalizeCompactStoryCandidate(value: unknown): CompactStoryCandidate | undefined {
  if (!isRecord(value) || typeof value.story !== 'string' || !Array.isArray(value.choices)) return undefined
  const story = value.story.trim()
  const choices = value.choices
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 180))
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 4)
  if (!story || choices.length === 0) return undefined

  const stateHints = (Array.isArray(value.state_hints) ? value.state_hints : [])
    .slice(0, MAX_HINTS)
    .map(normalizeHint)
    .filter((hint): hint is StoryStateHint => Boolean(hint))

  return {
    story,
    choices,
    state_hints: stateHints,
    action_resolution: normalizeActionResolution(value.action_resolution),
    open_threads: normalizeOpenThreads(value.open_threads),
  }
}

function parseClockMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return hour * 60 + minute
}

function inferTimeDeltaFromStory(checkpoint: PublicRuntimeCheckpoint, story: string): number {
  const heading = story.match(/^##\s+(\d{2}:\d{2})\b/m)?.[1]
  if (!heading) return 0
  const from = parseClockMinutes(checkpoint.time)
  const to = parseClockMinutes(heading)
  if (from === undefined || to === undefined) return 0
  const delta = to - from
  return delta > 0 && delta <= MAX_TIME_DELTA_MIN ? delta : 0
}

function compileHints(
  checkpoint: PublicRuntimeCheckpoint,
  hints: StoryStateHint[],
  turnNumber: number,
  story: string,
  openThreads?: string[],
): QueuedAction[] {
  const state = checkpoint.public_state
  let timeDelta = 0
  const partyMoves = new Map<string, string>()
  const vehicleMoves = new Map<string, string>()
  const resourceTargets = new Map<string, string>()
  const capabilityTargets = new Map<string, { baseId: string; add: string }>()
  const signals = new Set<string>()

  for (const hint of hints) {
    if (hint.kind === 'time') timeDelta = Math.min(MAX_TIME_DELTA_MIN, timeDelta + hint.minutes)
    if (hint.kind === 'move') {
      if (PARTY_IDS.has(hint.entity as PartyMemberId) && state.party[hint.entity as PartyMemberId]) {
        if (state.party[hint.entity as PartyMemberId].location !== hint.to) partyMoves.set(hint.entity, hint.to)
      } else if (state.vehicles[hint.entity] && state.vehicles[hint.entity].location !== hint.to) {
        vehicleMoves.set(hint.entity, hint.to)
      }
    }
    if (hint.kind === 'resource' && state.resources[hint.resource_id] && state.resources[hint.resource_id].band !== hint.to) {
      resourceTargets.set(hint.resource_id, hint.to)
    }
    if (hint.kind === 'base_capability' && state.bases[hint.base_id] && !state.bases[hint.base_id].capabilities.includes(hint.add)) {
      capabilityTargets.set(`${hint.base_id}\u0000${hint.add}`, { baseId: hint.base_id, add: hint.add })
    }
    if (hint.kind === 'signal') signals.add(hint.text)
  }

  if (timeDelta === 0) timeDelta = inferTimeDeltaFromStory(checkpoint, story)

  const moves = [
    ...[...partyMoves.entries()].map(([entityId, to]) => ({
      entity_type: 'party' as const,
      entity_id: entityId,
      from: state.party[entityId as PartyMemberId].location,
      to,
    })),
    ...[...vehicleMoves.entries()].map(([entityId, to]) => ({
      entity_type: 'vehicle' as const,
      entity_id: entityId,
      from: state.vehicles[entityId].location,
      to,
    })),
  ]

  const resourceChanges = [...resourceTargets.entries()].map(([resourceId, to]) => ({
    resource_id: resourceId,
    from: state.resources[resourceId].band,
    to,
  }))

  const baseCapabilityChanges = [...capabilityTargets.values()].map(({ baseId, add }) => ({
    base_id: baseId,
    add,
  }))

  const worldChanges = [] as Array<{ key: string; from: JsonValue | undefined; to: JsonValue }>
  if (signals.size > 0) {
    const current = stringArray(state.public_world.current_public_signals)
    const merged = [...new Set([...current, ...signals])].slice(-MAX_SIGNALS)
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      worldChanges.push({
        key: 'current_public_signals',
        from: state.public_world.current_public_signals,
        to: merged,
      })
    }
  }

  if (openThreads !== undefined) {
    const current = stringArray(state.public_world.gm_open_threads, MAX_OPEN_THREADS)
    if (JSON.stringify(current) !== JSON.stringify(openThreads)) {
      worldChanges.push({ key: 'gm_open_threads', from: state.public_world.gm_open_threads, to: openThreads })
    }
  }

  if (timeDelta === 0 && moves.length === 0 && resourceChanges.length === 0 && baseCapabilityChanges.length === 0 && worldChanges.length === 0) return []

  const actors = new Set<PartyMemberId>()
  for (const move of moves) {
    if (move.entity_type === 'party' && PARTY_IDS.has(move.entity_id as PartyMemberId)) actors.add(move.entity_id as PartyMemberId)
    if (move.entity_type === 'vehicle') {
      const operator = state.vehicles[move.entity_id]?.operator
      if (operator) actors.add(operator)
    }
  }

  return [{
    id: `t${turnNumber}_story-state`,
    label: '스토리 상태 반영',
    actors: actors.size > 0 ? [...actors] : ['player'],
    exclusive_resources: [],
    proposal: {
      time_delta_min: timeDelta,
      moves,
      resource_changes: resourceChanges,
      base_capability_changes: baseCapabilityChanges,
      world_changes: worldChanges,
    },
  }]
}

function similarityText(value: string): string {
  return value.toLowerCase().replace(/[#>*_`\[\](){}"'.,!?·:;\-\s]/g, '')
}

function trigramSet(value: string): Set<string> {
  const normalized = similarityText(value)
  const grams = new Set<string>()
  if (normalized.length < 3) {
    if (normalized) grams.add(normalized)
    return grams
  }
  for (let index = 0; index <= normalized.length - 3; index += 1) grams.add(normalized.slice(index, index + 3))
  return grams
}

function diceSimilarity(a: string, b: string): number {
  const left = trigramSet(a)
  const right = trigramSet(b)
  if (left.size === 0 || right.size === 0) return 0
  let overlap = 0
  for (const gram of left) if (right.has(gram)) overlap += 1
  return (2 * overlap) / (left.size + right.size)
}

function hasInternalRepetition(story: string): boolean {
  const blocks = story.split(/\n\s*\n/).map(similarityText).filter((block) => block.length >= 45)
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (blocks[i] === blocks[j] || diceSimilarity(blocks[i]!, blocks[j]!) >= 0.92) return true
    }
  }
  return false
}

function actionTerms(text: string): string[] {
  return text
    .replace(/[→/,.!?()\[\]"']/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/(에서|에게|한테|으로|로|부터|까지|와|과|랑|이랑|을|를|은|는|이|가|도|만)$/u, ''))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !['그리고', '일단', '함께', '다시', '바로', '그쪽', '한다', '하기'].includes(token))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
}

function storyGroundsAction(request: GMProviderTurnRequest, candidate: CompactStoryCandidate): boolean {
  const terms = actionTerms(playerActionText(request))
  if (terms.length === 0) return true
  const target = similarityText(`${candidate.story} ${candidate.action_resolution?.summary ?? ''}`)
  const hits = terms.filter((term) => {
    const normalized = similarityText(term)
    if (!normalized) return false
    if (target.includes(normalized)) return true
    return normalized.length >= 4 && target.includes(normalized.slice(0, 3))
  })
  return hits.length >= Math.min(2, terms.length)
}

function priorScenes(checkpoint: PublicRuntimeCheckpoint): string[] {
  return checkpoint.committed_turn.log
    .filter((entry) => entry.kind === 'scene')
    .map((entry) => entry.text)
    .filter((text, index, all) => all.indexOf(text) === index)
    .slice(-3)
}

export function evaluateStoryCandidateQuality(request: GMProviderTurnRequest, candidate: CompactStoryCandidate): StoryQualityIssue[] {
  const issues: StoryQualityIssue[] = []
  if (!candidate.action_resolution) issues.push('missing_action_resolution')
  else if (!storyGroundsAction(request, candidate)) issues.push('action_not_grounded')

  const comparisonScenes = [request.checkpoint.current_scene.narrative, ...priorScenes(request.checkpoint)]
  if (comparisonScenes.some((scene) => scene && diceSimilarity(scene, candidate.story) >= 0.78)) issues.push('repeated_scene')
  if (hasInternalRepetition(candidate.story)) issues.push('internal_repetition')
  return [...new Set(issues)]
}

/** Compile model-friendly Story + Minimal Intent into the existing trusted engine proposal contract. */
export function compileCompactStoryCandidate(
  checkpoint: PublicRuntimeCheckpoint,
  candidate: CompactStoryCandidate,
): GMProposal {
  const nextTurn = checkpoint.committed_turn.number + 1
  return {
    actions: compileHints(checkpoint, candidate.state_hints, nextTurn, candidate.story, candidate.open_threads),
    narrative: candidate.story,
    next_choices: candidate.choices.map((label, index) => ({ id: index + 1, label })),
    presentation_blocks: [],
  }
}
