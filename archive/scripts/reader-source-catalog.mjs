import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { approvedSeasonCatalog } from './lib/approved-reader-sources.mjs'

const pad = (n) => String(n).padStart(3, '0')
const root = resolve(import.meta.dirname, '..', '..')
const c03S02ArchiveRoot = resolve(root, 'archive', 'content', 'transcripts', 'C03-AFTERFALL', 'S02')
const c03S02Manifest = JSON.parse(await readFile(resolve(c03S02ArchiveRoot, 'MANIFEST.json'), 'utf8'))
const c03S02ReaderSessions = c03S02Manifest.sessions.filter((session) => session.source_type !== 'SUPABASE_ROLLING_RAW' || session.atomic_pairing_complete)
const c03S02Parts = (await Promise.all(c03S02ReaderSessions.map(async (session) => {
  const directory = `SESSION_${String(session.session_id).replace('SESSION_', '').padStart(3, '0')}`
  const files = await readdir(resolve(c03S02ArchiveRoot, directory))
  return files.filter((file) => /^PART_\d{3}\.md$/.test(file)).sort().map((file) => ({
    archivePath: `archive/content/transcripts/C03-AFTERFALL/S02/${directory}/${file}`,
    canonicalRef: `worldlines/AFTERFALL/seasons/S02/raw_transcript/${directory}/${file}`,
    group: 'S02',
    title: session.source_type === 'SUPABASE_ROLLING_RAW' ? '겨울 생활망과 다섯 거점' : session.session_id === 'SESSION_001' ? '화재선과 겨울' : '첫겨울의 기록',
  }))
}))).flat()

// New seasons are opt-in PUBLIC_ARCHIVE cold publications. Never scan worldline/GM files.
const c03Root = resolve(root, 'archive', 'content', 'transcripts', 'C03-AFTERFALL')
const c03Automatic = []
for (const directory of (await readdir(c03Root, { withFileTypes: true })).filter((d) => d.isDirectory() && /^S\d{2,3}$/.test(d.name)).sort((a, b) => a.name.localeCompare(b.name))) {
  if (['S01', 'S02'].includes(directory.name)) continue
  let manifest
  try { manifest = JSON.parse(await readFile(resolve(c03Root, directory.name, 'MANIFEST.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') continue; throw error }
  c03Automatic.push(...await approvedSeasonCatalog(manifest, directory.name, {
    read: (path) => readFile(resolve(root, path)),
    listParts: async (path) => (await readdir(resolve(root, path))).filter((name) => /^PART_\d{3}\.md$/.test(name)),
  }))
}
const c02 = [['SESSION_2031_02_TO_2031_03_ROOM_20260925', 5, 'PART I', '정전과 산불장'], ['SESSION_20260925_CURRENT_ROOM', 4, 'PART II', '산불 이후'], ['SESSION_C02_2032_SPRING_SUMMER_ROOM_20260925', 6, 'PART III', '지역망과 폐목장'], ['SESSION_C02_20260925_ROOM_01', 5, 'PART IV', '장기 재편'], ['SESSION_20260925_2039_CURRENT_ROOM', 4, 'PART V', '야간과 기록 현실']]
export const rawCatalog = {
  'C01-HAN-JUNHO': Array.from({ length: 10 }, (_, i) => { const n = i + 1, season = n === 10 ? 'S02' : 'S01', number = n === 10 ? 1 : n, p = `seasons_v2/${season}/raw_transcript/PART_${pad(number)}.md`; return { archivePath: p, canonicalRef: p, group: season, title: season === 'S01' ? '첫해의 기록' : '두 번째 계절' } }),
  'C02-STRONGHOLD': c02.flatMap(([session, count, group, title]) => Array.from({ length: count }, (_, i) => { const name = `PART_${pad(i + 1)}.md`; return { archivePath: `archive/content/transcripts/C02-STRONGHOLD/SESSIONS/${session}/${name}`, canonicalRef: `worldlines/STRONGHOLD/raw_transcript/${session}/${name}`, group, title } })),
  'C03-AFTERFALL': [...Array.from({ length: 10 }, (_, i) => ({ archivePath: `archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_${pad(i + 1)}.md`, canonicalRef: `worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_${pad(i + 1)}.md`, group: 'S01', title: '두 거점의 기록' })), ...c03S02Parts, ...c03Automatic],
}
export const bookMetadata = { 'C01-HAN-JUNHO': { title: '한준호의 생존기', subtitle: '흩어진 가족이 살아남는 길', description: '현재 확보된 공개 GM 기록을 순서대로 엮은 이야기.', protagonist: '한준호', worldlineId: 'CANON-V2', sourceRoot: 'seasons_v2' }, 'C02-STRONGHOLD': { title: '박도현의 생존기', subtitle: '거점을 지키며 이어진 기록', description: '현재 확보된 공개 GM 기록을 순서대로 엮은 이야기.', protagonist: '박도현', worldlineId: 'STRONGHOLD', sourceRoot: 'worldlines/STRONGHOLD' }, 'C03-AFTERFALL': { title: '서진우의 생존기', subtitle: '겨울을 건너 다섯 거점에 닿은 기록', description: 'AFTERFALL 공개 플레이에서 검증된 GM 장면.', protagonist: '서진우', worldlineId: 'AFTERFALL', sourceRoot: 'worldlines/AFTERFALL', beginningStatus: 'MISSING_BEGINNING' } }
