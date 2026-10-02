import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { recordVisualProfiles } from './recordVisualProfile'

const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

describe('visual metadata publication boundary', () => {
  it('keeps image-production metadata out of the public Explorer', () => {
    const explorer = readSource('./ExplorerView.tsx')
    for (const token of [
      'recordVisualProfileFor',
      '이미지 제작 참고',
      'visual-cue-list',
      'visual-profile-note',
      '신규 Canon 아님',
      'profile.canon_policy',
      'profile.render_cues',
    ]) expect(explorer).not.toContain(token)
  })

  it('keeps the full visual-production metadata available to the authenticated operator surface', () => {
    const operator = readSource('./OperatorVisualMetadata.tsx')
    expect(recordVisualProfiles().length).toBeGreaterThan(0)
    for (const token of [
      '시각 제작 메타',
      'profile.description',
      'profile.render_cues',
      'profile.canon_policy',
      'profile.source_note',
    ]) expect(operator).toContain(token)
  })
})
