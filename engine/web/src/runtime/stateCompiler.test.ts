import { describe, expect, it } from 'vitest'
import { runtimeCanon } from './runtimeCanon'
import { baselineCharacters, baselineRuntime } from './fixtures'
import { compileStateConsole } from './stateCompiler'

describe('deterministic State Compiler', () => {
  it('produces identical output for identical input without mutating source state', () => {
    const source = structuredClone(baselineRuntime)
    const before = JSON.stringify(source)
    const first = compileStateConsole(source, baselineCharacters, runtimeCanon)
    const second = compileStateConsole(source, baselineCharacters, runtimeCanon)
    expect(second).toEqual(first)
    expect(JSON.stringify(source)).toBe(before)
  })

  it('derives family name, age, sex, and relation from CHARACTERS', () => {
    const view = compileStateConsole(baselineRuntime, baselineCharacters, runtimeCanon)
    expect(view.family[0]).toMatchObject({ id: 'player', name: '한준호', age: 41, sex: '남성', relation: '본인' })
    expect(view.family.map((member) => member.name)).toEqual(['한준호', '서윤', '민석', '정호'])
  })

  it('renders missing optional sections as empty collections', () => {
    const minimal = structuredClone(baselineRuntime)
    delete minimal.vehicles
    delete minimal.resources
    delete minimal.bases
    delete minimal.active_actions
    delete minimal.recent_changes
    const view = compileStateConsole(minimal, baselineCharacters, runtimeCanon)
    expect(view.vehicles).toEqual([])
    expect(view.resources).toEqual([])
    expect(view.bases).toEqual([])
    expect(view.active_actions).toEqual([])
    expect(view.recent_changes).toEqual([])
  })

  it('accepts the repository baseline with no consistency warning', () => {
    expect(compileStateConsole(baselineRuntime, baselineCharacters, runtimeCanon).warnings).toEqual([])
  })
})
