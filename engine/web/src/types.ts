export type Choice = { id: number; label: string }

export type LogEntry = {
  id: number
  kind: 'scene' | 'choice' | 'free-action'
  text: string
}
