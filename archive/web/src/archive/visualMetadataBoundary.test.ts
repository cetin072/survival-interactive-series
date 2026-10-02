import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ExplorerView } from './ExplorerView'
import { OperatorVisualMetadata } from './OperatorVisualMetadata'
import { recordVisualProfiles } from './recordVisualProfile'

describe('visual metadata publication boundary', () => {
  it('keeps image-production metadata out of the public Explorer', () => {
    const html = renderToStaticMarkup(createElement(ExplorerView, { onOpenStory: () => undefined }))
    for (const token of [
      '이미지 제작 참고',
      '시각 제작 메타',
      '신규 Canon 아님',
      'EDITORIAL_RENDER_CUES',
      'ILLUSTRATIVE_NOT_NEW_CANON',
    ]) expect(html).not.toContain(token)
  })

  it('keeps the full visual-production metadata available to the operator surface', () => {
    const html = renderToStaticMarkup(createElement(OperatorVisualMetadata))
    expect(recordVisualProfiles().length).toBeGreaterThan(0)
    expect(html).toContain('시각 제작 메타')
    expect(html).toContain('이미지 제작 참고')
    expect(html).toContain('정책')
    expect(html).toContain('출처 메모')
  })
})
