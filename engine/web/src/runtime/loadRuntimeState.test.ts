import { describe, expect, it, vi } from 'vitest'
import { baselineCharacters, baselineRuntime } from './fixtures'
import { loadRuntimeState, PUBLIC_RAW_PATHS } from './loadRuntimeState'

describe('GitHub Raw runtime loader', () => {
  it('fetches only the two public inputs with a shared cache-busting token', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(baselineRuntime), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(baselineCharacters), { status: 200 }))
    const loaded = await loadRuntimeState({ fetcher, cacheToken: 'checkpoint-26' })
    expect(loaded.source).toBe('github-raw')
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const path of Object.values(PUBLIC_RAW_PATHS)) {
      expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`${path}?checkpoint=checkpoint-26`), { cache: 'no-store' })
    }
  })

  it('uses a clear bundled fallback when GitHub Raw is unavailable', async () => {
    const loaded = await loadRuntimeState({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      fallbackRuntime: baselineRuntime,
      fallbackCharacters: baselineCharacters,
    })
    expect(loaded.source).toBe('bundled-fallback')
    expect(loaded.runtime).toEqual(baselineRuntime)
    expect(loaded.warning).toContain('배포 시점 checkpoint')
  })

  it('rejects malformed GitHub Raw state and uses the clear fallback', async () => {
    const malformed = { schema_version: 1, season_id: 'S05', family: 'not-an-array' }
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(malformed), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(baselineCharacters), { status: 200 }))
    const loaded = await loadRuntimeState({ fetcher, fallbackRuntime: baselineRuntime, fallbackCharacters: baselineCharacters })
    expect(loaded.source).toBe('bundled-fallback')
    expect(loaded.warning).toContain('GitHub 최신 상태')
  })

  it('does not define any non-public source path', () => {
    expect(PUBLIC_RAW_PATHS).toEqual({
      runtime: 'players/main/RUNTIME_STATE.json',
      characters: 'core/CHARACTERS.json',
    })
  })
})
