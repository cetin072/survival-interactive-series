import { baselineCharacters, baselineRuntime } from './fixtures'
import type { CharactersFile, RuntimeState } from './types'

export const PUBLIC_RAW_PATHS = {
  runtime: 'players/main/RUNTIME_STATE.json',
  characters: 'core/CHARACTERS.json',
} as const

const RAW_ROOT = 'https://raw.githubusercontent.com/cetin072/survival-interactive-series/main'

export type RuntimeLoadResult = {
  runtime: RuntimeState
  characters: CharactersFile
  source: 'github-raw' | 'bundled-fallback'
  warning: string | null
}

function rawUrl(path: string, cacheToken: string): string {
  return `${RAW_ROOT}/${path}?checkpoint=${encodeURIComponent(cacheToken)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRuntime(value: unknown): RuntimeState {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.season_id !== 'string' || !Array.isArray(value.family)) {
    throw new TypeError('GitHub Raw runtime state is malformed')
  }
  return value as RuntimeState
}

function parseCharacters(value: unknown): CharactersFile {
  if (!isRecord(value) || typeof value.party_version !== 'number' || !Array.isArray(value.members)) {
    throw new TypeError('GitHub Raw characters file is malformed')
  }
  return value as CharactersFile
}

export async function loadRuntimeState(options: {
  fetcher?: typeof fetch
  cacheToken?: string
  fallbackRuntime?: RuntimeState
  fallbackCharacters?: CharactersFile
} = {}): Promise<RuntimeLoadResult> {
  const fetcher = options.fetcher ?? fetch
  const cacheToken = options.cacheToken ?? `${Date.now()}`
  try {
    const [runtimeResponse, charactersResponse] = await Promise.all([
      fetcher(rawUrl(PUBLIC_RAW_PATHS.runtime, cacheToken), { cache: 'no-store' }),
      fetcher(rawUrl(PUBLIC_RAW_PATHS.characters, cacheToken), { cache: 'no-store' }),
    ])
    if (!runtimeResponse.ok || !charactersResponse.ok) throw new Error('GitHub Raw response failed')
    return {
      runtime: parseRuntime(await runtimeResponse.json()),
      characters: parseCharacters(await charactersResponse.json()),
      source: 'github-raw',
      warning: null,
    }
  } catch {
    return {
      runtime: options.fallbackRuntime ?? baselineRuntime,
      characters: options.fallbackCharacters ?? baselineCharacters,
      source: 'bundled-fallback',
      warning: 'GitHub 최신 상태를 불러오지 못해 배포 시점 checkpoint를 표시합니다.',
    }
  }
}
