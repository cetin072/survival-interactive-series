import { describe, expect, it } from 'vitest'
import {
  formatOperatorRefreshTime,
  formatOperatorTime,
  operatorStaticStatus,
  productionStatusTone,
  shortSha,
  visualStatusTone,
  statusWithKorean,
  explainMachineCode,
  subjectWithKorean,
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
    expect(statusWithKorean('PREPARED')).toBe('PREPARED · 생성 준비')
    expect(statusWithKorean('FINALIZING')).toBe('FINALIZING · 후처리 중')
    expect(statusWithKorean('EXTRACTOR_READY')).toBe('EXTRACTOR_READY · Extractor 대기')
    expect(statusWithKorean('REVIEW_READY')).toBe('REVIEW_READY · Reviewer 대기')
    expect(statusWithKorean('REJECT')).toBe('REJECT · 반려')
    expect(explainMachineCode('NO_ACCEPTABLE_CANDIDATE')).toBe('사용할 수 있는 결과가 없음')
    expect(explainMachineCode('QUALITY_GATE')).toBe('품질 검수 단계')
    expect(explainMachineCode('RENDERER_NOT_CONSUMED')).toBe('Renderer 미실행 또는 장기 대기 의심')
    expect(explainMachineCode('REVIEWER_NOT_CONSUMED')).toBe('Reviewer 미실행 또는 파일 처리 지연 의심')
    expect(explainMachineCode('REVIEWER_NOT_COMPLETED')).toBe('Reviewer 판정 장기 대기 의심')
    expect(explainMachineCode('A_WIKI_COMMAND_GH_1')).toBe('GitHub 처리 실패 · 재시도 또는 권한 상태 확인')
    expect(subjectWithKorean('char-taehoon')).toBe('장태훈 · char-taehoon')
    expect(timezoneWithKorean('Asia/Seoul')).toBe('한국시간 · Asia/Seoul')
  })
})
