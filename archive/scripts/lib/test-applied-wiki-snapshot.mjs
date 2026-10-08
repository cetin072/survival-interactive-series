/** Test-only snapshot of applied sources. Never alter original manifests or runtime discovery rules.
 *  A-Core can publish PUBLIC_ARCHIVE capture before its last GM state_link is APPLIED.
 *  Native positive workflow tests use only applied captures; separate tests keep
 *  the real fail-closed path for incomplete published capture.
 */
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const contentRoot = 'archive/content'
const copied = [
  'transcripts/C03-AFTERFALL',
  'public-facts/C03-AFTERFALL',
  'graphs/C03-AFTERFALL',
  'visuals/C03-AFTERFALL',
  'stories/C03-AFTERFALL',
]

export async function createAppliedWikiTestSnapshot(sourceRoot) {
  const base = await mkdtemp(join(tmpdir(), 'a-wiki-applied-source-'))
  try {
    for (const suffix of copied) {
      const ref = join(contentRoot, suffix)
      await mkdir(dirname(resolve(base, ref)), { recursive: true })
      await cp(resolve(sourceRoot, ref), resolve(base, ref), { recursive: true })
    }
    const publicRoot = resolve(base, contentRoot, 'transcripts/C03-AFTERFALL')
    const excluded = []
    for (const folder of await readdir(publicRoot, { withFileTypes: true })) {
      if (!folder.isDirectory() || !/^S[0-9]{2,3}$/.test(folder.name)) continue
      const path = resolve(publicRoot, folder.name, 'MANIFEST.json')
      let bytes
      try { bytes = await readFile(path) } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      const manifest = JSON.parse(bytes.toString('utf8'))
      if (!Array.isArray(manifest.sessions)) continue
      const sessions = []
      for (const session of manifest.sessions) {
        const sourceManifest = JSON.parse(await readFile(resolve(publicRoot, folder.name, session.source_manifest), 'utf8'))
        const last = sourceManifest.content_sha256?.at(-1)
        if (last?.role === 'GM' && last.state_link?.outcome === 'APPLIED') sessions.push(session)
        else excluded.push({ season: folder.name, session: session.session_id, reason: 'NO_APPLIED_PUBLIC_ANCHOR' })
      }
      if (sessions.length !== manifest.sessions.length) {
        await writeFile(path, JSON.stringify({ ...manifest, sessions }, null, 2) + '\n')
      }
    }
    // The native coordinator binds a Git HEAD; this temp repository is never pushed.
    execFileSync('git', ['init', '-b', 'main'], { cwd: base, stdio: 'pipe' })
    execFileSync('git', ['-c', 'user.name=Wiki fixture', '-c', 'user.email=wiki-fixture@example.invalid',
      'commit', '--allow-empty', '-m', 'isolated applied-source fixture'], { cwd: base, stdio: 'pipe' })
    return { base, excluded, cleanup: () => rm(base, { recursive: true, force: true }) }
  } catch (error) {
    await rm(base, { recursive: true, force: true })
    throw error
  }
}
