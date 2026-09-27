/** Historical C03 source order, built from a supplied public S02 inventory. */
const pad = (n) => String(n).padStart(3, '0')
const s02Root = 'archive/content/transcripts/C03-AFTERFALL/S02'

export function c03BaselineCatalog(s02Manifest, paths) {
  const s01 = Array.from({ length: 10 }, (_, i) => ({
    archivePath: `archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_${pad(i + 1)}.md`,
    canonicalRef: `worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_${pad(i + 1)}.md`,
    group: 'S01', title: '두 거점의 기록',
  }))
  const s02 = s02Manifest.sessions
    .filter((session) => session.source_type !== 'SUPABASE_ROLLING_RAW' || session.atomic_pairing_complete)
    .flatMap((session) => {
      const directory = `SESSION_${String(session.session_id).replace('SESSION_', '').padStart(3, '0')}`
      const prefix = `${s02Root}/${directory}/`
      return paths.filter((path) => path.startsWith(prefix) && /^PART_\d{3}\.md$/.test(path.slice(prefix.length)))
        .sort().map((archivePath) => ({
          archivePath,
          canonicalRef: `worldlines/AFTERFALL/seasons/S02/raw_transcript/${directory}/${archivePath.slice(prefix.length)}`,
          group: 'S02',
          title: session.source_type === 'SUPABASE_ROLLING_RAW' ? '겨울 생활망과 다섯 거점' : session.session_id === 'SESSION_001' ? '화재선과 겨울' : '첫겨울의 기록',
        }))
    })
  return [...s01, ...s02]
}
