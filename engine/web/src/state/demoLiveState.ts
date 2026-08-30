import { LIVE_STATE_VERSION, type LiveState } from './liveState'

export const demoLiveState: LiveState = {
  version: LIVE_STATE_VERSION,
  season_id: 'DEMO',
  scene_id: 'scene_001',
  clock: { day: 1, date: null, time: '17:40', phase: 'P1' },
  party: {
    player: { name: '준호', location: '회사 · 도심', with: [], status: 'normal' },
    wife: { name: '서윤', location: '도심 아파트', with: [], status: 'normal' },
    son: { name: '민석', location: '학교', with: [], status: 'normal' },
    father: { name: '정호', location: '외곽거점', with: [], status: 'normal' },
  },
  vehicles: {
    family_car: { name: '가족 차량', location: '회사 · 도심', status: 'available', operator: 'player' },
  },
  bases: {
    rural_base: { name: '외곽거점', location: '외곽', status: 'available' },
  },
  resources: {
    water: { name: '물', icon: '💧', band: '보통' },
    communications: { name: '통신', icon: '📡', band: '불안정' },
  },
  institutions: {},
  routes_known: {},
  active_actions: [],
  completed_actions: [],
  public_world: { region: '도심' },
  last_change: {},
  renderer_flags: { show_status: true },
}
