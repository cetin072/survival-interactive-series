import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare } from '../prepare-production-release.mjs'
import { decideRelease, nextReleaseMarker, validateReleaseMarker, validateReleasePolicy } from './production-release.mjs'

const sha = (c) => c.repeat(40)
const policy = {
  version: 1,
  mode: 'BATCHED',
  site: 'survival-diary-archive',
  production_interval_days: 2,
  release_hour_kst: 23,
  max_production_deploys_per_day: 1,
}

test('two elapsed days without a site change never create a release', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-10-01T14:00:00Z') })
  assert.equal(decideRelease({ headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    hasSiteChanges: false, now: new Date('2026-10-03T14:00:00Z') }).status, 'NO_CHANGES')
})

test('manual force cannot exceed one release in the same KST calendar day', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-10-01T14:00:00Z') })
  assert.equal(decideRelease({ headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    force: true, now: new Date('2026-10-01T14:30:00Z') }).due, false)
})

test('real Git ordinary B/C commits do not inherit a release marker or count as site changes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'production-no-change-'))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
  const markerPath = join(cwd,'archive/web/public/release/production.json')
  const now = new Date('2026-10-03T14:00:00Z')
  try {
    git('init','-b','main'); git('config','user.name','Release fixture'); git('config','user.email','fixture@example.invalid')
    await mkdir(join(cwd,'archive/web/public/release'),{recursive:true})
    await mkdir(join(cwd,'archive/automation'),{recursive:true})
    await mkdir(join(cwd,'archive/scripts'),{recursive:true})
    await writeFile(join(cwd,'archive/automation/release-policy.json'),JSON.stringify(policy))
    await writeFile(join(cwd,'archive/web/index.html'),'site v1\n')
    git('add','.'); git('commit','-m','production source')
    const source = git('rev-parse','HEAD')
    const marker = nextReleaseMarker({sourceMainSha:source,policy,now:new Date('2026-10-01T14:00:00Z')})
    const markerBytes = JSON.stringify(marker)
    await writeFile(markerPath,markerBytes); git('add','.'); git('commit','-m','failed release marker')
    assert.notEqual(git('diff','HEAD^1','HEAD','--','archive/web/public/release/production.json'),'')
    for (const name of ['finalize-illustration-job.py','knowledge-semantic-prepare.mjs']) {
      await writeFile(join(cwd,'archive/scripts',name),'ordinary operational fix\n')
      git('add','.');git('commit','-m',name)
      assert.equal(git('diff','HEAD^1','HEAD','--','archive/web/public/release/production.json'),'')
      const outcome = await prepare(['--apply'],{cwd,now})
      assert.equal(outcome.status,'NO_CHANGES')
      assert.equal(await readFile(markerPath,'utf8'),markerBytes)
    }
    await writeFile(join(cwd,'archive/web/index.html'),'site v2\n');git('add','.');git('commit','-m','real site change')
    assert.equal((await prepare(['--check'],{cwd,now:new Date('2026-10-02T14:00:00Z')})).status,'WAITING_WINDOW')
    assert.equal((await prepare(['--check'],{cwd,now})).status,'WOULD_RELEASE')
    assert.equal(await readFile(markerPath,'utf8'),markerBytes)
    await prepare(['--apply'],{cwd,now});git('add','.');git('commit','-m','actual release')
    assert.notEqual(git('diff','HEAD^1','HEAD','--','archive/web/public/release/production.json'),'')
  } finally { await rm(cwd,{recursive:true,force:true}) }
})

test('validates the cost-control policy', () => {
  assert.equal(validateReleasePolicy(policy).production_interval_days, 2)
  assert.throws(() => validateReleasePolicy({ ...policy, production_interval_days: 0 }), /INVALID_RELEASE_POLICY/)
})

