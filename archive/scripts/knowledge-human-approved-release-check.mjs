import { loadKnowledge, validateKnowledge, root } from './lib/knowledge-content.mjs'
import { changedFilesFromGit, checkHumanApprovedRelease } from './lib/knowledge-release.mjs'

const args = process.argv.slice(2)
const options = { briefIds: [], changedFiles: [] }
let explicitFiles = false
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (['--brief', '--changed-file', '--base', '--head'].includes(arg)) {
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (arg === '--brief') options.briefIds.push(value)
    else if (arg === '--changed-file') { explicitFiles = true; options.changedFiles.push(value) }
    else if (arg === '--base') options.baseRef = value
    else if (arg === '--head') options.headRef = value
  } else throw new Error('Usage: knowledge-human-approved-release-check.mjs --brief K-... [--base REF] [--head REF] [--changed-file PATH ...]')
}
if (options.briefIds.length !== 1) throw new Error('EXACTLY_ONE_BRIEF_REQUIRED')

const data = await loadKnowledge(root)
await validateKnowledge(data)
if (!explicitFiles) options.changedFiles = changedFilesFromGit({ baseRef: options.baseRef, headRef: options.headRef, cwd: root })
console.log(JSON.stringify(await checkHumanApprovedRelease(data, {
  changedFiles: options.changedFiles,
  briefIds: options.briefIds,
  base: root,
}), null, 2))
