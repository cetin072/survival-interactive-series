import s02StartState from '../../../../seasons_v2/S02/START_STATE.json'

export const CANON_V2_PUBLIC_SOURCE_PATHS = {
  startState: 'seasons_v2/S02/START_STATE.json',
  characters: 'canon_v2/CHARACTERS.json',
  persistentCanon: 'canon_v2/PERSISTENT_CANON.md',
  previousEndState: 'seasons_v2/S01/END_STATE.json',
  startHandoff: 'seasons_v2/S02/START_HANDOFF.md',
} as const

export const CANON_V2_FORBIDDEN_RUNTIME_PATHS = [
  'seasons_v2/**/raw_transcript/**',
  'players/main/RUNTIME_STATE.json',
  'core/CHARACTERS.json',
] as const

type CanonV2StartState = {
  timeline_id: string
  season_id: string
  status: string
  legacy_current_state_allowed: boolean
  hidden_seed_required: boolean
  hidden_seed_generated: boolean
}

export type CanonV2RuntimeBlock = {
  status: 'blocked'
  code: 'PUBLIC_RUNTIME_CONTRACT_REQUIRED'
  seasonId: string
  sourcePaths: readonly string[]
  missingContract: readonly string[]
  message: string
}

const REQUIRED_PUBLIC_RUNTIME_FIELDS = [
  'current public date and time',
  'player and family visible locations and conditions',
  'visible resources, base capabilities, and active pressure',
  'current scene, numbered choices, and a deterministic turn result source',
] as const

function inspectStartState(startState: CanonV2StartState): CanonV2RuntimeBlock {
  if (startState.timeline_id !== 'canon_v2') {
    throw new TypeError('Canon v2 runtime source must declare timeline_id=canon_v2')
  }

  if (startState.legacy_current_state_allowed) {
    throw new TypeError('Canon v2 runtime source must explicitly prohibit Legacy current state')
  }

  return {
    status: 'blocked',
    code: 'PUBLIC_RUNTIME_CONTRACT_REQUIRED',
    seasonId: startState.season_id,
    sourcePaths: Object.values(CANON_V2_PUBLIC_SOURCE_PATHS),
    missingContract: REQUIRED_PUBLIC_RUNTIME_FIELDS,
    message: 'S02는 Hidden World Seed 생성 전 상태입니다. 공개 플레이 런타임 checkpoint가 준비될 때까지 장면과 현재 상태를 추정하지 않습니다.',
  }
}

/**
 * Phase 1 safety gate for Issue #57. The current Canon v2 continuation is
 * intentionally not a public runtime snapshot, so this adapter blocks rather
 * than loading Legacy data or exposing/deriving Hidden World Seed data.
 */
export function loadCanonV2Runtime(): CanonV2RuntimeBlock {
  return inspectStartState(s02StartState as CanonV2StartState)
}
