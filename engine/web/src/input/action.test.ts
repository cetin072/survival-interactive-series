import { describe, expect, it } from 'vitest'
import { choiceForKey, choiceLog, choiceShortcutFromText, freeActionLog } from './action'

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

  it('interprets short numeric text as visible choice shortcuts', () => {
    expect(choiceShortcutFromText('1번', choices)).toEqual({ kind: 'choices', choiceIds: [1] })
    expect(choiceShortcutFromText('선택 2', choices)).toEqual({ kind: 'choices', choiceIds: [2] })
    expect(choiceShortcutFromText('1번 → 2번', choices)).toEqual({ kind: 'choices', choiceIds: [1, 2] })
  })

  it('does not steal ordinary free-action prose containing numbers', () => {
    expect(choiceShortcutFromText('1시간 기다린 뒤 무전기를 확인한다', choices)).toBeUndefined()
  })

  it('rejects unavailable, duplicate, or over-limit numeric shortcuts', () => {
    expect(choiceShortcutFromText('3번', choices)).toMatchObject({ kind: 'invalid' })
    expect(choiceShortcutFromText('1 1', choices)).toMatchObject({ kind: 'invalid' })
    expect(choiceShortcutFromText('1 2 3', [...choices, { id: 3, label: '대기한다' }])).toMatchObject({ kind: 'invalid' })
  })
})
