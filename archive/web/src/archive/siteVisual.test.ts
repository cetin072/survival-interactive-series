import { describe, expect, it } from 'vitest'
import { siteVisualDisplaySize, siteVisualFor, type SiteAsset } from './siteVisual'

describe('legacy Automation B site illustration aspect recovery', () => {
  it('restores a known wide v1 asset from authoritative pre-stretch dimensions', () => {
    const asset = siteVisualFor('event-network-decay')
    expect(asset).toBeTruthy()
    expect(siteVisualDisplaySize(asset!)).toEqual({ width: 512, height: 256, corrected: true })
  })

  it('restores a known portrait v1 asset', () => {
    const asset = siteVisualFor('char-hajin')
    expect(asset).toBeTruthy()
    expect(siteVisualDisplaySize(asset!)).toEqual({ width: 341, height: 512, corrected: true })
  })

  it('does not guess when no authoritative legacy aspect is recorded', () => {
    const asset = siteVisualFor('loc-bridge')
    expect(asset).toBeTruthy()
    expect(siteVisualDisplaySize(asset!)).toEqual({ width: 512, height: 512, corrected: false })
  })

  it('never applies a legacy correction to proportional v2 assets', () => {
    const asset: SiteAsset = {
      subject_id: 'char-hajin',
      point_id: 'point-' + 'a'.repeat(64),
      generation_key: 'generation-' + 'b'.repeat(64),
      public_path: '/visual-assets/' + 'c'.repeat(64) + '.png',
      width: 341,
      height: 512,
      source_sha256: 'ec10145f88032e1737d85edcd3a12b4df15c10ac437b1ca3215d47159c3a0eb7',
      derivative_version: 'site-png-fit-512-v2',
    }
    expect(siteVisualDisplaySize(asset)).toEqual({ width: 341, height: 512, corrected: false })
  })
})