test('bootstraps when there is no prior release marker', () => {
  assert.deepEqual(decideRelease({ headSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') }),
    { status: 'RELEASE_DUE', due: true, reason: 'BOOTSTRAP' })
})

test('does not redeploy the exact release commit', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  assert.deepEqual(decideRelease({
    headSha: sha('b'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-30T14:00:00Z'),
  }), { status: 'NO_CHANGES', due: false })
})

test('real Git input matrix and force preserve release safety', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'production-inputs-'))
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim()
  const put = async (ref, bytes) => { await mkdir(join(cwd, ref, '..'), { recursive: true }); await writeFile(join(cwd, ref), bytes) }
  const markerRef = 'archive/web/public/release/production.json'
  const now = new Date('2026-10-03T14:00:00Z')
  try {
    git('init','-b','main'); git('config','user.name','Release fixture'); git('config','user.email','fixture@example.invalid')
    await put('archive/automation/release-policy.json', JSON.stringify(policy))
    await put('archive/web/index.html', 'site\n')
    git('add','.'); git('commit','-m','source')
    const source = git('rev-parse','HEAD')
    const marker = nextReleaseMarker({ sourceMainSha: source, policy, now: new Date('2026-10-01T14:00:00Z') })
    await put(markerRef, JSON.stringify(marker)); git('add','.'); git('commit','-m','marker')
    const baseline = git('rev-parse','HEAD')
    for (const force of [false, true]) {
      const markerBefore = await readFile(join(cwd,markerRef),'utf8')
      assert.equal((await prepare(['--apply', ...(force ? ['--force'] : [])], { cwd, now })).status, 'NO_CHANGES')
      assert.equal(await readFile(join(cwd,markerRef),'utf8'), markerBefore)
      assert.equal(git('rev-parse','HEAD'), baseline)
      assert.equal(git('status','--porcelain'), '')
    }
    const inputs = ['archive/web/src/main.tsx', 'archive/automation/config.json',
      'archive/automation/release-policy.json', 'knowledge/automation/worker-policy.json',
      'knowledge/automation/state.json', 'knowledge/automation/runtime-state.json',
      'knowledge/automation/config.json', 'archive/scripts/lib/publication-graph.mjs',
      'archive/web/package-lock.json', 'archive/web/vite.config.ts',
      'archive/content/stories/BOOK.json', 'archive/content/visuals/SITE_ASSETS.json',
      'knowledge/content/guides.json']
    const ignored = ['docs/operations.md', 'archive/web/README.md', 'archive/web/src/example.test.ts',
      'archive/scripts/finalize-illustration-job.py', 'archive/scripts/knowledge-semantic-prepare.mjs',
      'archive/web/public/deploy-meta.json', markerRef]
    for (const ref of [...inputs, ...ignored]) {
      git('reset','--hard',baseline); git('clean','-fd')
      const bytes = ref === markerRef ? JSON.stringify({ ...marker, release_attempt: 2 })
        : ref === 'archive/automation/release-policy.json' ? JSON.stringify({ ...policy, release_hour_kst: 22 }) : 'changed\n'
      await put(ref, bytes); git('add','.'); git('commit','-m',ref)
      const head = git('rev-parse','HEAD'), markerBefore = await readFile(join(cwd,markerRef),'utf8')
      const changed = inputs.includes(ref)
      for (const force of [false, true]) {
        const outcome = await prepare(['--apply', ...(force ? ['--force'] : [])], { cwd, now })
        assert.equal(outcome.status, changed ? 'RELEASE_PREPARED' : 'NO_CHANGES', `${ref} force=${force}`)
        // Restore only fixture marker writes before checking the other mode.
        await put(markerRef, markerBefore)
        assert.equal(git('rev-parse','HEAD'),head)
        assert.equal(git('status','--porcelain'),'')
      }
      if (changed) {
        assert.equal((await prepare(['--check'], { cwd, now: new Date('2026-10-02T14:00:00Z') })).status,'WAITING_WINDOW')
        assert.equal((await prepare(['--check','--force'], { cwd, now: new Date('2026-10-02T14:00:00Z') })).status,'WOULD_RELEASE')
        assert.equal((await prepare(['--check','--force'], { cwd, now: new Date('2026-10-01T14:30:00Z') })).status,'DAILY_LIMIT_REACHED')
      }
    }
    git('reset','--hard',baseline); git('clean','-fd')
    await put(markerRef, JSON.stringify({ ...marker, source_main_sha: 'invalid-ref' }))
    await assert.rejects(prepare(['--check','--force'], { cwd, now }), /INVALID_RELEASE_MARKER/)
  } finally { await rm(cwd,{recursive:true,force:true}) }
})

test('waits for the two-day batching window', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  const decision = decideRelease({
    headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-29T14:00:00Z'),
  })
  assert.equal(decision.status, 'WAITING_WINDOW')
  assert.equal(decision.remaining_days, 1)
})

test('releases after the batching window and supports force', () => {
  const marker = nextReleaseMarker({ sourceMainSha: sha('a'), policy, now: new Date('2026-09-28T14:00:00Z') })
  assert.equal(decideRelease({
    headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-30T14:00:00Z'),
  }).due, true)
  assert.equal(decideRelease({
    headSha: sha('c'), lastReleaseCommit: sha('b'), marker, policy,
    now: new Date('2026-09-28T15:00:00Z'), force: true,
  }).reason, 'FORCED')
  assert.doesNotThrow(() => validateReleaseMarker(marker))
})


test('checked-in Survival Diary config keeps one two-day Production gate', () => {
  const checkedInPolicy = JSON.parse(readFileSync(
    new URL('../../automation/release-policy.json', import.meta.url),
    'utf8',
  ))
  const netlifyConfig = readFileSync(
    new URL('../../web/netlify.toml', import.meta.url),
    'utf8',
  )
  const productionContext = netlifyConfig.split('[context.production]')[1]?.split('[context.deploy-preview]')[0] ?? ''

  assert.equal(checkedInPolicy.mode, 'BATCHED')
  assert.equal(checkedInPolicy.production_interval_days, 2)
  assert.equal(checkedInPolicy.max_production_deploys_per_day, 1)
  assert.match(productionContext,
    /git diff --quiet \$COMMIT_REF\^1 \$COMMIT_REF -- public\/release\/production\.json/)
  assert.doesNotMatch(productionContext, /\$CACHED_COMMIT_REF/)
})
