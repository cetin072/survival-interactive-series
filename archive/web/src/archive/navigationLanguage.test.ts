import { describe, expect, it } from 'vitest'
import { primaryNavigationLabels } from './ArchiveApp'
import { chronicleMenuGroup, chroniclePrimaryMenuLabels } from './ChronicleRoom'

describe('Archive UI stage 1 navigation language', () => {
  it('keeps the global navigation simple and Korean-first', () => {
    expect(primaryNavigationLabels).toEqual(['이야기', '생존 지식', '자료실'])
  })

  it('groups Chronicle sections behind four user-facing menus', () => {
    expect(chroniclePrimaryMenuLabels).toEqual(['홈', '이야기', '세계관', '기록'])
    expect(chronicleMenuGroup('overview')).toBe('home')
    expect(chronicleMenuGroup('reader')).toBe('story')
    for (const section of ['explorer', 'characters', 'locations', 'events', 'graph', 'map', 'visuals'] as const) {
      expect(chronicleMenuGroup(section)).toBe('world')
    }
    for (const section of ['timeline', 'raw'] as const) {
      expect(chronicleMenuGroup(section)).toBe('record')
    }
  })
})
