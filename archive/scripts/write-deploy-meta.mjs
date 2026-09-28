import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const shaPattern = /^[a-f0-9]{40}$/
const webRoot = resolve(import.meta.dirname, '../web')
const output = join(webRoot, 'dist/deploy-meta.json')

const isNetlify = process.env.NETLIFY === 'true'
const commitRef = process.env.COMMIT_REF || process.env.GITHUB_SHA || 'local'
const context = process.env.CONTEXT || (process.env.GITHUB_ACTIONS ? 'github-ci' : 'local')
const provider = isNetlify ? 'netlify' : (process.env.GITHUB_ACTIONS ? 'github-actions' : 'local')

if (isNetlify && !shaPattern.test(commitRef)) {
  throw new Error('NETLIFY_COMMIT_REF_INVALID')
}
if (isNetlify && !context) {
  throw new Error('NETLIFY_CONTEXT_MISSING')
}

const payload = {
  version: 1,
  provider,
  context,
  commit_ref: commitRef,
  build_id: process.env.BUILD_ID || null,
}

await mkdir(join(webRoot, 'dist'), { recursive: true })
await writeFile(output, JSON.stringify(payload, null, 2) + '\n')
console.log(JSON.stringify({ status: 'DEPLOY_META_WRITTEN', ...payload }))
