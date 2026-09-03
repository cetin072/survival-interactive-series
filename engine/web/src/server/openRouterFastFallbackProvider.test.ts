import { describe, expect, it } from 'vitest'
import { createStorytellingBenchmarkSession } from '../runtime/storytellingBenchmarkSession'
import { repairFastFallbackCandidate } from './openRouterFastFallbackProvider'

describe('Fast fallback repair', () => {
  it('repairs missing choices, action resolution, and open threads from public checkpoint context', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    checkpoint.public_state.public_world.gm_open_threads = ['정호의 외곽 대피 여부 확인']

    const candidate = repairFastFallbackCandidate({
      checkpoint,
      input: { kind: 'free-action', text: '아버지는 바로 대피하게 하고 민석을 데리러 간다' },
    }, {
      story: '## 18:22 — 회사 주차장\n\n준호는 정호에게 대피를 촉구하고 민석을 데리러 갈 준비를 시작한다.',
      choices: ['민석을 먼저 회수한다', '외곽 위험이 커지기 전에 합류 계획을 바꾼다'],
    })

    expect(candidate).toBeDefined()
    expect(candidate?.choices).toHaveLength(4)
    expect(candidate?.action_resolution?.status).toBe('attempted')
    expect(candidate?.action_resolution?.summary).toContain('민석을 데리러 간다')
    expect(candidate?.open_threads).toEqual(['정호의 외곽 대피 여부 확인'])
  })

  it('rejects output with no usable story even if choices exist', () => {
    const checkpoint = createStorytellingBenchmarkSession()
    const candidate = repairFastFallbackCandidate({
      checkpoint,
      input: { kind: 'numbered-choice', choice_id: 1 },
    }, {
      story: '',
      choices: ['민석을 데리러 간다'],
    })

    expect(candidate).toBeUndefined()
  })
})
