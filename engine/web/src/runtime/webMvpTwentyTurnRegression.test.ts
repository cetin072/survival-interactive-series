import { describe, expect, it } from 'vitest'
import { commitWebMvpChoice, createWebMvpTestSession } from './webMvpTestSession'

describe('WEB MVP 20-turn regression', () => {
  it('keeps numbered-choice play advancing through at least 20 committed turns', () => {
    let checkpoint = createWebMvpTestSession()

    checkpoint = commitWebMvpChoice(checkpoint, 3)
    expect(checkpoint.committed_turn.number).toBe(1)
    expect(checkpoint.current_scene.id).toBe('test-communications')

    for (let turn = 2; turn <= 20; turn += 1) {
      const before = checkpoint.committed_turn.number
      checkpoint = commitWebMvpChoice(checkpoint, turn % 2 === 0 ? 1 : 2)
      expect(checkpoint.committed_turn.number).toBe(before + 1)
      expect(checkpoint.current_scene.id).toBe('test-communications')
    }

    expect(checkpoint.committed_turn.number).toBe(20)
    const completedIds = checkpoint.public_state.completed_actions.map((action) => action.id)
    expect(new Set(completedIds).size).toBe(completedIds.length)
  })
})
