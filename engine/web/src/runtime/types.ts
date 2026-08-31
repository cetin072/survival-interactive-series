export const RUNTIME_SCHEMA_VERSION = 1 as const
export const RESOURCE_BANDS = ['stable', 'adequate', 'strained', 'critical', 'depleted', 'unknown'] as const

export type ResourceBand = typeof RESOURCE_BANDS[number]

export type CanonCharacter = {
  id: string
  name: string
  relation: string
  sex: string
  age: number
}

export type CharactersFile = {
  party_version: number
  members: CanonCharacter[]
}

export type RuntimeFamilyMember = {
  id: string
  location: string
  status: string
  together_with: string[]
}

export type RuntimeVehicle = {
  id: string
  name: string
  location: string
  current_user: string | null
  availability: 'available' | 'in_use' | 'unavailable' | 'unknown'
  owner_id: string
}

export type RuntimeResource = { id: string; name: string; band: ResourceBand | string }

export type RuntimeBase = {
  id: string
  name: string
  location: string
  owner_id: string
  state: string
  capabilities: string[]
}

export type RuntimeAction = {
  id: string
  label: string
  actors: string[]
  vehicle_ids?: string[]
  base_ids?: string[]
  exclusive_resources?: string[]
}

export type RuntimeChange = {
  id: string
  at: string | null
  type: 'family' | 'vehicle' | 'resource' | 'base' | 'action' | 'phase' | 'institution'
  message: string
}

export type RuntimeState = {
  schema_version: typeof RUNTIME_SCHEMA_VERSION
  runtime_version: number
  season_id: string
  phase: string
  clock: { date: string | null; time: string | null }
  player_location: string
  family: RuntimeFamilyMember[]
  vehicles?: RuntimeVehicle[]
  resources?: RuntimeResource[]
  bases?: RuntimeBase[]
  active_actions?: RuntimeAction[]
  completed_action_ids: string[]
  institutions?: { id: string; name: string; status: string }[]
  recent_changes?: RuntimeChange[]
  latest_checkpoint: {
    id: string
    season_id: string
    phase: string
    runtime_schema_version: number
    save_version: number
    at: string | null
  }
}

export type RuntimeCanon = {
  vehicles: Record<string, { owner_id: string }>
  bases: Record<string, { owner_id: string; capabilities: string[] }>
}

export type ConsistencyIssue = {
  code: string
  severity: 'error' | 'warning'
  message: string
}

export type RuntimeInvariantAsset = {
  id: string
  owner_ids: string[]
  ownership_share?: Record<string, number>
  communal: boolean
  village_auto_access: boolean
  purpose: string
}

export type RuntimeInvariants = {
  schema_version: 1
  registry_version: 1
  family_operating_model: {
    weekday: { default_locations: Record<string, string> }
    weekend: { default_reunion_location: string; member_ids: string[] }
  }
  assets: RuntimeInvariantAsset[]
  cooperation: {
    core_participants: string[]
    ownership_merged: boolean
    coordination_line: { participants: string[]; asset_authority: boolean }
    headman_roles: string[]
  }
}

export type SeasonBootFixture = {
  day_type: 'weekday' | 'weekend'
  family_locations: Record<string, string>
  override_reason?: string
}

export type StateConsoleView = {
  header: { season: string; phase: string; date: string; time: string; location: string }
  family: Array<RuntimeFamilyMember & Pick<CanonCharacter, 'name' | 'age' | 'sex' | 'relation'>>
  vehicles: RuntimeVehicle[]
  resources: Array<RuntimeResource & { band_label: string }>
  bases: RuntimeBase[]
  active_actions: RuntimeAction[]
  recent_changes: RuntimeChange[]
  checkpoint: RuntimeState['latest_checkpoint']
  warnings: ConsistencyIssue[]
}
