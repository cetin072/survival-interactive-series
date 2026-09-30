import { describe, expect, it } from 'vitest'
import { chronicleGraphIds, chronicleHasGraph } from './chronicleGraphRegistry'
import { chronicleRegistry } from './chronicleRegistry'

describe('Chronicle graph isolation', () => {
  it('loads all three Chronicle records without borrowing graph data', () => {
    expect(chronicleRegistry.map((chronicle) => chronicle.id)).toEqual(['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL'])
    expect(chronicleHasGraph('C01-HAN-JUNHO')).toBe(false)
    expect(chronicleHasGraph('C02-STRONGHOLD')).toBe(false)
    expect(chronicleHasGraph('C03-AFTERFALL')).toBe(true)
    expect([...chronicleGraphIds]).toEqual(['C03-AFTERFALL'])
  })
})
