import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertIllustrationPreparationAllowed, isRetiredIllustrationIdentity } from './illustration-operator-hold.mjs'
import { prepareRenderJob } from '../prepare-illustration-render-job.mjs'
const root = fileURLToPath(new URL('../../../', import.meta.url))

test('the explicit operator hold remains closed without DB history', () => {
  assert.throws(assertIllustrationPreparationAllowed, /ILLUSTRATION_OPERATOR_HOLD/)
  const catalog = JSON.parse(readFileSync(resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')))
  assert.equal(catalog.points.filter(isRetiredIllustrationIdentity).length, 1)
  assert.equal(isRetiredIllustrationIdentity({point_id:'different', generation_key:'different'}), false)
})

test('both operational entrypoints stop before credentials, remote writes or prompt transport', () => {
  for (const script of ['archive/scripts/lib/illustration-operator-hold.mjs', 'archive/scripts/prepare-illustration-render-job.mjs']) {
    const result = spawnSync(process.execPath, [resolve(root, script)], {
      encoding:'utf8', env:{PATH:process.env.PATH, RENDER_PROMPT_OUTPUT:'/path-that-must-not-be-written/prompt.txt'},
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ILLUSTRATION_OPERATOR_HOLD/)
    assert.doesNotMatch(result.stderr, /CREDENTIALS_REQUIRED|ENOENT|fetch failed/)
    assert.equal(result.stdout, '')
  }
})

test('a retired identity cannot be reselected after its failed DB history is deleted', async (t) => {
  const catalog = JSON.parse(readFileSync(resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')))
  const history = catalog.points.filter(p => !isRetiredIllustrationIdentity(p)
    && /^generation-[a-f0-9]{64}$/.test(p.generation_key ?? '')
    && /^point-[a-f0-9]{64}$/.test(p.point_id ?? '') && p.subject_id).map(p => ({
    point_id:p.point_id, generation_key:p.generation_key, subject_id:p.subject_id,
    status:'SUCCEEDED', attempt_no:1, review_decision:'PASS',
  }))
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('NO_NETWORK_ALLOWED') }
  t.after(() => { globalThis.fetch = originalFetch })
  await assert.rejects(prepareRenderJob({mainSha:'a'.repeat(40), previewOnly:true, attemptHistory:history}), /ILLUSTRATION_RETIRED_IDENTITY/)
})

test('workflow hold precedes cleanup, preparation and prompt publication', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/archive-illustration-prep.yml'),'utf8')
  const hold = workflow.indexOf('run: node archive/scripts/lib/illustration-operator-hold.mjs')
  assert.ok(hold > 0)
  for (const action of ['illustration_vault.py cleanup', 'run: node archive/scripts/prepare-illustration-render-job.mjs', 'Publish visual-only prompt transport'])
    assert.ok(workflow.indexOf(action) > hold)
})
