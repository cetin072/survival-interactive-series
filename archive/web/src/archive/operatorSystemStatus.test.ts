import { describe, expect, it } from 'vitest'
import {
  formatOperatorRefreshTime,
  formatOperatorTime,
  operatorStaticStatus,
  productionStatusTone,
  shortSha,
  visualStatusTone,
  statusLabel,
  blockerLabel,
  decisionLabel,
  jobTypeLabel,
  sessionLabel,
  sourceKindLabel,
  statusWithKorean,
  explainMachineCode,
  subjectWithKorean,
  timezoneLabel,
  timezoneWithKorean,
} from './operatorSystemStatus'

describe('Operator system status helpers', () => {
  it('exposes checked-in automation configuration without inventing run data', () => {
    expect(operatorStaticStatus.archive.mode).toBeTruthy()
    expect(typeof operatorStaticStatus.knowledge.workerEnabled).toBe('boolean')
    expect(operatorStaticStatus.release.productionIntervalDays).toBeGreaterThan(0)
  })

  it('formats status values safely', () => {
    expect(formatOperatorTime(null)).toBe('기록 없음')
    expect(formatOperatorRefreshTime(null)).toBe('아직 없음')
    expect(formatOperatorRefreshTime('2026-10-03T05:03:12.000Z')).toContain('14:03:12')
    expect(shortSha('1234567890abcdef')).toBe('12345678')
    expect(visualStatusTone('BLOCKED')).toBe('warning')
    expect(visualStatusTone('SUCCESS')).toBe('ok')
    expect(visualStatusTone('SUCCEEDED')).toBe('ok')
    expect(visualStatusTone('PREPARED')).toBe('neutral')
    expect(visualStatusTone('REVIEW_REJECTED')).toBe('warning')
    expect(productionStatusTone('production')).toBe('ok')
  })

  it('adds short Korean explanations without hiding machine codes', () => {
    expect(statusWithKorean('AUTO')).toBe('AUTO · 자동 운영')
    expect(statusWithKorean('BLOCKED')).toBe('BLOCKED · 작업 중단')
    expect(statusWithKorean('PREPARED')).toBe('PREPARED · 작업 준비')
    expect(statusWithKorean('FINALIZING')).toBe('FINALIZING · 게시 반영 중')
    expect(statusWithKorean('EXTRACTOR_READY')).toBe('EXTRACTOR_READY · 내용 추출 대기')
    expect(statusWithKorean('REVIEW_READY')).toBe('REVIEW_READY · 내용 검수 대기')
    expect(statusWithKorean('REJECT')).toBe('REJECT · 반려')
    expect(statusWithKorean('SUPERSEDED')).toBe('SUPERSEDED · 새 승인 결과로 대체됨')
    expect(explainMachineCode('NO_ACCEPTABLE_CANDIDATE')).toBe('사용할 수 있는 결과가 없음')
    expect(explainMachineCode('QUALITY_GATE')).toBe('품질 검수 단계')
    expect(explainMachineCode('RENDERER_NOT_CONSUMED')).toBe('이미지 생성 작업이 오래 시작되지 않았습니다.')
    expect(explainMachineCode('REVIEWER_NOT_CONSUMED')).toBe('이미지 검수 작업이 오래 시작되지 않았습니다.')
    expect(explainMachineCode('REVIEWER_NOT_COMPLETED')).toBe('이미지 검수가 오래 끝나지 않고 있습니다.')
    expect(explainMachineCode('A_WIKI_COMMAND_GH_1')).toBe('위키 게시 반영 작업에 실패했습니다. 재시도가 필요합니다.')
    expect(subjectWithKorean('char-taehoon')).toBe('장태훈 · char-taehoon')
    expect(timezoneWithKorean('Asia/Seoul')).toBe('한국시간 · Asia/Seoul')
  })

  it('provides plain-language labels for the dashboard', () => {
    expect(statusLabel('EXTRACTOR_READY')).toBe('내용 추출 대기')
    expect(statusLabel('INGESTING')).toBe('파일 처리 중')
    expect(blockerLabel('A_WIKI_COMMAND_GH_1')).toContain('위키 게시 반영')
    expect(decisionLabel('BRIEF_READY')).toBe('글 초안 준비 완료')
    expect(jobTypeLabel('BACKFILL_BRIEF')).toBe('기존 기록에서 지식 글 만들기')
    expect(sourceKindLabel('PUBLIC_READER')).toBe('공개 이야기 기록')
    expect(sessionLabel('SESSION_007')).toBe('7번째 기록 묶음')
    expect(timezoneLabel('Asia/Seoul')).toBe('한국시간')
  })
})
