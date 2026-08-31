import type { ConsistencyIssue, RuntimeInvariants, SeasonBootFixture } from './types'

const issue = (code: string, message: string): ConsistencyIssue => ({ code, message, severity: 'error' })
export function validateRuntimeInvariants(invariants: RuntimeInvariants): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const ids = invariants.assets.map((asset) => asset.id)
  if (new Set(ids).size !== ids.length) issues.push(issue('FACILITY_MERGE_CONFLICT', 'facility IDs must remain unique; merged facilities are not allowed'))
  for (const asset of invariants.assets) {
    const privateAsset = !asset.owner_ids.includes('VILLAGE_COMMON')
    if (privateAsset && asset.communal) issues.push(issue('ASSET_COMMUNAL_CONFLICT', `${asset.id} is privately owned but marked communal`))
    if (privateAsset && asset.village_auto_access) issues.push(issue('ASSET_ACCESS_CONFLICT', `${asset.id} is private but has village auto access`))
    if (!privateAsset && !asset.communal) issues.push(issue('PUBLIC_FACILITY_CONFLICT', `${asset.id} is village-owned but not communal`))
    if (asset.owner_ids.length === 2) {
      const shares = asset.ownership_share ?? {}
      const values = asset.owner_ids.map((owner) => shares[owner] ?? 0)
      if (values.reduce((total, share) => total + share, 0) !== 100 || values.some((share) => share !== 50)) issues.push(issue('JOINT_OWNERSHIP_CONFLICT', `${asset.id} must keep a 50/50 joint share`))
    }
  }
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
