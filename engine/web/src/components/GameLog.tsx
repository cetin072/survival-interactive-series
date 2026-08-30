import type { LogEntry } from '../types'

export function GameLog({ entries }: { entries: LogEntry[] }) {
  return <section className="game-log" aria-live="polite" aria-label="이전 로그">
    <p className="log-title">기록</p>
    {entries.map((entry) => <p className={`log-entry ${entry.kind}`} key={entry.id}>{entry.text}</p>)}
  </section>
}
