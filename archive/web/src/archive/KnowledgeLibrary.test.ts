import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const publicRoot = resolve(process.cwd(), 'public')
const readText = (path: string) => readFileSync(resolve(publicRoot, path), 'utf8')

describe('Survival Knowledge public surface', () => {
  it('lists both approved knowledge articles', () => {
    const html = readText('knowledge/index.html')
    expect(html).toContain('/knowledge/emergency-supplies-inventory/')
    expect(html).toContain('/knowledge/family-emergency-contact-plan/')
  })

  it('keeps internal editorial evidence out of the first public article', () => {
    const html = readText('knowledge/emergency-supplies-inventory/index.html')
    expect(html).not.toContain('Evidence Pack')
    expect(html).not.toContain('자동 QA')
    expect(html).toContain('/knowledge/downloads/survival-diary-emergency-inventory-v1.xlsx')
  })

  it('ships a real XLSX download rather than a placeholder link', () => {
    const bytes = readFileSync(resolve(publicRoot, 'knowledge/downloads/survival-diary-emergency-inventory-v1.xlsx'))
    expect(bytes.length).toBeGreaterThan(10_000)
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK')
  })

  it('publishes the second article with current official source links', () => {
    const html = readText('knowledge/family-emergency-contact-plan/index.html')
    expect(html).toContain('가족 비상연락 계획은 어떻게 만들어두면 좋은가')
    expect(html).toContain('safekorea.go.kr')
    expect(html).not.toContain('Evidence Pack')
    expect(html).not.toContain('자동 QA')
  })
})
