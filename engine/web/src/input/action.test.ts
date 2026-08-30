import { describe, expect, it } from 'vitest'
import { choiceForKey, choiceLog, freeActionLog } from './action'

const choices = [{ id: 1, label: '학교로 이동한다' }, { id: 2, label: '집으로 이동한다' }]

describe('M0 input helpers', () => {
  it('maps keys 1–4 to available choices only', () => {
    expect(choiceForKey('1', choices)).toEqual(choices[0])
    expect(choiceForKey('4', choices)).toBeUndefined()
    expect(choiceForKey('x', choices)).toBeUndefined()
  })

  it('creates log entries for choice and free input', () => {
    expect(choiceLog(choices[1], 2).text).toContain('집으로 이동한다')
    expect(freeActionLog('가족에게 전화한다', 3)).toMatchObject({ kind: 'free-action', id: 3 })
  })
})
