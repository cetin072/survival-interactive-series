import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileIllustrationRendererText, ILLUSTRATION_IMAGE_PROMPT_VERSION } from './lib/illustration-image-prompt.mjs'
import { readJson, selectIllustrationCandidates } from './lib/illustration-worker.mjs'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const visualPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/VISUALS.json')
const assetsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json')
const manualAssetsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/MANUAL_SITE_ASSETS.json')
const visualProfilesPath = resolve(root, 'archive/content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json')
const receiptsPath = resolve(root, 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_RECEIPTS.json')
const providerPath = resolve(root, 'archive/automation/illustration-generation-provider.json')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const kstDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()).replaceAll('-', '')

function demand(ok, code) {
  if (!ok) throw new Error(code)
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

export async function prepareRenderJob({ mainSha = process.env.GITHUB_SHA } = {}) {
  demand(/^[a-f0-9]{40}$/.test(mainSha ?? ''), 'ILLUSTRATION_PREP_MAIN_SHA_INVALID')
  const [catalog, siteAssets, manualAssets, visualProfiles, receipts, providerConfig] = await Promise.all([
    readJson(visualPath), readJson(assetsPath), readJson(manualAssetsPath), readJson(visualProfilesPath),
    readJson(receiptsPath), readJson(providerPath),
  ])
  demand(manualAssets?.version === 'archive-manual-site-assets-v1' && Array.isArray(manualAssets.assets),
    'ILLUSTRATION_PREP_MANUAL_ASSETS_INVALID')
  demand(visualProfiles?.version === 'record-visual-profile-v1' && Array.isArray(visualProfiles.records),
    'ILLUSTRATION_PREP_VISUAL_PROFILES_INVALID')
  const profileByNode = new Map(visualProfiles.records.map((record) => [record.node_id, record]))
  demand(profileByNode.size === visualProfiles.records.length,
    'ILLUSTRATION_PREP_VISUAL_PROFILE_DUPLICATE')
  const effectiveSiteAssets = { ...siteAssets, assets: [...manualAssets.assets, ...siteAssets.assets] }

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

  const plan = selectIllustrationCandidates({
    catalog, siteAssets: effectiveSiteAssets, receipts, batchLimit: 3,
  })
  if (!plan.candidates.length) {
    return { status: 'NO_CANDIDATE', active_provider: activeProvider }
  }

  for (const candidate of plan.candidates) {
    const point = catalog.points.find((item) => item.point_id === candidate.point_id)
    demand(point, 'ILLUSTRATION_PREP_POINT_NOT_FOUND')
    const profile = profileByNode.get(candidate.subject_id) ?? null
    const promptText = compileIllustrationRendererText(point, profile)
    const promptSha256 = sha256(promptText)
    const safeSubject = candidate.subject_id.replace(/[^a-z0-9-]/g, '-')
    const generationSuffix = candidate.generation_key.slice('generation-'.length, 'generation-'.length + 12)
    const jobId = `illustration-${safeSubject}-${generationSuffix}-${kstDate()}`
    const result = await rpc('archive_illustration_render_job_enqueue', {
      p_job: {
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
      },
    })
    if (result?.status === 'PREPARED' || result?.status === 'WAITING_EXISTING_JOB'
      || result?.status === 'DAILY_JOB_CAP_REACHED' || result?.status === 'FINALIZE_QUEUED'
      || result?.status === 'INGESTING' || result?.status === 'READY_FOR_REVIEW') {
      return { ...result, active_provider: activeProvider }
    }
    if (result?.status === 'ILLUSTRATION_ALREADY_SUCCEEDED'
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
        if (typeof current === 'string') promptText = current.trim()
      }
      await writeFile(resolve(promptOutput), promptText ? `${promptText}\n` : '', 'utf8')
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
