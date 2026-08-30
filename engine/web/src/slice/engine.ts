import { runActionQueue } from '../controller/actionQueue'
import { demoLiveState } from '../state/demoLiveState'
import { deserializeLiveState, serializeLiveState } from '../state/serialization'
import type { LiveState } from '../state/liveState'
import type { QueuedAction, ResourceChange } from '../validator/types'
import { decideFamilyRequest } from './familyDecision'
import { createRng } from './rng'
import { chooseWorldEvent, clampPressure } from './worldDirector'
import type { SliceChoice, SliceIntent, SliceState, TurnResult } from './types'

function cloneLive(): LiveState {
  const live = deserializeLiveState(serializeLiveState(demoLiveState))
  live.season_id = 'M3-V'
  live.scene_id = 'zero-ai-slice'
  live.resources.food = { name: '식량', icon: '🥫', band: '충분' }
  live.resources.power = { name: '전력', icon: '⚡', band: '안정' }
  live.public_world = {
    ...live.public_world,
    current_event: null,
    threat_pressure: 1,
    road_status: 'normal',
  }
  return live
}

export function createInitialSlice(worldSeed = 'M3V-DEFAULT'): SliceState {
  return {
    version: 1,
    live: cloneLive(),
    worldSeed,
    rng: createRng(worldSeed),
    turn: 0,
    pressure: 1,
    currentEventId: null,
    recentEvents: [],
    narrative: '퇴근 무렵, 평소와 크게 다르지 않은 도시가 조금씩 어긋나기 시작한다. 아직 재난이라고 부를 정도는 아니지만 가족의 위치와 이동 계획을 다시 확인할 이유는 충분하다.',
    lastFamilyDecision: null,
    log: [],
  }
}

function passiveAction(id: string, label: string, minutes: number): QueuedAction {
  return {
    id,
    label,
    actors: ['player'],
    proposal: { time_delta_min: minutes, moves: [], resource_changes: [], world_changes: [] },
  }
}

function travelAction(state: LiveState, destination: string, id: string, label: string): QueuedAction {
  const from = state.party.player.location
  const moves: QueuedAction['proposal']['moves'] = [
    { entity_type: 'party', entity_id: 'player', from, to: destination },
  ]
  const car = state.vehicles.family_car
  if (car?.operator === 'player' && car.location === from) {
    moves.push({ entity_type: 'vehicle', entity_id: 'family_car', from, to: destination })
  }
  return {
    id,
    label,
    actors: ['player'],
    exclusive_resources: car?.operator === 'player' && car.location === from ? ['family_car'] : undefined,
    proposal: { time_delta_min: from === destination ? 5 : 20, moves: from === destination ? [] : moves, resource_changes: [], world_changes: [] },
  }
}

export function actionForIntent(state: SliceState, intent: SliceIntent, idSuffix = `t${state.turn + 1}`): SliceChoice {
  const playerLocation = state.live.party.player.location
  switch (intent) {
    case 'go_home':
      return { id: 2, label: playerLocation === '도심 아파트' ? '집 주변을 확인한다' : '도심 아파트로 이동한다', intent, action: travelAction(state.live, '도심 아파트', `go-home-${idSuffix}`, '도심 아파트 이동') }
    case 'go_base':
      return { id: 2, label: playerLocation === '외곽거점' ? '외곽거점 주변을 확인한다' : '외곽거점으로 이동한다', intent, action: travelAction(state.live, '외곽거점', `go-base-${idSuffix}`, '외곽거점 이동') }
    case 'call_wife':
      return { id: 3, label: '서윤에게 연락해 현재 위치를 유지해 달라고 한다', intent, action: passiveAction(`call-wife-${idSuffix}`, '서윤에게 연락', 5), familyRequest: { member: 'wife', request: 'hold_position' } }
    case 'call_father':
      return { id: 4, label: '정호에게 외곽 주변을 확인해 달라고 부탁한다', intent, action: passiveAction(`call-father-${idSuffix}`, '정호에게 연락', 5), familyRequest: { member: 'father', request: 'check_local_area' } }
    case 'check_resources':
      return { id: 1, label: '가족과 현재 물자를 다시 확인한다', intent, action: passiveAction(`check-resources-${idSuffix}`, '자원 확인', 5) }
    case 'wait':
      return { id: 5, label: '15분 기다리며 상황 변화를 본다', intent, action: passiveAction(`wait-${idSuffix}`, '기다리며 관찰', 15) }
    case 'observe':
    default:
      return { id: 1, label: '주변 상황과 공식 안내를 확인한다', intent: 'observe', action: passiveAction(`observe-${idSuffix}`, '상황 관찰', 5) }
  }
}

export function choicesForState(state: SliceState): SliceChoice[] {
  const travelIntent: SliceIntent = state.live.party.player.location === '도심 아파트' ? 'go_base' : 'go_home'
  return [
    actionForIntent(state, 'observe'),
    actionForIntent(state, travelIntent),
    actionForIntent(state, 'call_wife'),
    actionForIntent(state, 'call_father'),
    actionForIntent(state, 'wait'),
  ]
}

