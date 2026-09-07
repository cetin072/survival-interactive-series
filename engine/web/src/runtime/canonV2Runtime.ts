import { canonV2PublicSource } from './canonV2PublicSource'
import type { RuntimeBase, RuntimeResource, StateConsoleView } from './types'

/** Documents audited for the S02 boot contract; never parsed by the UI. */
export const CANON_V2_BOOT_DOCUMENT_PATHS = [
  'REBOOT_START_HERE.md',
  'docs/IP_BIBLE_V2.md',
  'canon_v2/PERSISTENT_CANON.md',
  'seasons_v2/S02/START_HANDOFF.md',
] as const

/** The only Canon files imported by this deterministic browser compiler. */
export const CANON_V2_PUBLIC_SOURCE_PATHS = {
  startState: 'seasons_v2/S02/START_STATE.json',
  characters: 'canon_v2/CHARACTERS.json',
  previousEndState: 'seasons_v2/S01/END_STATE.json',
} as const

export const CANON_V2_FORBIDDEN_RUNTIME_PATHS = [
  'seasons_v2/**/raw_transcript/**',
  'players/main/RUNTIME_STATE.json',
  'core/CHARACTERS.json',
] as const

type CanonCharacter = { id: string; name: string; relation: string; age: number; role: string }
type CanonV2StartState = {
  timeline_id: string; season_id: string; status: string; legacy_current_state_allowed: boolean
  hidden_seed_required: boolean; hidden_seed_generated: boolean; rules: Record<string, boolean>
}
type CanonV2EndState = {
  timeline_id: string; season_id: string; status: string
  family: { all_four_survived: boolean; operating_model: string }
  bases: Record<string, { role: string; status: string; capabilities?: string[] }>
  preparedness: Record<string, string>
}

export type WebRuntimeState = {
  timeline_id: 'canon_v2'; season_id: string; phase: 'season_start_pending'
  clock: { date: null; time: null }; player_location: null
  family: Array<{ id: string; name: string; relation: string; age: number; role: string; location: null; status: 'role_known_location_pending' }>
  bases: RuntimeBase[]; persistent_assets: RuntimeResource[]; season_flags: string[]
  source_paths: readonly string[]
}

export type CanonV2Runtime = { state: WebRuntimeState; view: StateConsoleView; warning: string }

function assertCanonSource(start: CanonV2StartState, end: CanonV2EndState, characters: CanonCharacter[]) {
  if (start.timeline_id !== 'canon_v2' || end.timeline_id !== 'canon_v2') throw new TypeError('Canon v2 source timeline mismatch')
  if (start.season_id !== 'S02' || end.season_id !== 'S01') throw new TypeError('Canon v2 season handoff mismatch')
  if (start.legacy_current_state_allowed) throw new TypeError('Legacy state is forbidden for Canon v2 runtime')
  if (!characters.length || !end.family.all_four_survived) throw new TypeError('Canon v2 family source is incomplete')
}

function baseId(key: string): string { return key.replaceAll('_', '-') }

export function compileCanonV2Runtime(input: {
  startState: CanonV2StartState; previousEndState: CanonV2EndState; characters: CanonCharacter[]
}): CanonV2Runtime {
  const { startState, previousEndState, characters } = input
  assertCanonSource(startState, previousEndState, characters)
  const state: WebRuntimeState = {
    timeline_id: 'canon_v2', season_id: startState.season_id, phase: 'season_start_pending',
    clock: { date: null, time: null }, player_location: null,
    family: characters.map(({ id, name, relation, age, role }) => ({ id, name, relation, age, role, location: null, status: 'role_known_location_pending' })),
    bases: Object.entries(previousEndState.bases).map(([id, base]) => ({
      id: baseId(id), name: id, location: '시작 시점 위치 미확정', owner_id: 'family', state: base.status,
      capabilities: [base.role, ...(base.capabilities ?? [])],
    })),
    persistent_assets: Object.entries(previousEndState.preparedness).map(([id, value]) => ({ id, name: id, band: value })),
    season_flags: Object.entries(startState.rules).filter(([, enabled]) => enabled).map(([flag]) => flag),
    source_paths: Object.values(CANON_V2_PUBLIC_SOURCE_PATHS),
  }
  return {
    state,
    view: {
      header: { season: state.season_id, phase: '시즌 시작 준비', date: '시작 날짜 미확정', time: '시작 시간 미확정', location: '주 플레이어 위치 미확정' },
      family: state.family.map((member) => ({ id: member.id, name: member.name, relation: member.relation, age: member.age, location: '시작 시점 위치 미확정', status: member.role, together_with: [] })),
      vehicles: [], resources: state.persistent_assets.map((asset) => ({ ...asset, band_label: asset.band })), bases: state.bases,
      active_actions: state.season_flags.map((flag) => ({ id: flag, label: flag, actors: [] })),
      recent_changes: [{ id: 's01-to-s02-handoff', at: null, type: 'phase', message: `S01 ${previousEndState.status} → S02 시작 준비` }],
      checkpoint: { id: 'canon-v2-s02-start', season_id: state.season_id, phase: state.phase, runtime_schema_version: 2, save_version: 1, at: null }, warnings: [],
    },
    warning: 'S02 시작 날짜·시간·가족 위치·차량 상태는 Canon에 아직 확정되지 않아 표시하지 않습니다.',
  }
}

export function loadCanonV2Runtime(): CanonV2Runtime {
  return compileCanonV2Runtime({
    startState: {
      timeline_id: canonV2PublicSource.timelineId,
      season_id: canonV2PublicSource.seasonId,
      status: 'PUBLIC_START_STATE',
      legacy_current_state_allowed: false,
      hidden_seed_required: false,
      hidden_seed_generated: false,
      rules: Object.fromEntries(canonV2PublicSource.seasonFlags.map((flag) => [flag, true])),
    },
    previousEndState: {
      timeline_id: canonV2PublicSource.timelineId,
      season_id: canonV2PublicSource.previousSeasonId,
      status: canonV2PublicSource.previousSeasonComplete ? 'COMPLETE' : 'INCOMPLETE',
      family: { all_four_survived: true, operating_model: 'public-handoff' },
      bases: Object.fromEntries(canonV2PublicSource.bases.map((base) => [base.id, {
        role: base.role,
        status: base.status,
        ...(base.capabilities.length ? { capabilities: [...base.capabilities] } : {}),
      }])),
      preparedness: Object.fromEntries(canonV2PublicSource.preparedness),
    },
    characters: [...canonV2PublicSource.family],
  })
}
