import { describe, expect, it } from 'vitest'
import { commitWebMvpChoice, createWebMvpTestSession } from './webMvpTestSession'

function advanceToTurn(target: number, firstChoice: number) {
  let checkpoint = createWebMvpTestSession()
  checkpoint = commitWebMvpChoice(checkpoint, firstChoice)
  expect(checkpoint.committed_turn.number).toBe(1)

  const narratives = new Set([checkpoint.current_scene.narrative])
  while (checkpoint.committed_turn.number < target) {
    const before = checkpoint.committed_turn.number
    const preferred = checkpoint.committed_turn.number % 2 === 0 ? 2 : 1
    const choiceId = checkpoint.current_scene.choices.some((choice) => choice.id === preferred)
      ? preferred
      : checkpoint.current_scene.choices[0].id
    checkpoint = commitWebMvpChoice(checkpoint, choiceId)
    expect(checkpoint.committed_turn.number).toBe(before + 1)
    narratives.add(checkpoint.current_scene.narrative)
  }
  return { checkpoint, narratives }
}

describe('WEB MVP 20-turn regression', () => {
  it.each([1, 2, 3])('keeps initial choice %i advancing through at least 12 committed turns', (firstChoice) => {
    const { checkpoint } = advanceToTurn(12, firstChoice)
    expect(checkpoint.committed_turn.number).toBe(12)
    const completedIds = checkpoint.public_state.completed_actions.map((action) => action.id)
    expect(new Set(completedIds).size).toBe(completedIds.length)
  })

  it('keeps a 20-turn run visibly changing instead of looking frozen', () => {
    const { checkpoint, narratives } = advanceToTurn(20, 3)
    expect(checkpoint.committed_turn.number).toBe(20)
    expect(narratives.size).toBeGreaterThanOrEqual(12)
    expect(checkpoint.current_scene.narrative).toMatch(/연속 점검 \d+/)
    expect(checkpoint.current_scene.choices.every((choice) => /^\d+\./.test(choice.label))).toBe(true)
  })
})
