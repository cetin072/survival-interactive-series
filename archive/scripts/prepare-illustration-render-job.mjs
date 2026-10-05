import { createHash } from 'node:crypto'
import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileIllustrationRendererText, ILLUSTRATION_IMAGE_PROMPT_VERSION } from './lib/illustration-image-prompt.mjs'
import { buildIllustrationReviewContext } from './lib/illustration-review-context.mjs'
import { readJson, selectIllustrationCandidates } from './lib/illustration-worker.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const visualPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')
const assetsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json')
const manualAssetsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/MANUAL_SITE_ASSETS.json')
const visualProfilesPath = resolve(root, 'archive/content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json')
const receiptsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_RECEIPTS.json')
const providerPath = resolve(root, 'archive/automation/illustration-generation-provider.json')
const acceptedIdentityDir = resolve(root, 'archive/content/visuals/C03-AFTERFALL')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const kstDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replaceAll('-', '')

const renderRunSuffix = () => {
  const raw = process.env.GITHUB_RUN_ID ?? String(Date.now())
  const normalized = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(-20)
  if (!normalized) throw new Error('ILLUSTRATION_PREP_RUN_SUFFIX_INVALID')
  return normalized
}

function demand(ok, code) {
  if (!ok) throw new Error(code)
}

async function readAcceptedIdentityAssets() {
  const names = (await readdir(acceptedIdentityDir))
    .filter((name) => /^ILLUSTRATION_E2E_[A-Z0-9_-]+[.]json$/.test(name))
    .sort()
  const assets = []
  for (const name of names) {
    const identity = await readJson(resolve(acceptedIdentityDir, name))
    demand(identity?.version === 'illustration-e2e-identity-v1'
      && /^point-[a-f0-9]{64}$/.test(identity.point_id ?? '')
      && /^generation-[a-f0-9]{64}$/.test(identity.generation_key ?? '')
      && /^(char|loc|event)-[a-z0-9]+(-[a-z0-9]+)*$/.test(identity.subject_id ?? '')
      && /^[a-f0-9]{64}$/.test(identity.source_sha256 ?? ''),
    'ILLUSTRATION_PREP_ACCEPTED_IDENTITY_INVALID')
    assets.push({
      point_id: identity.point_id,
      generation_key: identity.generation_key,
      subject_id: identity.subject_id,
    })
  }
  return assets
}

async function rpc(name, body) {
  const base = (process.env.ARCHIVE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.ARCHIVE_SUPABASE_SERVICE_ROLE_KEY ?? ''
  demand(/^https:\/\/jgsxpdflgkqroecfjzxq\.supabase\.co$/.test(base) && key.length >= 20,
    'ILLUSTRATION_PREP_SUPABASE_CREDENTIALS_REQUIRED')
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`ILLUSTRATION_PREP_RPC_${response.status}:${text.slice(0, 1000)}`)
  return text ? JSON.parse(text) : null
}

