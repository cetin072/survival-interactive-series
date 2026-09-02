import type { LiveState, PartyMemberId } from './liveState'

function parseTime(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) throw new RangeError(`Invalid clock time: ${time}`)

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new RangeError(`Invalid clock time: ${time}`)
  return hours * 60 + minutes
}

function advanceDate(date: string | null, days: number): string | null {
  if (date === null || days === 0) return date
  const next = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(next.valueOf())) throw new RangeError(`Invalid clock date: ${date}`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function advanceClock(state: LiveState, elapsedMinutes: number): LiveState {
  if (!Number.isInteger(elapsedMinutes) || elapsedMinutes < 0) {
    throw new RangeError('Elapsed minutes must be a non-negative integer')
  }

  const totalMinutes = parseTime(state.clock.time) + elapsedMinutes
  const elapsedDays = Math.floor(totalMinutes / 1440)
  const minuteOfDay = totalMinutes % 1440
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60

  return {
    ...state,
    clock: {
      ...state.clock,
      day: state.clock.day + elapsedDays,
      date: advanceDate(state.clock.date, elapsedDays),
      time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    },
  }
}

export function movePartyMember(state: LiveState, memberId: PartyMemberId, location: string): LiveState {
  return {
    ...state,
    party: {
      ...state.party,
      [memberId]: { ...state.party[memberId], location },
    },
  }
}

export function moveVehicle(state: LiveState, vehicleId: string, location: string): LiveState {
  const vehicle = state.vehicles[vehicleId]
  if (!vehicle) throw new RangeError(`Unknown vehicle: ${vehicleId}`)

  return {
    ...state,
    vehicles: {
      ...state.vehicles,
      [vehicleId]: { ...vehicle, location },
    },
  }
}

export function setResourceBand(state: LiveState, resourceId: string, band: string): LiveState {
  const resource = state.resources[resourceId]
  if (!resource) throw new RangeError(`Unknown resource: ${resourceId}`)

  return {
    ...state,
    resources: {
      ...state.resources,
      [resourceId]: { ...resource, band },
    },
  }
}

export function addBaseCapability(state: LiveState, baseId: string, capability: string): LiveState {
  const base = state.bases[baseId]
  if (!base) throw new RangeError(`Unknown base: ${baseId}`)
  if (base.capabilities.includes(capability)) return state

  return {
    ...state,
    bases: {
      ...state.bases,
      [baseId]: { ...base, capabilities: [...base.capabilities, capability] },
    },
  }
}
