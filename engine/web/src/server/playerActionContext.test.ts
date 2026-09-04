import { describe, expect, it } from 'vitest'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import { addChoiceReferenceContext } from './playerActionContext'

describe('provider-facing free-action choice reference context', () => {
  it('expands a referenced visible choice without changing the checkpoint', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const request = {
      checkpoint,
      input: { kind: 'free-action' as const, text: '아버지에게 연락하고 1번을 후속 진행한다' },
    }

    const expanded = addChoiceReferenceContext(request)

    expect(expanded.input.kind).toBe('free-action')
    if (expanded.input.kind !== 'free-action') throw new Error('unexpected input kind')
    expect(expanded.input.text).toContain('아버지에게 연락하고 1번을 후속 진행한다')
    expect(expanded.input.text).toContain('1번 = 민석에게 연락하고 학원 쪽으로 움직일 준비를 한다')
    expect(expanded.checkpoint).toBe(checkpoint)
    expect(request.input.text).toBe('아버지에게 연락하고 1번을 후속 진행한다')
  })

  it('supports spaced and multiple references once each', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const expanded = addChoiceReferenceContext({
      checkpoint,
      input: { kind: 'free-action', text: '1 번 먼저 하고 3번과 1번을 참고한다' },
    })

    if (expanded.input.kind !== 'free-action') throw new Error('unexpected input kind')
    expect(expanded.input.text.match(/1번 =/g)).toHaveLength(1)
    expect(expanded.input.text).toContain('3번 = 서윤과 통화해 가족의 합류 순서와 기준부터 정한다')
  })

  it('leaves ordinary free actions untouched', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const request = { checkpoint, input: { kind: 'free-action' as const, text: '랜드마크에서 민석과 만나자' } }
    expect(addChoiceReferenceContext(request)).toBe(request)
  })
})
