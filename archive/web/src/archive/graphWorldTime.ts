type GraphAnchor = { game_time: string; save_version: number }
type GraphTimeRecord = {
  id?: string
  data?: { subtitle?: string; meta?: Record<string, unknown> }
  anchor: GraphAnchor
}

function validTime(value: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/)
  if (!match) return undefined
  const [, year, month, day, hour = '00', minute = '00'] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)))
  if (date.toISOString().slice(0, 16).replace('T', ' ') !== `${year}-${month}-${day} ${hour}:${minute}`) return undefined
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function subtitleTime(subtitle: string | undefined): string | undefined {
  if (!subtitle) return undefined
  const numeric = subtitle.match(/^(\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}))?/)
  if (numeric) return validTime(`${numeric[1]} ${numeric[2] ?? '00:00'}`)
  const korean = subtitle.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?(?:\s+(\d{1,2}:\d{2}))?/)
  if (!korean) return undefined
  const [, year, month, day, time = '00:00'] = korean
  return validTime(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time.padStart(5, '0')}`)
}

function explicitWorldTime(record: GraphTimeRecord): string | undefined {
  const explicit = record.data?.meta?.['기준시각']
  return validTime(typeof explicit === 'string' ? explicit : '')
}

export function graphWorldTime(record: GraphTimeRecord): string {
  return explicitWorldTime(record) ?? subtitleTime(record.data?.subtitle) ?? record.anchor.game_time
}

export function graphChangeTime(record: GraphTimeRecord): string {
  return explicitWorldTime(record) ?? record.anchor.game_time
}

export function sortGraphEvents<T extends GraphTimeRecord>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    graphWorldTime(b).localeCompare(graphWorldTime(a))
    || b.anchor.save_version - a.anchor.save_version
    || (a.id ?? '').localeCompare(b.id ?? ''),
  )
}

export function sortGraphHistory<T extends GraphTimeRecord & { data_sha256?: string }>(history: T[]): T[] {
  return [...history].sort((a, b) =>
    graphChangeTime(b).localeCompare(graphChangeTime(a))
    || b.anchor.save_version - a.anchor.save_version
    || (a.id ?? a.data_sha256 ?? '').localeCompare(b.id ?? b.data_sha256 ?? ''),
  )
}
