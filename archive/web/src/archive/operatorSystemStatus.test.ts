import { describe, expect, it } from 'vitest'
import {
  formatOperatorTime,
  operatorStaticStatus,
  productionStatusTone,
  shortSha,
  visualStatusTone,
} from './operatorSystemStatus'

describe('Operator system status helpers', () => {
  it('exposes checked-in automation configuration without inventing run data', () => {
    expect(operatorStaticStatus.archive.mode).toBeTruthy()
    expect(typeof operatorStaticStatus.knowledge.workerEnabled).toBe('boolean')
    expect(operatorStaticStatus.release.productionIntervalDays).toBeGreaterThan(0)
  })

  it('formats status values safely', () => {
    expect(formatOperatorTime(null)).toBe('기록 없음')
    expect(shortSha('1234567890abcdef')).toBe('12345678')
    expect(visualStatusTone('BLOCKED')).toBe('warning')
    expect(visualStatusTone('SUCCESS')).toBe('ok')
    expect(productionStatusTone('production')).toBe('ok')
  })
})