function eventResourceChanges(live: LiveState, eventId: string): ResourceChange[] {
  if (eventId === 'cell_congestion' && live.resources.communications) {
    const current = live.resources.communications.band
    const next = current === '불안정' ? '매우 불안정' : '불안정'
    return [{ resource_id: 'communications', from: current, to: next }]
  }
  if (eventId === 'power_flicker' && live.resources.power) {
    return [{ resource_id: 'power', from: live.resources.power.band, to: '불안정' }]
  }
  if (eventId === 'official_update' && live.resources.communications?.band === '매우 불안정') {
    return [{ resource_id: 'communications', from: '매우 불안정', to: '불안정' }]
  }
  return []
}

export function executeTurn(state: SliceState, choice: SliceChoice): TurnResult {
  const playerRun = runActionQueue(state.live, [choice.action])
  const playerResult = playerRun.results[0]
  if (!playerResult || (playerResult.validation.status !== 'ACCEPT' && playerResult.validation.status !== 'ACCEPT_WITH_ADJUSTMENT')) {
    return {
      choiceLabel: choice.label,
      validation: playerResult?.validation ?? null,
      state: {
        ...state,
        narrative: `행동을 실행할 수 없다. ${playerResult?.validation.issues.map((item) => item.message).join(' / ') ?? '현재 상태를 다시 확인해야 한다.'}`,
      },
    }
  }

  let live = playerRun.state
  let rng = state.rng
  const family = decideFamilyRequest(live, state.pressure, choice.familyRequest, rng, state.turn + 1)
  rng = family.rng
  let familyValidator = 'none'
  if (family.decision?.action) {
    const familyRun = runActionQueue(live, [family.decision.action])
    const result = familyRun.results[0]
    familyValidator = result?.validation.status ?? 'none'
    if (result?.validation.status === 'ACCEPT' || result?.validation.status === 'ACCEPT_WITH_ADJUSTMENT') live = familyRun.state
  }

  const directorInput: SliceState = { ...state, live, rng }
  const director = chooseWorldEvent(directorInput)
  rng = director.rng
  const event = director.event
  let pressure = state.pressure
  let narrative = '큰 변화는 없다. 시간이 흐르는 동안 각자의 위치와 선택이 조금씩 무게를 갖는다.'

  if (event) {
    pressure = clampPressure(state.pressure + event.pressureDelta)
    const worldAction: QueuedAction = {
      id: `world-${event.id}-${state.turn + 1}`,
      label: `외부 변화: ${event.title}`,
      actors: [],
      proposal: {
        time_delta_min: 0,
        moves: [],
        resource_changes: eventResourceChanges(live, event.id),
        world_changes: [
          { key: 'current_event', from: live.public_world.current_event, to: event.id },
          { key: 'threat_pressure', from: live.public_world.threat_pressure, to: pressure },
        ],
      },
    }
    const worldRun = runActionQueue(live, [worldAction])
    const result = worldRun.results[0]
    if (result?.validation.status === 'ACCEPT' || result?.validation.status === 'ACCEPT_WITH_ADJUSTMENT') live = worldRun.state
    narrative = event.narrative
  } else if ((state.turn + 1) % 4 === 0) {
    pressure = clampPressure(state.pressure + 1)
    const pressureAction: QueuedAction = {
      id: `world-pressure-${state.turn + 1}`,
      label: '외부 압력 누적',
      actors: [],
      proposal: {
        time_delta_min: 0,
        moves: [],
        resource_changes: [],
        world_changes: [{ key: 'threat_pressure', from: live.public_world.threat_pressure, to: pressure }],
      },
    }
    const pressureRun = runActionQueue(live, [pressureAction])
    const result = pressureRun.results[0]
    if (result?.validation.status === 'ACCEPT' || result?.validation.status === 'ACCEPT_WITH_ADJUSTMENT') live = pressureRun.state
  }

  const elapsedMinutes = choice.action.proposal.time_delta_min + (family.decision?.action?.proposal.time_delta_min ?? 0)
  const nextTurn = state.turn + 1
  const next: SliceState = {
    ...state,
    live,
    rng,
    turn: nextTurn,
    pressure,
    currentEventId: event?.id ?? null,
    recentEvents: event ? [...state.recentEvents, { id: event.id, turn: nextTurn }].slice(-12) : state.recentEvents,
    narrative,
    lastFamilyDecision: family.decision,
    log: [...state.log, {
      turn: nextTurn,
      action: choice.label,
      elapsedMinutes,
      eventId: event?.id ?? null,
      familyDecision: family.decision?.kind ?? null,
      validator: `${playerResult.validation.status}/${familyValidator}`,
      repetitionGuard: director.repetitionGuard,
    }],
  }

  return { state: next, validation: playerResult.validation, choiceLabel: choice.label }
}
