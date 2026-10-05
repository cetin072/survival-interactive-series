import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadKnowledge, root } from './lib/knowledge-content.mjs'

export async function assertPublicArtifacts(data, directory) {
  const probes = []
  for (const brief of data.briefs) {
    if (brief.editorial_note) probes.push([brief.id, brief.editorial_note])
    if (brief.status !== 'PUBLISHED') {
      for (const section of brief.sections) {
        for (const block of section.blocks) {
          for (const value of [block.text, ...(block.items ?? []), ...(block.rows ?? []).flat()]) {
            if (typeof value === 'string' && value.length >= 30) probes.push([brief.id, value])
          }
        }
      }
    }
  }
  let files = 0, sourceMaps = 0
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isDirectory()) { await walk(path); continue }
      if (!/\.(?:js|json|html|map)$/i.test(item.name)) continue
      files++
      if (item.name.endsWith('.map')) sourceMaps++
      const text = await readFile(path, 'utf8')
      for (const [id, value] of probes) {
        const escaped = JSON.stringify(value).slice(1, -1)
        const html = value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
        if ([value, escaped, html].some((probe) => text.includes(probe))) {
          throw new Error(`KNOWLEDGE_PUBLIC_LEAK:${id}:${path}`)
        }
      }
    }
  }
  await walk(directory)
  if (!files) throw new Error('KNOWLEDGE_PUBLIC_ARTIFACTS_MISSING')
  return { files, source_maps: sourceMaps, probes: probes.length }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/check-knowledge-public.mjs')) {
  console.log(JSON.stringify({ status: 'PUBLIC_BOUNDARY_PASS', ...await assertPublicArtifacts(await loadKnowledge(), join(root, 'archive/web/dist')) }))
}
