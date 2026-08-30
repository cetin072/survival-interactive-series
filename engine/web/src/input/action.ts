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
