import { describe, expect, it } from 'vitest'
import {
  knowledgeMediaMaxPublishedBytes,
  knowledgeMediaObjectPath,
} from './knowledgeMedia'

describe('Knowledge media upload boundary', () => {
  it('keeps the public image budget at 200KB', () => {
    expect(knowledgeMediaMaxPublishedBytes).toBe(200 * 1024)
  })

  it('creates a deterministic Knowledge-only object path shape', () => {
    expect(knowledgeMediaObjectPath(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    )).toBe('knowledge/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp')
  })

  it('rejects invalid job or asset identities', () => {
    expect(() => knowledgeMediaObjectPath('not-a-job', '22222222-2222-4222-8222-222222222222')).toThrow(/JOB_ID_INVALID/)
    expect(() => knowledgeMediaObjectPath('11111111-1111-4111-8111-111111111111', 'not-an-asset')).toThrow(/ASSET_ID_INVALID/)
  })
})
