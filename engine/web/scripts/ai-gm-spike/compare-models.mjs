import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPrompt } from './prompt.mjs'
import { requireApiKey, requestStructuredAction, selectModels, verifyModels } from './providers.mjs'
import { scoreResponse, summarizeResults } from './scoring.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))

function parseList(value) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []
}

function positiveInteger(value, option) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new Error(`${option} must be a positive integer.`)
  return number
}

export function parseArguments(argv) {
  const options = { modelIds: [], caseIds: [], providerId: undefined, timeoutMs: 20_000, maxModels: undefined, maxCases: undefined, outDir: path.join(scriptDirectory, 'generated') }
  for (const argument of argv) {
    const [flag, value] = argument.split('=', 2)
    if (flag === '--model') options.modelIds.push(...parseList(value))
    else if (flag === '--case') options.caseIds.push(...parseList(value))
    else if (flag === '--provider' && value) options.providerId = value
    else if (flag === '--max-models') options.maxModels = positiveInteger(value, flag)
    else if (flag === '--max-cases') options.maxCases = positiveInteger(value, flag)
    else if (flag === '--timeout-ms') options.timeoutMs = positiveInteger(value, flag)
    else if (flag === '--out-dir' && value) options.outDir = path.resolve(value)
    else if (flag === '--help') options.help = true
    else throw new Error(`Unknown option: ${argument}`)
  }
  return options
}

function usage() {
  return `Usage: npm run ai-gm:compare -- [--model=id[,id]] [--case=id[,id]] [--provider=slug] [--max-models=N] [--max-cases=N] [--timeout-ms=N] [--out-dir=path]`
}

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(scriptDirectory, name), 'utf8'))
}

function selectCases(cases, caseIds, maxCases) {
  const selected = caseIds.length ? cases.filter((benchmarkCase) => caseIds.includes(benchmarkCase.id)) : cases
  const unknown = caseIds.filter((id) => !selected.some((benchmarkCase) => benchmarkCase.id === id))
  if (unknown.length) throw new Error(`Unknown benchmark case: ${unknown.join(', ')}`)
  return maxCases === undefined ? selected : selected.slice(0, maxCases)
}

function metric(value) {
  return value === null || value === undefined ? 'n/a' : typeof value === 'number' ? value.toFixed(2) : String(value)
}

function markdownSummary(metadata, summary) {
  const lines = [
    '# AI GM Spike 01 benchmark summary',
    '',
    `Generated: ${metadata.generatedAt}`,
    `Configured model metadata: ${metadata.modelConfig.retrieved_at} — ${metadata.modelConfig.source}`,
    `Cost: ${metadata.modelConfig.cost_note}`,
    '',
    '| Model | Cases | Schema valid | Structural score | Count | Order | Ambiguity | Avg final attempt | Avg wall clock | Input tokens | Output tokens | Total tokens |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map((item) => `| ${item.model} | ${item.cases} | ${metric(item.schemaValidRate)}% | ${metric(item.structuralMatchScore)} | ${metric(item.actionCountRate)}% | ${metric(item.actionOrderRate)}% | ${metric(item.ambiguityRate)}% | ${metric(item.averageLatencyMs)} ms | ${metric(item.averageWallClockMs)} ms | ${metric(item.averageInputTokens)} | ${metric(item.averageOutputTokens)} | ${metric(item.averageTotalTokens)} |`),
    '',
    'Raw provider content, per-case errors, retries, and request measurements are stored only in the adjacent gitignored JSON report.',
  ]
  return `${lines.join('\n')}\n`
}

export async function main(argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch) {
  const options = parseArguments(argv)
  if (options.help) { console.log(usage()); return { help: true } }
  const apiKey = requireApiKey(environment)
  const [modelConfig, allCases] = await Promise.all([loadJson('models.json'), loadJson('cases.json')])
  const models = selectModels(modelConfig, options.modelIds, options.maxModels)
  const cases = selectCases(allCases, options.caseIds, options.maxCases)
  const verifiedModels = await verifyModels(models, fetchImpl)
  const results = []

  for (const model of verifiedModels) {
    for (const benchmarkCase of cases) {
      if (!model.available || !model.structuredOutputSupported) {
        results.push({ model: model.id, caseId: benchmarkCase.id, expectedDisposition: benchmarkCase.expectedDisposition ?? 'normal', requestedProvider: options.providerId ?? null, upstreamProvider: null, upstreamModel: null, routerMetadataStatus: 'not_requested', routerAttempts: [], schemaValid: false, structuralMatchScore: 0, actionCountCorrect: false, actionOrderCorrect: false, ambiguityCorrect: false, latencyMs: null, wallClockMs: null, attempts: [], failureKind: 'model_capability_unavailable', inputTokens: null, outputTokens: null, totalTokens: null, retryCount: 0, estimatedCostUsd: null, error: model.limitation, rawResponse: null })
        continue
      }
      const response = await requestStructuredAction({ apiKey, model, benchmarkCase, prompt: createPrompt(benchmarkCase), timeoutMs: options.timeoutMs, providerId: options.providerId, fetchImpl })
      const score = response.ok ? scoreResponse(response.value, benchmarkCase) : scoreResponse(null, benchmarkCase)
      const usage = response.usage ?? {}
      results.push({
        model: model.id,
        caseId: benchmarkCase.id,
        expectedDisposition: benchmarkCase.expectedDisposition ?? 'normal',
        requestedProvider: options.providerId ?? null,
        upstreamProvider: response.routing?.upstreamProvider ?? null,
        upstreamModel: response.routing?.upstreamModel ?? null,
        routerMetadataStatus: response.routing?.status ?? 'not_available',
        routerAttempts: response.routing?.attempts ?? [],
        schemaValid: response.ok,
        ...score,
        latencyMs: response.latencyMs ?? null,
        wallClockMs: response.wallClockMs ?? null,
        attempts: response.attempts ?? [],
        failureKind: response.ok ? null : response.failureKind ?? 'unknown_failure',
        inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
        outputTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
        retryCount: response.retryCount,
        estimatedCostUsd: null,
        error: response.ok ? null : response.error,
        rawResponse: response.rawContent,
      })
    }
  }

  const generatedAt = new Date().toISOString()
  const summary = summarizeResults(results)
  const report = { generatedAt, modelConfig: { retrieved_at: modelConfig.retrieved_at, source: modelConfig.source, estimated_cost_usd: modelConfig.estimated_cost_usd, cost_note: modelConfig.cost_note }, verifiedModels, results, summary }
  await mkdir(options.outDir, { recursive: true })
  const timestamp = generatedAt.replace(/[:.]/g, '-')
  const reportPath = path.join(options.outDir, `report-${timestamp}.json`)
  const summaryPath = path.join(options.outDir, `summary-${timestamp}.md`)
  await Promise.all([writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`), writeFile(summaryPath, markdownSummary(report, summary))])
  console.table(summary)
  console.log(`Saved gitignored benchmark report: ${reportPath}`)
  console.log(`Saved gitignored benchmark summary: ${summaryPath}`)
  return { reportPath, summaryPath, report }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
