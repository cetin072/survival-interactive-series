import { describe, expect, it } from 'vitest'
import {
  CANON_V2_FORBIDDEN_RUNTIME_PATHS,
  CANON_V2_PUBLIC_SOURCE_PATHS,
  loadCanonV2Runtime,
} from './canonV2Runtime'

describe('Canon v2 runtime safety gate', () => {
  it('uses the prepared S02 Canon sources and blocks until a public runtime checkpoint exists', () => {
    const result = loadCanonV2Runtime()

    expect(result).toMatchObject({
      status: 'blocked',
      code: 'PUBLIC_RUNTIME_CONTRACT_REQUIRED',
      seasonId: 'S02',
    })
    expect(result.missingContract).toEqual(expect.arrayContaining([
      'current public date and time',
      'player and family visible locations and conditions',
    ]))
  })

  it('never treats a Raw Transcript or Legacy runtime as a Canon v2 source', () => {
    const configuredSources = Object.values(CANON_V2_PUBLIC_SOURCE_PATHS)

    expect(configuredSources).toEqual(expect.arrayContaining([
      'seasons_v2/S02/START_STATE.json',
      'canon_v2/CHARACTERS.json',
    ]))
    expect(configuredSources).not.toContain('players/main/RUNTIME_STATE.json')
    expect(configuredSources).not.toContain('core/CHARACTERS.json')
    expect(configuredSources.some((path) => path.includes('raw_transcript'))).toBe(false)
    expect(CANON_V2_FORBIDDEN_RUNTIME_PATHS).toEqual(expect.arrayContaining([
      'seasons_v2/**/raw_transcript/**',
      'players/main/RUNTIME_STATE.json',
      'core/CHARACTERS.json',
    ]))
  })

  it('does not expose Hidden World Seed fields in the browser result', () => {
    expect(JSON.stringify(loadCanonV2Runtime())).not.toContain('hidden_seed')
  })
})
