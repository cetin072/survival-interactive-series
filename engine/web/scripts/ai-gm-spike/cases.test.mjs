import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('AI GM spike cases', () => {
  it('keeps at least twenty uniquely identified Korean action fixtures', async () => {
    const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'))
    expect(cases.length).toBeGreaterThanOrEqual(20)
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length)
    expect(cases.every((item) => item.input && item.expected && item.allowed)).toBe(true)
  })
})
