import { writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'
import { changedFilesFromGit, checkHumanApprovedRelease } from './lib/knowledge-release.mjs'
import { assertHumanApprovedReleaseReady, promoteHumanApprovedBriefRecord } from './lib/knowledge-publish.mjs'

const args = process.argv.slice(2)
const options = { changedFiles: [] }
let explicitFiles = false
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (['--brief', '--base', '--head', '--changed-file', '--date'].includes(arg)) {
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (arg === '--brief') options.briefId = value
    else if (arg === '--base') options.baseRef = value
    else if (arg === '--head') options.headRef = value
    else if (arg === '--changed-file') { explicitFiles = true; options.changedFiles.push(value) }
    else if (arg === '--date') options.date = value
  } else throw new Error('Usage: knowledge-human-approved-prepare.mjs --brief K-... [--base REF] [--head REF] [--changed-file PATH ...] [--date YYYY-MM-DD]')
}
if (!/^K-\d+$/.test(options.briefId ?? '')) throw new Error('Missing or invalid --brief')
const today = options.date ?? new Date().toISOString().slice(0, 10)

const data = await loadKnowledge(root)
await validateKnowledge(data)
if (!explicitFiles) options.changedFiles = changedFilesFromGit({ baseRef: options.baseRef, headRef: options.headRef, cwd: root })

const pre = await checkHumanApprovedRelease(data, {
  changedFiles: options.changedFiles,
  briefIds: [options.briefId],
  base: root,
})
assertHumanApprovedReleaseReady(pre)

const brief = data.briefs.find((item) => item.id === options.briefId)
if (!brief) throw new Error(`BRIEF_MISSING:${options.briefId}`)
const promoted = promoteHumanApprovedBriefRecord(brief, today)
await writeFile(join(root, 'knowledge/content/briefs', `${options.briefId}.json`), JSON.stringify(promoted, null, 2) + '\n')

execFileSync(process.execPath, [join(root, 'archive/scripts/build-knowledge.mjs')], { cwd: root, stdio: 'inherit' })

const after = await loadKnowledge(root)
await validateKnowledge(after)
const afterFiles = changedFilesFromGit({ baseRef: options.baseRef, headRef: options.headRef, cwd: root })
const post = await checkHumanApprovedRelease(after, {
  changedFiles: afterFiles,
  briefIds: [options.briefId],
  base: root,
})
assertHumanApprovedReleaseReady(post)

const finalBrief = after.briefs.find((item) => item.id === options.briefId)
console.log(JSON.stringify({
  status: 'HUMAN_APPROVED_PREPARED',
  brief_id: options.briefId,
  slug: finalBrief.slug,
  publication_policy: finalBrief.publication_policy,
  decision: post.decision,
  article_path: `archive/web/public/knowledge/${finalBrief.slug}/index.html`,
  changed_files: afterFiles,
}, null, 2))
