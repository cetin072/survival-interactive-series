import type { LiveState } from './liveState'
import { advanceClock, movePartyMember, moveVehicle, setResourceBand } from './transitions'

export function applyDemoChoice(state: LiveState, choiceId: number): LiveState {
  switch (choiceId) {
    case 1:
      return advanceClock(moveVehicle(movePartyMember(state, 'player', '학교'), 'family_car', '학교'), 20)
    case 2:
      return advanceClock(moveVehicle(movePartyMember(state, 'player', '도심 아파트'), 'family_car', '도심 아파트'), 15)
    case 3:
      return advanceClock(state, 10)
    case 4:
      return advanceClock(setResourceBand(state, 'communications', '점검 중'), 5)
    default:
      return state
  }
}
