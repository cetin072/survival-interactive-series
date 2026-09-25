import { describe, expect, it } from 'vitest'
import { archiveNodes } from './archiveData'
import { characterAppearanceAudit, characterAppearanceByNodeId, confirmedAppearanceFor } from './characterAppearance'
import { basicInfoRows } from './ExplorerView'

describe('character appearance publication', () => {
  it('publishes a compact appearance only for characters with a confirmed anchor', () => {
    const jinwoo = archiveNodes.find((node) => node.id === 'char-jinwoo')!
    expect(confirmedAppearanceFor(jinwoo)?.publicDescription).toContain('176cm')
    expect(basicInfoRows(jinwoo).find((row) => row.label === '외형')?.value).toContain('176cm')

    const location = archiveNodes.find((node) => node.type === 'location')!
    expect(confirmedAppearanceFor(location)).toBeUndefined()
    expect(basicInfoRows(location).some((row) => row.label === '외형')).toBe(false)
  })

  it('keeps structured visual canon and source provenance for every confirmed anchor', () => {
    for (const id of characterAppearanceAudit.confirmed) {
      const anchor = characterAppearanceByNodeId[id]
      expect(anchor.sourceRefs.length, id).toBeGreaterThan(0)
      expect(anchor.publicDescription?.length, id).toBeGreaterThan(20)
      expect(Object.keys(anchor.visual).length, id).toBeGreaterThan(0)
    }
  })

  it('does not fabricate missing appearances and records them for future backfill', () => {
    const characterIds = archiveNodes.filter((node) => node.type === 'character').map((node) => node.id).sort()
    expect(Object.keys(characterAppearanceByNodeId).sort()).toEqual(characterIds)

    for (const id of characterAppearanceAudit.visualBackfillNeeded) {
      const anchor = characterAppearanceByNodeId[id]
      expect(anchor.publicDescription).toBeUndefined()
      expect(anchor.sourceRefs).toEqual([])
      expect(anchor.auditNote).toContain('외형 앵커')
    }
  })
})
