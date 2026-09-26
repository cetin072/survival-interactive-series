import { describe, expect, it } from 'vitest'
import { CANON_V2_FORBIDDEN_RUNTIME_PATHS, CANON_V2_PUBLIC_SOURCE_PATHS, loadCanonV2Runtime } from './canonV2Runtime'
import { canonV2PublicSource } from './canonV2PublicSource'
import charactersJson from '../../../../canon_v2/CHARACTERS.json'
import s01EndStateJson from '../../../../seasons_v2/S01/END_STATE.json'
import s02StartStateJson from '../../../../seasons_v2/S02/START_STATE.json'

describe('Canon v2 runtime compiler', () => {
  it('normalizes the prepared S02 start sources without fabricating unsettled facts', () => {
    const result = loadCanonV2Runtime()

    expect(result.state).toMatchObject({ timeline_id: 'canon_v2', season_id: 'S02', phase: 'season_start_pending' })
    expect(result.state.clock).toEqual({ date: null, time: null })
    expect(result.state.player_location).toBeNull()
    expect(result.view.family.map((member) => member.name)).toEqual(['한준호', '서윤', '민석', '정호'])
    expect(result.view.bases.map((base) => base.id)).toEqual(['city-apartment', 'outer-house', 'b2-route'])
    expect(result.view.resources.map((resource) => resource.id)).toEqual(expect.arrayContaining(['vehicle_emergency_cache', 'family_reunion_rules']))
  })

  it('never treats a Raw Transcript or Legacy runtime as a Canon v2 source', () => {
    const configuredSources = Object.values(CANON_V2_PUBLIC_SOURCE_PATHS)

    expect(configuredSources).toEqual([
      'seasons_v2/S02/START_STATE.json',
      'canon_v2/CHARACTERS.json',
      'seasons_v2/S01/END_STATE.json',
    ])
    expect(configuredSources).not.toContain('players/main/RUNTIME_STATE.json')
    expect(configuredSources).not.toContain('core/CHARACTERS.json')
    expect(configuredSources.some((path) => path.includes('raw_transcript'))).toBe(false)
    expect(CANON_V2_FORBIDDEN_RUNTIME_PATHS).toEqual(expect.arrayContaining([
      'seasons_v2/**/raw_transcript/**',
      'players/main/RUNTIME_STATE.json',
      'core/CHARACTERS.json',
    ]))
  })

  it('does not expose hidden-seed data or a Legacy S01~S07 state in the browser result', () => {
    const serialized = JSON.stringify(loadCanonV2Runtime())
    expect(serialized).not.toMatch(/hidden_seed|READY_FOR_HIDDEN_WORLD_SEED|players\/main|core\/CHARACTERS/i)
  })

  it('keeps the browser-safe selection aligned with Canon v2 structured sources', () => {
    const characters = charactersJson as { members: Array<{ id: string; name: string; relation: string; age: number; role: string }> }
    const endState = s01EndStateJson as { bases: Record<string, unknown>; preparedness: Record<string, string> }
    const startState = s02StartStateJson as { timeline_id: string; season_id: string; rules: Record<string, boolean> }

    expect(canonV2PublicSource.timelineId).toBe(startState.timeline_id)
    expect(canonV2PublicSource.seasonId).toBe(startState.season_id)
    expect(canonV2PublicSource.family).toEqual(characters.members.map(({ id, name, relation, age, role }) => ({ id, name, relation, age, role })))
    expect(Object.fromEntries(canonV2PublicSource.bases.map((base) => [base.id, {
      role: base.role,
      status: base.status,
      ...(base.capabilities.length ? { capabilities: base.capabilities } : {}),
    }]))).toEqual(endState.bases)
    expect(Object.fromEntries(canonV2PublicSource.preparedness)).toEqual(endState.preparedness)
    expect(canonV2PublicSource.seasonFlags).toEqual(Object.entries(startState.rules).filter(([, enabled]) => enabled).map(([flag]) => flag))
  })
})
