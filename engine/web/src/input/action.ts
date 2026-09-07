import type { Choice, LogEntry } from '../types'

export function choiceLog(choice: Choice, id: number): LogEntry {
  return { id, kind: 'choice', text: `선택 ${choice.id}. ${choice.label}` }
}

export function freeActionLog(action: string, id: number): LogEntry {
  return { id, kind: 'free-action', text: `자유행동: ${action}` }
}

export function choiceForKey(key: string, choices: Choice[]): Choice | undefined {
  if (!/^[1-4]$/.test(key)) return undefined
  return choices.find((choice) => choice.id === Number(key))
}

export type ChoiceShortcutResult =
  | { kind: 'choices'; choiceIds: number[] }
  | { kind: 'invalid'; message: string }

/**
 * Treats input such as `1`, `1번`, `1번 선택`, `1 2`, or `1번 → 2번` as a
 * direct shortcut for the visible choice cards. Ordinary prose containing numbers
 * is intentionally left untouched and continues to the AI GM as free action text.
 */
export function choiceShortcutFromText(text: string, choices: Choice[], maxChoices = 2): ChoiceShortcutResult | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  const ids = (trimmed.match(/\d+/g) ?? []).map(Number)
  if (ids.length === 0) return undefined

  const remainder = trimmed
    .replace(/\d+/g, '')
    .replace(/(?:번|선택|을|를|과|와|그리고|다음|후|먼저|그다음)/g, '')
    .replace(/[\s,.;:/+\-&>→➜➡]+/g, '')

  if (remainder.length > 0) return undefined
  if (ids.length > maxChoices) return { kind: 'invalid', message: `선택지는 한 번에 최대 ${maxChoices}개까지 고를 수 있습니다.` }
  if (new Set(ids).size !== ids.length) return { kind: 'invalid', message: '같은 선택지를 한 번에 두 번 실행할 수 없습니다.' }

  const available = new Set(choices.map((choice) => choice.id))
  const missing = ids.find((id) => !available.has(id))
  if (missing !== undefined) return { kind: 'invalid', message: `현재 ${missing}번 선택지는 없습니다.` }

  return { kind: 'choices', choiceIds: ids }
}
