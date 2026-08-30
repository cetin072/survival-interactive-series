import { describe, expect, it } from 'vitest'
import { runActionQueue } from '../controller/actionQueue'
import { regressionFixtures } from './fixtures/regressionFixtures'
import { validateAction } from './validateAction'

describe('S01–S05 consistency error-class regression fixtures', () => {
  it('blocks the family together/location mismatch caught by the later TURN STATE GATE', () => {
    const fixture = regressionFixtures.familyLocationGate()
    expect(validateAction(fixture.state, fixture.action)).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'PARTY_LOCATION_CONFLICT' }],
    })
  })

  it('blocks a vehicle/operator location mismatch', () => {
    const fixture = regressionFixtures.vehicleOperatorMismatch()
    expect(validateAction(fixture.state, fixture.action)).toMatchObject({
      status: 'NEED_GM_REPLAN', issues: [{ code: 'VEHICLE_LOCATION_CONFLICT' }],
    })
  })

  it('blocks a completed family action being offered again', () => {
    const fixture = regressionFixtures.completedActionReplay()
    expect(validateAction(fixture.state, fixture.action)).toMatchObject({
      status: 'REJECT_STATE_CONFLICT', issues: [{ code: 'COMPLETED_ACTION_REPEAT' }],
    })
  })

  it('blocks simultaneous actions assigned to the same family member', () => {
    const fixture = regressionFixtures.simultaneousActorConflict()
    expect(validateAction(fixture.state, fixture.action)).toMatchObject({
      status: 'REJECT_STATE_CONFLICT', issues: [{ code: 'ACTIVE_ACTION_CONFLICT' }],
    })
  })

  it('charges sequential opportunity cost instead of granting every selected action', () => {
    const fixture = regressionFixtures.sequentialOpportunityCost()
    const result = runActionQueue(fixture.state, fixture.actions)
    expect(result.results.map((item) => item.outcome)).toEqual(['success', 'opportunity_lost'])
  })
})
