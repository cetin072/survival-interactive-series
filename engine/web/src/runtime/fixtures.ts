import charactersJson from '../../../../core/CHARACTERS.json'
import runtimeJson from '../../../../players/main/RUNTIME_STATE.json'
import type { CharactersFile, RuntimeState } from './types'

export const baselineCharacters = charactersJson as CharactersFile
export const baselineRuntime = runtimeJson as RuntimeState
