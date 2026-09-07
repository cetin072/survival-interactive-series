import { createStorytellingBenchmarkSession } from '../src/runtime/storytellingBenchmarkSession'
import { HttpGMProvider } from '../src/runtime/gmTransport'
import { runGMProviderTurn } from '../src/runtime/gmTurnRuntime'
import type { GMPlayerInput } from '../src/runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../src/runtime/publicRuntimeCheckpoint'

const preview = process.env.PREVIEW_URL ?? 'https://deploy-preview-67--survival-zero-ai-test.netlify.app'
const endpoint = `${preview}/.netlify/functions/gm`
const keyStatusEndpoint = `${preview}/.netlify/functions/openrouter-key-status`
const smokeMode = process.env.SMOKE_MODE === 'full' ? 'full' : 'quick'

type SmokeResult = { label: string; ok: boolean; detail: string }
type KeyHealth = {
  status?: string
  has_spending_limit?: boolean
  spending_limit_exhausted?: boolean
  http_status?: number
}

const results: SmokeResult[] = []

function mudTimes(narrative: string): string[] {
  return [...narrative.matchAll(/^##\s+(\d{2}:\d{2})\b/gmu)].map((match) => match[1]!)
}

function diagnosticText(checkpoint: PublicRuntimeCheckpoint): string {
  return checkpoint.committed_turn.log
    .filter((entry) => entry.kind === 'system')
    .slice(-2)
    .map((entry) => entry.text)
    .join(' | ')
}

function assertCommitted(before: PublicRuntimeCheckpoint, after: PublicRuntimeCheckpoint, label: string) {
  if (after.committed_turn.number !== before.committed_turn.number + 1) {
    throw new Error(`${label}: turn did not advance (${before.committed_turn.number} -> ${after.committed_turn.number}) :: ${diagnosticText(after)}`)
  }
  if (!after.current_scene.narrative || after.current_scene.narrative === before.current_scene.narrative) {
    throw new Error(`${label}: narrative did not advance`)
  }
  if (after.current_scene.choices.length < 2 || after.current_scene.choices.length > 4) {
    throw new Error(`${label}: invalid next choice count ${after.current_scene.choices.length}`)
  }

  const times = mudTimes(after.current_scene.narrative)
  const visibleEndTime = times.at(-1)
  const headingRepresentsEnd = times.length > 1 || (visibleEndTime !== undefined && visibleEndTime !== before.time)
  if (headingRepresentsEnd && visibleEndTime !== after.time) {
    throw new Error(`${label}: visible/end time mismatch story=${visibleEndTime} engine=${after.time}`)
  }
}

async function assertKeyHealthy() {
  const response = await fetch(keyStatusEndpoint)
  const health = await response.json() as KeyHealth
  console.log(`OPENROUTER KEY PREFLIGHT: ${JSON.stringify(health)}`)
  if (!response.ok || health.status !== 'valid_key' || health.spending_limit_exhausted === true) {
    throw new Error(`OpenRouter key preflight failed: ${JSON.stringify(health)}`)
  }
}

async function tryTurn(checkpoint: PublicRuntimeCheckpoint, input: GMPlayerInput, label: string): Promise<PublicRuntimeCheckpoint | undefined> {
  const provider = new HttpGMProvider(fetch, endpoint)
  const started = Date.now()
  try {
    const next = await runGMProviderTurn(checkpoint, input, provider)
    const ms = Date.now() - started
    assertCommitted(checkpoint, next, label)
    const detail = `${ms}ms turn=${next.committed_turn.number} time=${next.time} location=${next.player_location} choices=${next.current_scene.choices.length}`
    results.push({ label, ok: true, detail })
    console.log(`PASS ${label} ${detail}`)
    return next
  } catch (error) {
    const ms = Date.now() - started
    const detail = `${ms}ms ${error instanceof Error ? error.message : String(error)}`
    results.push({ label, ok: false, detail })
    console.error(`FAIL ${label} ${detail}`)
    return undefined
  }
}

async function runQuickSmoke() {
  const independent: Array<[string, GMPlayerInput]> = [
    ['choice-1', { kind: 'numbered-choice', choice_id: 1 }],
    ['ordered-1-2', { kind: 'ordered-choices', choice_ids: [1, 2] }],
    ['free-role-split', { kind: 'free-action', text: '서윤이 병원에서 나올 수 있으면 민석을 맡고, 못 나오면 아버지는 스스로 대피하도록 하고 내가 민석을 데리러 간다' }],
  ]

  for (const [label, input] of independent) {
    await tryTurn(createStorytellingBenchmarkSession(), input, label)
  }

  let chain: PublicRuntimeCheckpoint | undefined = createStorytellingBenchmarkSession()
  chain = chain ? await tryTurn(chain, { kind: 'numbered-choice', choice_id: 1 }, 'chain-turn-1') : undefined
  chain = chain ? await tryTurn(chain, {
    kind: 'free-action',
    text: '민석을 데리러 가는 흐름은 유지하면서 아버지와 서윤도 각자 상황에 맞게 움직이도록 한다',
  }, 'chain-turn-2-free') : undefined
}

async function runFullSmoke() {
  const independent: Array<[string, GMPlayerInput]> = [
    ['choice-1', { kind: 'numbered-choice', choice_id: 1 }],
    ['choice-2', { kind: 'numbered-choice', choice_id: 2 }],
    ['choice-3', { kind: 'numbered-choice', choice_id: 3 }],
    ['choice-4', { kind: 'numbered-choice', choice_id: 4 }],
    ['ordered-1-2', { kind: 'ordered-choices', choice_ids: [1, 2] }],
    ['free-family-plan', { kind: 'free-action', text: '아버지에게는 바로 대피 준비를 부탁하고, 민석에게 연락해 안전한 곳에서 기다리라고 한 뒤 데리러 간다' }],
    ['free-role-split', { kind: 'free-action', text: '서윤이 병원에서 나올 수 있으면 민석을 맡고, 못 나오면 아버지는 스스로 대피하도록 하고 내가 민석을 데리러 간다' }],
  ]

  for (const [label, input] of independent) {
    await tryTurn(createStorytellingBenchmarkSession(), input, label)
  }

  let chain: PublicRuntimeCheckpoint | undefined = createStorytellingBenchmarkSession()
  chain = chain ? await tryTurn(chain, { kind: 'numbered-choice', choice_id: 1 }, 'chain-turn-1') : undefined
  chain = chain ? await tryTurn(chain, { kind: 'numbered-choice', choice_id: 1 }, 'chain-turn-2') : undefined
  chain = chain ? await tryTurn(chain, { kind: 'free-action', text: '현재 가족 상황을 기준으로 가장 위험한 곳에 있는 가족부터 챙기되, 이미 정한 이동은 계속 진행한다' }, 'chain-turn-3-free') : undefined
}

async function main() {
  console.log(`LIVE PREVIEW SMOKE MODE: ${smokeMode}`)
  await assertKeyHealthy()

  if (smokeMode === 'full') await runFullSmoke()
  else await runQuickSmoke()

  const expected = smokeMode === 'full' ? 10 : 5
  const passed = results.filter((result) => result.ok).length
  console.log('--- LIVE PREVIEW SMOKE SUMMARY ---')
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.label}: ${result.detail}`)
  console.log(`LIVE PREVIEW SMOKE: ${passed}/${results.length} PASS`)

  if (passed !== expected || results.length !== expected) process.exit(1)
}

main().catch((error) => {
  console.error('LIVE PREVIEW SMOKE HARNESS FAILED')
  console.error(error instanceof Error ? error.stack : String(error))
  process.exit(1)
})
