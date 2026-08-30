import type { SliceState } from './types'

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const SAVE_KEY = 'survival-m3v-save-v1'

export function saveSlice(storage: StorageLike, state: SliceState): void {
  storage.setItem(SAVE_KEY, JSON.stringify(state))
}

export function loadSlice(storage: StorageLike): SliceState | null {
  const raw = storage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SliceState
    if (parsed.version !== 1 || !parsed.live || typeof parsed.turn !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function clearSlice(storage: StorageLike): void {
  storage.removeItem(SAVE_KEY)
}

export function exportSlice(state: SliceState): string {
  return JSON.stringify(state, null, 2)
}

export function importSlice(raw: string): SliceState | null {
  try {
    const parsed = JSON.parse(raw) as SliceState
    if (parsed.version !== 1 || !parsed.live || typeof parsed.worldSeed !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
