import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadKnowledge, validateKnowledge } from './lib/knowledge-content.mjs'
import { hashPolicyBytes, makeWorkKey } from './lib/knowledge-semantic-jobs.mjs'
import { createJob, legacyWorkerBlocker, policyPin } from './knowledge-semantic-prepare.mjs'

const root = resolve(import.meta.dirname, '../..')
export const EX001_REF = 'knowledge/content/experience-seeds/EX-001-apartment-power-outage.json'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function experienceSeedChoice(bytes, ref = EX001_REF) {
  if (ref !== EX001_REF) throw new Error('EXPERIENCE_SEED_REF_UNSUPPORTED')
  const seed = JSON.parse(bytes.toString('utf8'))
  if (seed.version !== 'knowledge-experience-seed-v1' || seed.id !== 'EX-001'
    || seed.source_kind !== 'USER_REPORTED_EXPERIENCE' || seed.status !== 'RESEARCH_REQUIRED'
    || !seed.question?.primary || !Array.isArray(seed.experience?.sequence)) throw new Error('EXPERIENCE_SEED_INVALID')
  const sourceKind = 'USER_REPORTED_EXPERIENCE'
  const sourceSha256 = sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
  return {
    jobType: 'FRESH_BRIEF', sourceKind, sourceRef: ref, sourceSha256,
    workKey: makeWorkKey({ sourceKind, sourceRef: ref, sourceSha256 }),
    refs: [], hashes: [],
    excerpt: JSON.stringify({
      experience: { sequence: seed.experience.sequence, decision_shift: seed.experience.decision_shift, reported_cause: seed.experience.reported_cause },
      question: seed.question, knowledge_to_verify: seed.knowledge_to_verify,
      provenance_rule: 'Experience is question provenance only; external official sources support reality claims.',
    }),
  }
}

export async function runExperienceSeedPrepare() {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const mainSha = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim()
  if (head !== mainSha) throw new Error('EXPERIENCE_PREP_REQUIRES_CURRENT_MAIN')
  const blocker = await legacyWorkerBlocker()
  if (blocker) throw new Error(blocker)
  const [seedBytes, policyBytes, configBytes, editorialBytes, data] = await Promise.all([
    readFile(join(root, EX001_REF)),
    readFile(join(root, 'knowledge/automation/worker-policy.json')),
    readFile(join(root, 'knowledge/automation/config.json')),
    readFile(join(root, 'docs/KNOWLEDGE_BRIEF_EDITORIAL_SPEC_V1.md')),
    loadKnowledge(root),
  ])
  await validateKnowledge(data)
  const choice = experienceSeedChoice(seedBytes)
  const policy = JSON.parse(policyBytes.toString('utf8'))
  const config = JSON.parse(configBytes.toString('utf8'))
  const pin = policyPin(policyBytes, configBytes, editorialBytes, policy, config)
  if (pin.sha256 !== hashPolicyBytes(policyBytes, configBytes, editorialBytes)) throw new Error('EXPERIENCE_POLICY_PIN_INVALID')
  const prepared = await createJob({ choice, policy, policyPin: pin, mainSha, data })
  return { status: prepared.result.status, job_id: prepared.result.job_id, source_ref: choice.sourceRef, source_sha256: choice.sourceSha256, brief_id: prepared.context.target.brief_id, candidate_id: prepared.context.target.candidate_id }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== EX001_REF) {
    console.error('Usage: node archive/scripts/knowledge-semantic-prepare-experience.mjs ' + EX001_REF)
    process.exitCode = 1
  } else runExperienceSeedPrepare().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error.message.split(':')[0])
    process.exitCode = 1
  })
}
