import { describe, expect, it } from 'vitest'
import { knowledgeBucketFor, knowledgeBucketLabel, knowledgeReviewJobMap, type KnowledgeItem } from './knowledgeOperatorModel'

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
    expect(knowledgeBucketLabel.APPROVED).toBe('발행 중')
    expect(knowledgeBucketFor({ ...item('APPROVED'), status: 'PUBLISHED' })).toBe('PUBLISHED')
  })

  it('keeps hold and rejection in the archive', () => {
    expect(knowledgeBucketFor(item('HOLD'))).toBe('HELD')
    expect(knowledgeBucketFor(item('REJECTED'))).toBe('HELD')
    expect(knowledgeBucketFor({ ...item('PENDING'), status: 'BLOCKED' })).toBe('HELD')
  })
})


describe('Existing review inbox to Knowledge editor mapping', () => {
  it('links exact review-item UUID to exact Knowledge job UUID without exposing source URLs', () => {
    const reviewId = '263d256d-2cf8-45cf-82fb-98aab2e52d12'
    const jobId = 'c8da8c82-c60c-4dd9-9556-b3f0d08c9507'
    const map = knowledgeReviewJobMap({
      total_count: 2, working_count: 0, review_count: 2, held_count: 0, published_count: 0,
      items: [
        { ...item('PENDING'), job_id: jobId, review_item_id: reviewId },
        { ...item('PENDING'), job_id: '../../unsafe', review_item_id: 'abc' },
      ],
    })
    expect(map).toEqual({ [reviewId]: jobId })
    expect(knowledgeReviewJobMap(null)).toEqual({})
  })
})
