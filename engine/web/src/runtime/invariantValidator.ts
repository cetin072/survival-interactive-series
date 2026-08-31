import type { ConsistencyIssue, RuntimeInvariants, SeasonBootFixture } from './types'

const issue = (code: string, message: string): ConsistencyIssue => ({ code, message, severity: 'error' })
const requiredAssets: Record<string, { owners: string[]; communal: boolean; villageAutoAccess: boolean }> = {
  CHOI_WELL: { owners: ['CHOI_HOUSEHOLD'], communal: false, villageAutoAccess: false },
  VILLAGE_BOREHOLE: { owners: ['VILLAGE_COMMON'], communal: true, villageAutoAccess: true },
  VILLAGE_STORAGE_TANK: { owners: ['VILLAGE_COMMON'], communal: true, villageAutoAccess: true },
  JUNHO_SOLAR: { owners: ['JUNHO_HOUSEHOLD'], communal: false, villageAutoAccess: false },
  MOBILE_WELL_POWER: { owners: ['JUNHO_HOUSEHOLD', 'CHOI_HOUSEHOLD'], communal: false, villageAutoAccess: false },
  SPARE_WELL_PUMP: { owners: ['JUNHO_HOUSEHOLD', 'CHOI_HOUSEHOLD'], communal: false, villageAutoAccess: false },
}

export function validateRuntimeInvariants(invariants: RuntimeInvariants): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const assets = new Map(invariants.assets.map((asset) => [asset.id, asset]))
  for (const [id, expected] of Object.entries(requiredAssets)) {
    const asset = assets.get(id)
    if (!asset) { issues.push(issue('MISSING_INVARIANT_ASSET', `${id} is missing`)); continue }
    if (asset.owner_ids.join('|') !== expected.owners.join('|')) issues.push(issue('ASSET_OWNER_CONFLICT', `${id} ownership differs from hard Canon`))
    if (asset.communal !== expected.communal) issues.push(issue('ASSET_COMMUNAL_CONFLICT', `${id} communal flag differs from hard Canon`))
    if (asset.village_auto_access !== expected.villageAutoAccess) issues.push(issue('ASSET_ACCESS_CONFLICT', `${id} village auto access differs from hard Canon`))
    if (expected.owners.length === 2 && (asset.ownership_share?.JUNHO_HOUSEHOLD !== 50 || asset.ownership_share?.CHOI_HOUSEHOLD !== 50)) issues.push(issue('JOINT_OWNERSHIP_CONFLICT', `${id} must remain 50/50 joint ownership`))
  }
  if (assets.get('CHOI_WELL')?.id === assets.get('VILLAGE_BOREHOLE')?.id) issues.push(issue('FACILITY_MERGE_CONFLICT', 'CHOI_WELL and VILLAGE_BOREHOLE must remain separate'))
  if (invariants.cooperation.ownership_merged) issues.push(issue('COOPERATION_OWNERSHIP_MERGE', 'cooperation does not merge ownership'))
  if (invariants.cooperation.coordination_line.asset_authority) issues.push(issue('COORDINATION_ASSET_AUTHORITY', 'coordination line has no asset ownership authority'))
  return issues
}

export function validateSeasonBootInvariants(boot: SeasonBootFixture, invariants: RuntimeInvariants): ConsistencyIssue[] {
  if (boot.override_reason?.trim()) return []
  const expected = boot.day_type === 'weekday'
    ? invariants.family_operating_model.weekday.default_locations
    : Object.fromEntries(invariants.family_operating_model.weekend.member_ids.map((id) => [id, invariants.family_operating_model.weekend.default_reunion_location]))
  return Object.entries(expected).flatMap(([id, location]) => boot.family_locations[id] === location
    ? [] : [issue('BOOT_OPERATING_MODEL_MISMATCH', `${id} requires an override reason for ${boot.day_type} placement`)])
}
