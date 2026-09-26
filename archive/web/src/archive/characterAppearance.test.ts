import { describe, expect, it } from 'vitest'
import { archiveNodes } from './archiveData'
import { characterAppearanceAudit, characterAppearanceByNodeId, confirmedAppearanceFor } from './characterAppearance'
import { basicInfoRows } from './ExplorerView'
import backfill from '../../../content/characters/C03-AFTERFALL/APPEARANCE_BACKFILL_V1.json'

const names = archiveNodes.filter((node) => node.type === 'character')

describe('character appearance publication', () => {
  it('publishes exactly one nonempty appearance row for every published character', () => {
    expect(names).toHaveLength(18)
    expect(Object.keys(characterAppearanceByNodeId).sort()).toEqual(names.map((node) => node.id).sort())
    for (const node of names) {
      const rows = basicInfoRows(node).filter((row) => row.label === '외형')
      expect(rows, node.label).toHaveLength(1)
      expect(rows[0].value.length, node.label).toBeGreaterThan(40)
      expect(confirmedAppearanceFor(node)?.sourceRefs.length, node.label).toBeGreaterThan(0)
    }
    expect(characterAppearanceAudit.confirmed).toHaveLength(18)
    expect(characterAppearanceAudit.visualBackfillNeeded).toEqual([])
  })

  it('does not invent an appearance for an unknown future character or noncharacter', () => {
    const location = archiveNodes.find((node) => node.type === 'location')!
    expect(confirmedAppearanceFor(location)).toBeUndefined()
    expect(basicInfoRows(location).some((row) => row.label === '외형')).toBe(false)
    expect(confirmedAppearanceFor({ ...names[0], id: 'char-not-established' })).toBeUndefined()
  })

  it('retains established Jinwoo, Mira and Minho anchors', () => {
    expect(characterAppearanceByNodeId['char-jinwoo'].publicDescription).toContain('176cm')
    expect(characterAppearanceByNodeId['char-mira'].publicDescription).toContain('스포츠시계')
    expect(characterAppearanceByNodeId['char-mira'].visual.distinctive).toEqual(['연한 흙자국이 밴 작업셔츠', '손목의 낡은 스포츠시계'])
    expect(characterAppearanceByNodeId['char-minho'].visual.height).toBe('180cm 안팎')
    expect(characterAppearanceByNodeId['char-minho'].visual.distinctive).toEqual(['오른쪽 관자놀이의 오래된 흉터'])
  })

  it('accounts for every recovered and new field without silently dropping public data', () => {
    expect(backfill.characters).toHaveLength(7)
    expect(backfill.not_a_game_event).toBe(true)
    expect(backfill.historical_raw_unchanged).toBe(true)
    for (const entry of backfill.characters) {
      const { recovered_fields: recovered, new_fields: fresh } = entry.provenance
      expect(new Set([...recovered, ...fresh]).size).toBe(recovered.length + fresh.length)
      expect([...recovered, ...fresh].sort()).toEqual(Object.keys(entry.appearance_anchor).sort())
      const published = characterAppearanceByNodeId[entry.node_id]
      expect(published.publicDescription).toBe(entry.public_description)
      expect(Object.keys(published.visual).length).toBe(Object.keys(entry.appearance_anchor).length)
      for (const [key, value] of Object.entries(entry.appearance_anchor)) {
        expect(published.visual[key === 'apparent_age' ? 'apparentAge' : key as keyof typeof published.visual]).toEqual(value)
      }
      expect(published.provenance?.decisionId).toBe(backfill.decision_id)
      expect(published.provenance?.newFields).toEqual(fresh)
      expect(published.sourceRefs).toContain(backfill.canon_path)
      expect(entry.provenance.source_refs.length).toBeGreaterThan(0)
    }
  })

  it('recovers named first-appearance identity rather than nearby anonymous descriptions', () => {
    const hajin = characterAppearanceByNodeId['char-hajin']
    expect(hajin.visual.gender).toBe('여성')
    expect(hajin.visual.apparentAge).toBe('30대 중반')
    expect(hajin.provenance?.recoveredFields).toContain('gender')
    expect(characterAppearanceByNodeId['char-mingyu'].visual.apparentAge).toBe('30대 후반')
    expect(characterAppearanceByNodeId['char-kyunghee'].visual.apparentAge).toBe('40대 초반')
    expect(characterAppearanceByNodeId['char-cheolsu'].visual.apparentAge).toBe('50대')
    expect(characterAppearanceByNodeId['char-jaemin'].visual.apparentAge).toBe('20대 후반')
    expect(JSON.stringify(characterAppearanceByNodeId['char-jaemin'].visual)).not.toContain('흉터')
    expect(characterAppearanceByNodeId['char-seongho'].provenance?.origin).toBe('GM_AUTHORED_WITH_USER_APPROVAL')
  })

  it('fully recovers Jisu from existing runtime without inventing a new baseline', () => {
    const jisu = characterAppearanceByNodeId['char-jisu']
    expect(jisu.provenance?.newFields).toEqual([])
    expect(jisu.visual.height).toBe('168cm쯤')
    expect(jisu.visual.build).toBe('군살 없이 길고 탄탄한 체형')
    expect(jisu.visual.face).toBe('길고 선명한 눈매와 반듯한 코선')
    expect(jisu.visual.distinctive).toEqual(['허리에 건 장갑', '작은 몽키스패너'])
    expect(jisu.publicDescription).toContain('낮고 맑은 목소리')
  })
})
