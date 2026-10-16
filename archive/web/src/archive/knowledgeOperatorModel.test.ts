import { describe, expect, it } from 'vitest'
import { knowledgeBucketFor, knowledgeBucketLabel, type KnowledgeItem } from './knowledgeOperatorModel'

const item = (review_status?: string): KnowledgeItem => ({
  job_id: '1', status: 'HUMAN_REVIEW', result_decision: 'BRIEF_READY', review_status,
})

describe('Knowledge operator review queue', () => {
  it("keeps unreviewed content in the person's inbox regardless of semantic decision", () => {
    expect(knowledgeBucketFor(item('PENDING'))).toBe('REVIEW')
    expect(knowledgeBucketFor(item())).toBe('REVIEW')
  })

  it('shows human-check approval separately and never calls it published', () => {
    expect(knowledgeBucketFor(item('APPROVED'))).toBe('APPROVED')
    expect(knowledgeBucketLabel.APPROVED).toBe('휴먼체크 완료')
    expect(knowledgeBucketFor({ ...item('APPROVED'), status: 'PUBLISHED' })).toBe('PUBLISHED')
  })

  it('keeps hold and rejection in the archive', () => {
    expect(knowledgeBucketFor(item('HOLD'))).toBe('HELD')
    expect(knowledgeBucketFor(item('REJECTED'))).toBe('HELD')
    expect(knowledgeBucketFor({ ...item('PENDING'), status: 'BLOCKED' })).toBe('HELD')
  })
})
