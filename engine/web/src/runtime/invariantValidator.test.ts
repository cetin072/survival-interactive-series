import { describe, expect, it } from 'vitest'
import { validateRuntimeInvariants, validateSeasonBootInvariants } from './invariantValidator'
import { runtimeInvariants } from './runtimeInvariants'

const codes = (value: ReturnType<typeof validateRuntimeInvariants>) => value.map((item) => item.code)

describe('Canon runtime invariants', () => {
  it('accepts the S05 hard Canon registry', () => expect(validateRuntimeInvariants(runtimeInvariants)).toEqual([]))
  it('keeps private, communal, and joint assets distinct', () => {
    const altered = structuredClone(runtimeInvariants)
    altered.assets.find((asset) => asset.id === 'CHOI_WELL')!.communal = true
    altered.assets.find((asset) => asset.id === 'JUNHO_SOLAR')!.village_auto_access = true
    altered.assets.find((asset) => asset.id === 'MOBILE_WELL_POWER')!.ownership_share!.CHOI_HOUSEHOLD = 100
    expect(codes(validateRuntimeInvariants(altered))).toEqual(expect.arrayContaining(['ASSET_COMMUNAL_CONFLICT', 'ASSET_ACCESS_CONFLICT', 'JOINT_OWNERSHIP_CONFLICT']))
  })
  it('rejects a merged Choi well and village borehole facility ID', () => {
    const altered = structuredClone(runtimeInvariants)
    altered.assets.find((asset) => asset.id === 'VILLAGE_BOREHOLE')!.id = 'CHOI_WELL'
    expect(codes(validateRuntimeInvariants(altered))).toContain('FACILITY_MERGE_CONFLICT')
  })
  it('does not turn cooperation or coordination into ownership', () => {
    const altered = structuredClone(runtimeInvariants)
    altered.cooperation.ownership_merged = true
    altered.cooperation.coordination_line.asset_authority = true
    expect(codes(validateRuntimeInvariants(altered))).toEqual(expect.arrayContaining(['COOPERATION_OWNERSHIP_MERGE', 'COORDINATION_ASSET_AUTHORITY']))
  })
  it('rejects default placement drift without a reason and allows a crisis override', () => {
    const weekday = { day_type: 'weekday' as const, family_locations: { player: 'urban', wife: 'urban', son: 'urban', father: 'urban' } }
    expect(validateSeasonBootInvariants(weekday, runtimeInvariants).map((item) => item.code)).toContain('BOOT_OPERATING_MODEL_MISMATCH')
    expect(validateSeasonBootInvariants({ ...weekday, override_reason: 'evacuation in progress' }, runtimeInvariants)).toEqual([])
  })
})
