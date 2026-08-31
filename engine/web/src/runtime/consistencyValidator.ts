import { RESOURCE_BANDS, RUNTIME_SCHEMA_VERSION, type CharactersFile, type ConsistencyIssue, type RuntimeCanon, type RuntimeState } from './types'

function issue(code: string, message: string, severity: ConsistencyIssue['severity'] = 'error'): ConsistencyIssue {
  return { code, message, severity }
}

function duplicateIds(ids: string[]): string[] {
  const seen = new Set<string>()
  return ids.filter((id) => seen.has(id) || (seen.add(id) && false))
}

function validIso(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z$/u.test(value) && !Number.isNaN(Date.parse(value))
}

export function validateRuntimeConsistency(
  state: RuntimeState,
  characters: CharactersFile,
  canon: RuntimeCanon,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const family = state.family ?? []
  const vehicles = state.vehicles ?? []
  const bases = state.bases ?? []
  const resources = state.resources ?? []
  const activeActions = state.active_actions ?? []
  const changes = state.recent_changes ?? []
  const familyById = new Map(family.map((member) => [member.id, member]))
  const characterIds = new Set(characters.members.map((member) => member.id))
  const vehicleIds = new Set(vehicles.map((vehicle) => vehicle.id))
  const baseIds = new Set(bases.map((base) => base.id))

  for (const id of duplicateIds(family.map((member) => member.id))) issues.push(issue('DUPLICATE_FAMILY_ID', `가족 ID가 중복됩니다: ${id}`))
  for (const member of family) {
    if (!characterIds.has(member.id)) issues.push(issue('UNKNOWN_FAMILY_ID', `Canon에 없는 가족 ID입니다: ${member.id}`))
    for (const companionId of member.together_with) {
      const companion = familyById.get(companionId)
      if (!companion) {
        issues.push(issue('UNKNOWN_FAMILY_REFERENCE', `${member.id}가 없는 가족 ${companionId}를 참조합니다.`))
      } else if (companionId === member.id) {
        issues.push(issue('SELF_COMPANION', `${member.id}는 자기 자신과 동행할 수 없습니다.`))
      } else {
        if (!companion.together_with.includes(member.id)) issues.push(issue('COMPANION_ASYMMETRY', `${member.id}와 ${companionId}의 동행 관계가 비대칭입니다.`))
        if (companion.location !== member.location) issues.push(issue('FAMILY_LOCATION_CONFLICT', `${member.id}와 ${companionId}가 동행 중이지만 위치가 다릅니다.`))
      }
    }
  }
  if (familyById.get('player')?.location !== state.player_location) issues.push(issue('PLAYER_LOCATION_CONFLICT', 'player 위치와 player_location이 다릅니다.'))

  for (const vehicle of vehicles) {
    const expected = canon.vehicles[vehicle.id]
    if (!expected) issues.push(issue('UNKNOWN_VEHICLE_ID', `Canon에 없는 차량입니다: ${vehicle.id}`))
    else if (expected.owner_id !== vehicle.owner_id) issues.push(issue('CANON_OWNERSHIP_CONFLICT', `${vehicle.id}의 소유권이 Canon과 다릅니다.`))
    if (vehicle.current_user) {
      const user = familyById.get(vehicle.current_user)
      if (!user) issues.push(issue('UNKNOWN_FAMILY_REFERENCE', `${vehicle.id}의 사용자가 존재하지 않습니다: ${vehicle.current_user}`))
      else if (user.location !== vehicle.location) issues.push(issue('VEHICLE_LOCATION_CONFLICT', `${vehicle.id}와 사용자 ${vehicle.current_user}의 위치가 다릅니다.`))
    }
  }

  for (const base of bases) {
    const expected = canon.bases[base.id]
    if (!expected) {
      issues.push(issue('UNKNOWN_BASE_ID', `Canon에 없는 거점입니다: ${base.id}`))
      continue
    }
    if (expected.owner_id !== base.owner_id) issues.push(issue('CANON_OWNERSHIP_CONFLICT', `${base.id}의 소유권이 Canon과 다릅니다.`))
    for (const capability of base.capabilities) {
      if (!expected.capabilities.includes(capability)) issues.push(issue('CANON_CAPABILITY_CONFLICT', `${base.id}에 Canon에 없는 능력이 있습니다: ${capability}`))
    }
  }

  for (const resource of resources) {
    if (!(RESOURCE_BANDS as readonly string[]).includes(resource.band)) issues.push(issue('INVALID_RESOURCE_BAND', `${resource.id}의 band가 올바르지 않습니다: ${resource.band}`))
  }

  if (state.clock.date !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(state.clock.date)) issues.push(issue('INVALID_TIME', `날짜 형식이 올바르지 않습니다: ${state.clock.date}`))
  if (state.clock.time !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(state.clock.time)) issues.push(issue('INVALID_TIME', `시간 형식이 올바르지 않습니다: ${state.clock.time}`))
  const changeTimes = changes.filter((change) => change.at !== null).map((change) => change.at as string)
  for (const time of changeTimes) if (!validIso(time)) issues.push(issue('INVALID_TIME', `recent change 시간이 올바르지 않습니다: ${time}`))
  for (let index = 1; index < changeTimes.length; index += 1) {
    if (Date.parse(changeTimes[index]) < Date.parse(changeTimes[index - 1])) issues.push(issue('TIME_REVERSAL', 'recent_changes 시간이 역행합니다.'))
  }

  const completed = new Set(state.completed_action_ids)
  for (const action of activeActions) {
    if (completed.has(action.id)) issues.push(issue('COMPLETED_ACTION_ACTIVE', `완료된 행동이 active에 다시 등장합니다: ${action.id}`))
    for (const actor of action.actors) if (!familyById.has(actor)) issues.push(issue('UNKNOWN_FAMILY_REFERENCE', `${action.id}가 없는 가족 ${actor}를 참조합니다.`))
    for (const vehicleId of action.vehicle_ids ?? []) if (!vehicleIds.has(vehicleId)) issues.push(issue('UNKNOWN_VEHICLE_REFERENCE', `${action.id}가 없는 차량 ${vehicleId}를 참조합니다.`))
    for (const baseId of action.base_ids ?? []) if (!baseIds.has(baseId)) issues.push(issue('UNKNOWN_BASE_REFERENCE', `${action.id}가 없는 거점 ${baseId}를 참조합니다.`))
  }
  for (let left = 0; left < activeActions.length; left += 1) {
    for (let right = left + 1; right < activeActions.length; right += 1) {
      const leftAction = activeActions[left]
      const rightAction = activeActions[right]
      if (leftAction.actors.some((actor) => rightAction.actors.includes(actor))) issues.push(issue('ACTIVE_ACTION_CONFLICT', `${leftAction.id}와 ${rightAction.id}가 같은 actor를 사용합니다.`))
      if ((leftAction.exclusive_resources ?? []).some((resource) => rightAction.exclusive_resources?.includes(resource))) issues.push(issue('ACTIVE_ACTION_CONFLICT', `${leftAction.id}와 ${rightAction.id}가 같은 독점 자원을 사용합니다.`))
    }
  }

  const checkpoint = state.latest_checkpoint
  if (checkpoint.season_id !== state.season_id || checkpoint.phase !== state.phase) issues.push(issue('SEASON_PHASE_MISMATCH', 'checkpoint의 season/phase가 runtime과 다릅니다.'))
  if (checkpoint.runtime_schema_version !== state.schema_version || state.schema_version !== RUNTIME_SCHEMA_VERSION) issues.push(issue('CHECKPOINT_VERSION_MISMATCH', 'checkpoint/runtime schema version이 일치하지 않습니다.'))
  if (checkpoint.at !== null && !validIso(checkpoint.at)) issues.push(issue('INVALID_TIME', `checkpoint 시간이 올바르지 않습니다: ${checkpoint.at}`))

  return issues
}