export async function prepareRenderJob({
  mainSha = process.env.GITHUB_SHA, previewOnly = false, attemptHistory = null,
} = {}) {
  demand(/^[a-f0-9]{40}$/.test(mainSha ?? ''), 'ILLUSTRATION_PREP_MAIN_SHA_INVALID')
  demand(typeof previewOnly === 'boolean' && (attemptHistory === null || previewOnly),
    'ILLUSTRATION_PREP_HISTORY_OVERRIDE_REQUIRES_PREVIEW')
  const [catalog, siteAssets, manualAssets, acceptedIdentities, visualProfiles, receipts, providerConfig] = await Promise.all([
    readJson(visualPath), readJson(assetsPath), readJson(manualAssetsPath), readAcceptedIdentityAssets(),
    readJson(visualProfilesPath), readJson(receiptsPath), readJson(providerPath),
  ])
  demand(manualAssets?.version === 'archive-manual-site-assets-v1' && Array.isArray(manualAssets.assets),
    'ILLUSTRATION_PREP_MANUAL_ASSETS_INVALID')
  demand(visualProfiles?.version === 'record-visual-profile-v1' && Array.isArray(visualProfiles.records),
    'ILLUSTRATION_PREP_VISUAL_PROFILES_INVALID')
  const profileBySubject = new Map(visualProfiles.records.map((profile) => [profile.node_id, profile]))
  demand(profileBySubject.size === visualProfiles.records.length, 'ILLUSTRATION_PREP_VISUAL_PROFILE_DUPLICATE')
  const effectiveSiteAssets = {
    ...siteAssets,
    assets: [...manualAssets.assets, ...acceptedIdentities, ...siteAssets.assets],
  }

  const activeProvider = providerConfig.active_provider
  const provider = providerConfig.providers?.[activeProvider]
  demand(providerConfig.version === 'illustration-generation-provider-v1'
    && typeof activeProvider === 'string' && provider?.enabled === true,
  'ILLUSTRATION_PREP_PROVIDER_INVALID')
  if (provider.paid === true && provider.requires_explicit_paid_approval === true) {
    return { status: 'PAID_PROVIDER_NOT_APPROVED', active_provider: activeProvider }
  }
  if (activeProvider !== 'native_chatgpt') {
    return { status: 'RENDER_PROVIDER_NOT_SCHEDULED_CHATGPT', active_provider: activeProvider }
  }

  const observedAttempts = attemptHistory ?? await rpc('archive_illustration_render_attempt_history', {})
  demand(Array.isArray(observedAttempts), 'ILLUSTRATION_PREP_ATTEMPT_HISTORY_INVALID')
  const plan = selectIllustrationCandidates({
    catalog, siteAssets: effectiveSiteAssets, receipts, observedAttempts, batchLimit: 3,
    subjectIds: [...profileBySubject.keys()],
  })
  if (!plan.candidates.length) {
    return { status: 'NO_CANDIDATE', active_provider: activeProvider }
  }

  for (const candidate of plan.candidates) {
    const point = catalog.points.find((item) => item.point_id === candidate.point_id)
    demand(point, 'ILLUSTRATION_PREP_POINT_NOT_FOUND')
    const profile = profileBySubject.get(candidate.subject_id)
    demand(profile, 'ILLUSTRATION_PREP_VISUAL_PROFILE_NOT_FOUND')
    const reviewContextBundle = buildIllustrationReviewContext(point, profile)
    const promptText = compileIllustrationRendererText(point, reviewContextBundle)
    const promptSha256 = sha256(promptText)
    const safeSubject = candidate.subject_id.replace(/[^a-z0-9-]/g, '-')
    const generationSuffix = candidate.generation_key.slice('generation-'.length, 'generation-'.length + 12)
    const jobId = `illustration-${safeSubject}-${generationSuffix}-${kstDate()}-${renderRunSuffix()}`
    const payload = {
      job_id: jobId,
      main_sha: mainSha,
      point_id: candidate.point_id,
      generation_key: candidate.generation_key,
      subject_id: candidate.subject_id,
      title: point.title,
      active_provider: activeProvider,
      prompt_contract: ILLUSTRATION_IMAGE_PROMPT_VERSION,
      prompt_text: promptText,
      prompt_sha256: promptSha256,
      review_context_version: reviewContextBundle.review_context_version,
      review_context_sha256: reviewContextBundle.review_context_sha256,
      review_context: reviewContextBundle.review_context,
    }
    // Transport rehearsal uses the same candidate/compiler without creating a
    // DB job or bypassing the daily-success gate. Never report it as PREPARED.
    if (previewOnly) return { status: 'PREVIEW_ONLY', active_provider: activeProvider, job: payload }
    const result = await rpc('archive_illustration_render_job_enqueue', { p_job: payload })
    if (result?.status === 'PREPARED' || result?.status === 'WAITING_EXISTING_JOB'
      || result?.status === 'DAILY_JOB_CAP_REACHED'
      || result?.status === 'DAILY_SUCCESS_TARGET_REACHED'
      || result?.status === 'DAILY_ATTEMPT_CAP_REACHED'
      || result?.status === 'FINALIZE_QUEUED'
      || result?.status === 'INGESTING' || result?.status === 'READY_FOR_REVIEW') {
      return { ...result, active_provider: activeProvider }
    }
    if (result?.status === 'ILLUSTRATION_ALREADY_REGISTERED'
      || result?.status === 'ILLUSTRATION_ALREADY_SUCCEEDED'
      || result?.status === 'ILLUSTRATION_RETRY_CAP_REACHED'
      || result?.status === 'ILLUSTRATION_INFRA_RETRY_CAP_REACHED'
      || result?.status === 'HUMAN_REVIEW_REQUIRED') continue
    throw new Error('ILLUSTRATION_PREP_ENQUEUE_UNEXPECTED')
  }
  return { status: 'NO_ELIGIBLE_AFTER_QUEUE_GATES', active_provider: activeProvider }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await prepareRenderJob()
    const promptOutput = process.env.RENDER_PROMPT_OUTPUT
    if (promptOutput) {
      let promptText = ''
      if (result.active_provider === 'native_chatgpt') {
        const current = await rpc('archive_illustration_render_prompt', {})
        if (typeof current === 'string') promptText = current
      }
      await writeFile(resolve(promptOutput), promptText, 'utf8')
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } catch (error) {
    process.stderr.write(JSON.stringify({
      status: 'ILLUSTRATION_PREP_FAILED',
      error: error.message ?? 'UNKNOWN',
    }) + '\n')
    process.exitCode = 1
  }
}
