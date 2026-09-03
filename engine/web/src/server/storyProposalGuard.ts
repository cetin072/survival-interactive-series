import type { GMProposal } from '../runtime/gmProposal'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import type { LocationMove, QueuedAction } from '../validator/types'

const MAX_SYNC_MINUTES = 180
const LOCATION_WORDS = /(도로|진입로|주차장|학원|병원|아파트|주택|회관|삼거리|교차로|골목|역|터미널|대피소|회사|학교|마트|편의점|농협|국도|지방도로|순환도로|거점|집|현장)/
const STRATEGIC_CHOICE_WORDS = /(우선|먼저|합류|대피|철수|포기|위험|혼자|보내|데리|만나|지점|거점|진입|빠져|우회|샛길|맡|역할|바꾸|정한다|설득|나오|들어가|계속 가|차량|외곽|도심)/
const MICRO_CHOICE_PATTERN = /((다시\s*)?(전화|연락).*(확인|알리|물어|조율)|상황.*(다시\s*)?확인|시간.*(다시\s*)?조율|지도.*(확인|검색)|정보.*(확인|검색))/

type StoryEnd = {
  time?: string
  location?: string
}

function clockMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return hour * 60 + minute
}

function cleanHeadingLocation(raw: string): string | undefined {
  const first = raw.split(',')[0]?.trim() ?? ''
  const cleaned = first
    .replace(/\s+(접근\s*중|이동\s*중|주행\s*중|차\s*안|차량\s*안)$/u, '')
    .replace(/\s+방향으로$/u, ' 방향')
    .trim()
  if (!cleaned || cleaned.length > 80 || !LOCATION_WORDS.test(cleaned)) return undefined
  return cleaned
}

export function inferStoryEnd(narrative: string): StoryEnd {
  const headings = [...narrative.matchAll(/^##\s+(\d{2}:\d{2})\s*[—-]\s*(.+)$/gmu)]
  const last = headings.at(-1)
  if (!last) return {}
  return {
    time: last[1],
    location: cleanHeadingLocation(last[2] ?? ''),
  }
}

function synchronizeAction(
  checkpoint: PublicRuntimeCheckpoint,
  proposal: GMProposal,
  end: StoryEnd,
): QueuedAction[] {
  const currentMinutes = clockMinutes(checkpoint.time)
  const endMinutes = end.time ? clockMinutes(end.time) : undefined
  const inferredDelta = currentMinutes !== undefined && endMinutes !== undefined
    ? endMinutes - currentMinutes
    : 0
  const safeDelta = inferredDelta > 0 && inferredDelta <= MAX_SYNC_MINUTES ? inferredDelta : undefined

  const state = checkpoint.public_state
  const playerFrom = state.party.player.location
  const locationChanged = Boolean(end.location && end.location !== playerFrom)
  const coLocatedVehicleIds = Object.entries(state.vehicles)
    .filter(([, vehicle]) => vehicle.operator === 'player' && vehicle.location === playerFrom)
    .map(([id]) => id)

  if (safeDelta === undefined && !locationChanged) return proposal.actions
  if (proposal.actions.length > 1) return proposal.actions

  const base: QueuedAction = proposal.actions[0] ?? {
    id: `t${checkpoint.committed_turn.number + 1}_story-end-sync`,
    label: '장면 끝 상태 동기화',
    actors: ['player'],
    exclusive_resources: [],
    proposal: {
      time_delta_min: 0,
      moves: [],
      resource_changes: [],
      base_capability_changes: [],
      world_changes: [],
    },
  }

  const moves = [...base.proposal.moves]
  const endLocation = end.location
  if (locationChanged && endLocation) {
    const playerMoveIndex = moves.findIndex((move) => move.entity_type === 'party' && move.entity_id === 'player')
    const playerMove: LocationMove = { entity_type: 'party', entity_id: 'player', from: playerFrom, to: endLocation }
    if (playerMoveIndex >= 0) moves[playerMoveIndex] = playerMove
    else moves.push(playerMove)

    for (const vehicleId of coLocatedVehicleIds) {
      const vehicleMoveIndex = moves.findIndex((move) => move.entity_type === 'vehicle' && move.entity_id === vehicleId)
      const vehicleMove: LocationMove = {
        entity_type: 'vehicle',
        entity_id: vehicleId,
        from: state.vehicles[vehicleId]!.location,
        to: endLocation,
      }
      if (vehicleMoveIndex >= 0) moves[vehicleMoveIndex] = vehicleMove
      else moves.push(vehicleMove)
    }
  }

  return [{
    ...base,
    actors: [...new Set([...base.actors, 'player' as const])],
    proposal: {
      ...base.proposal,
      time_delta_min: safeDelta ?? base.proposal.time_delta_min,
      moves,
    },
  }]
}

function isMicroChoice(label: string): boolean {
  const normalized = label.replace(/\s+/g, ' ').trim()
  if (!MICRO_CHOICE_PATTERN.test(normalized)) return false
  return !STRATEGIC_CHOICE_WORDS.test(normalized)
}

function compactChoices(proposal: GMProposal): GMProposal['next_choices'] {
  const filtered = proposal.next_choices.filter((choice) => !isMicroChoice(choice.label))
  const selected = filtered.length >= 2 ? filtered : proposal.next_choices
  return selected.map((choice, index) => ({ ...choice, id: index + 1 }))
}

/**
 * Deterministic server guard for visible story/engine continuity.
 * It does not invent story facts: it only synchronizes the final visible MUD heading
 * and removes clearly low-value micro choices when enough strategic choices remain.
 */
export function stabilizeStoryProposal(
  checkpoint: PublicRuntimeCheckpoint,
  proposal: GMProposal,
): GMProposal {
  const end = inferStoryEnd(proposal.narrative)
  return {
    ...proposal,
    actions: synchronizeAction(checkpoint, proposal, end),
    next_choices: compactChoices(proposal),
  }
}
