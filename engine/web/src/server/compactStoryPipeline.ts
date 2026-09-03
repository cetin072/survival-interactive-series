import type { JsonValue, PartyMemberId } from '../state/liveState'
import type { GMProposal } from '../runtime/gmProposal'
import type { GMProviderTurnRequest } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import type { QueuedAction } from '../validator/types'

const PARTY_IDS = new Set<PartyMemberId>(['player', 'wife', 'son', 'father'])
const MAX_HINTS = 6
const MAX_TIME_DELTA_MIN = 180
const MAX_SIGNALS = 6

export type StoryStateHint =
  | { kind: 'time'; minutes: number }
  | { kind: 'move'; entity: string; to: string }
  | { kind: 'resource'; resource_id: string; to: string }
  | { kind: 'base_capability'; base_id: string; add: string }
  | { kind: 'signal'; text: string }

export type CompactStoryCandidate = {
  story: string
  choices: string[]
  state_hints: StoryStateHint[]
}

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

  return { story, choices, state_hints: stateHints }
}

function compileHints(checkpoint: PublicRuntimeCheckpoint, hints: StoryStateHint[], turnNumber: number): QueuedAction[] {
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

/** Compile model-friendly Story + Minimal Intent into the existing trusted engine proposal contract. */
export function compileCompactStoryCandidate(
  checkpoint: PublicRuntimeCheckpoint,
  candidate: CompactStoryCandidate,
): GMProposal {
  const nextTurn = checkpoint.committed_turn.number + 1
  return {
    actions: compileHints(checkpoint, candidate.state_hints, nextTurn),
    narrative: candidate.story,
    next_choices: candidate.choices.map((label, index) => ({ id: index + 1, label })),
    presentation_blocks: [],
  }
}
