import { describe, expect, it } from 'vitest'
import { graphWorldTime, sortGraphEvents, sortGraphHistory } from './graphWorldTime'

const event = (id: string, subtitle: string, game_time: string, save_version: number, meta?: Record<string, string>) => ({
  id, data: { subtitle, ...(meta ? { meta } : {}) }, anchor: { game_time, save_version },
})

describe('public graph world time', () => {
  it('sorts Timeline by explicit and readable event time, not graph publication anchors', () => {
    const records = [
      event('fireline', '2026-11-22 ~ 11-23', '2027-03-23 17:50', 253),
      event('guild-warehouse', '2027년 4월 10–11일', '2027-04-11 17:20', 254),
      event('network-decay', '2026-12-10 17:40', '2027-03-23 17:50', 253),
      event('finale', '2027-03-23 17:50', '2027-03-23 17:50', 253),
      event('shelter', '2026-11-23 13:08 ~ 17:34', '2027-03-23 17:50', 253),
      event('wide-area', '2026-11-23 19:18 ~ 11-24 07:52', '2027-03-23 17:50', 253),
      event('winter-council', '2026-12-05 06:32 ~ 17:50', '2027-03-23 17:50', 253),
      event('trial-agreement', '2027년 6월 22일', '2027-07-12 17:30', 274, { 기준시각: '2027-06-22 11:00' }),
      event('rain-plan', '2027년 7월 5일', '2027-07-12 17:30', 274, { 기준시각: '2027-07-05 09:00' }),
      event('tie-b', '2027-07-05 09:00', '2027-07-12 17:30', 274),
      event('tie-a', '2027-07-05 09:00', '2027-07-12 17:30', 274),
      event('higher-save', '2027-07-05 09:00', '2027-07-12 17:30', 275),
    ]
    expect(sortGraphEvents(records).map((record) => record.id)).toEqual([
      'rain-plan', 'higher-save', 'tie-a', 'tie-b', 'trial-agreement', 'guild-warehouse', 'finale', 'network-decay',
      'winter-council', 'wide-area', 'shelter', 'fireline',
    ])
    expect(sortGraphEvents(records).slice(0, 3).map(graphWorldTime)).toEqual([
      '2027-07-05 09:00', '2027-06-22 11:00', '2027-04-10 00:00',
    ])
  })

  it('uses publication anchor only when neither explicit time nor a dated subtitle is readable', () => {
    expect(graphWorldTime(event('fallback', '날짜 미상', '2027-07-12 17:30', 274))).toBe('2027-07-12 17:30')
    expect(graphWorldTime(event('bad-meta', '2027-03-23 17:50', '2027-07-12 17:30', 274, { 기준시각: 'not-a-time' }))).toBe('2027-03-23 17:50')
  })

  it('orders prior snapshots by their actual change time', () => {
    const history = [
      { ...event('item', '상태 B', '2027-06-22 11:00', 2, { 기준시각: '2027-06-22 11:00' }), data_sha256: 'b'.repeat(64) },
      { ...event('item', '상태 A', '2027-07-12 17:30', 1, { 기준시각: '2027-06-01 09:00' }), data_sha256: 'a'.repeat(64) },
    ]
    expect(sortGraphHistory(history).map((snapshot) => snapshot.data.subtitle)).toEqual(['상태 B', '상태 A'])
  })
})
