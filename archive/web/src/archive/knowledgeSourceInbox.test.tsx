import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OperatorKnowledgeSources } from './OperatorKnowledgeSources'
import {
  normalizeSourceUrl,
  sourceInboxRecords,
  validateSourceRecords,
} from './knowledgeSourceInbox'

describe('Source inbox MVP', () => {
  it('keeps the actual Chungju URL and its document-identifying parameters', () => {
    const source = sourceInboxRecords.find((item) => item.id === 'SRC-20261009-CHUNGJU-WINTER')
    expect(source).toBeDefined()
    const parsed = new URL(source!.url)
    expect(parsed.searchParams.get('bbsNo')).toBe('6')
    expect(parsed.searchParams.get('nttNo')).toBe('326178')
    expect(parsed.searchParams.get('key')).toBe('494')
    expect(source!.decision).toBe('HOLD')
    expect(source!.rights.commercial_use).toBe('PROHIBITED')
    expect(source!.rights.modification).toBe('PROHIBITED')
    expect(source!.rights.scope_note).toContain('확인되지 않음')
  })

  it('removes only tracking query and hash without deleting article identity', () => {
    const url = sourceInboxRecords[0].url
    const withTracking = url + '&utm_source=chat&fbclid=abcd#metadata'
    expect(normalizeSourceUrl(withTracking)).toBe(normalizeSourceUrl(url))
    expect(normalizeSourceUrl(url.replace('nttNo=326178', 'nttNo=326179'))).not.toBe(normalizeSourceUrl(url))
    expect(() => normalizeSourceUrl('javascript:alert(1)')).toThrow('INVALID_SOURCE_URL')
    expect(() => normalizeSourceUrl('https://me:pw@example.com/a')).toThrow('INVALID_SOURCE_URL')
  })

  it('rejects duplicate URLs and IDs while keeping the original stored record untouched', () => {
    const original = sourceInboxRecords[0]
    expect(() => validateSourceRecords([original, {
      ...original, id: 'SRC-OTHER', url: original.url + '&utm_medium=test',
    }])).toThrow('DUPLICATE_SOURCE_URL')
    expect(() => validateSourceRecords([original, {
      ...original, url: original.url.replace('nttNo=326178', 'nttNo=326179'),
    }])).toThrow('DUPLICATE_SOURCE_ID')
    expect(sourceInboxRecords[0]).toBe(original)
  })

  it('shows use restrictions separately from review status and only links candidate guides', () => {
    const html = renderToStaticMarkup(createElement(OperatorKnowledgeSources))
    expect(html).toContain('글감·근거 보관함')
    expect(html).toContain('보류·보관')
    expect(html).toContain('공공누리 제4유형')
    expect(html).toContain('상업적 이용')
    expect(html).toContain('불가 표시')
    expect(html).toContain('/knowledge/emergency-supplies-inventory/')
    expect(html).toContain('/knowledge/emergency-route-redundancy/')
    expect(html).toContain('개정 후보 · 미반영')
    expect(html).not.toContain('공개 승인')
  })
})
