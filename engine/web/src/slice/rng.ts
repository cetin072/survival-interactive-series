export type RngState = {
  seed: number
  step: number
}

export function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createRng(seed: string | number): RngState {
  return { seed: typeof seed === 'number' ? seed >>> 0 : hashSeed(seed), step: 0 }
}

function mix(seed: number, step: number): number {
  let value = (seed + Math.imul(step + 1, 0x9e3779b1)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b) >>> 0
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35) >>> 0
  value ^= value >>> 16
  return value >>> 0
}

export function nextRandom(state: RngState): { value: number; state: RngState } {
  const raw = mix(state.seed, state.step)
  return {
    value: raw / 0x100000000,
    state: { ...state, step: state.step + 1 },
  }
}

export function pickIndex(state: RngState, length: number): { index: number; state: RngState } {
  if (length <= 0) return { index: 0, state }
  const next = nextRandom(state)
  return { index: Math.min(length - 1, Math.floor(next.value * length)), state: next.state }
}
