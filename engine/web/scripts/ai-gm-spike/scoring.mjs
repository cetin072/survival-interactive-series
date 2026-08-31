import { normalizedAction } from './schema.mjs'

const FIELDS = ['verb', 'actor', 'target', 'to', 'vehicle', 'items']

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function scoreResponse(response, benchmarkCase) {
  const expected = benchmarkCase.expected
  if (!response) return { structuralMatchScore: 0, actionCountCorrect: false, actionOrderCorrect: false, ambiguityCorrect: false }
  const actualActions = response.actions ?? []
  const expectedActions = expected.actions
  const actionCountCorrect = actualActions.length === expectedActions.length
  const actionOrderCorrect = actionCountCorrect && actualActions.every((action, index) => action.verb === expectedActions[index].verb)
  const comparedActions = Math.max(actualActions.length, expectedActions.length, 1)
  let matchedFields = 0
  for (let index = 0; index < comparedActions; index += 1) {
    const actual = normalizedAction(actualActions[index])
    const expectedAction = normalizedAction(expectedActions[index])
    for (const field of FIELDS) if (sameValue(actual[field], expectedAction[field])) matchedFields += 1
  }
  return {
    structuralMatchScore: matchedFields / (comparedActions * FIELDS.length),
    actionCountCorrect,
    actionOrderCorrect,
    ambiguityCorrect: response.ambiguous === expected.ambiguous,
  }
}

export function summarizeResults(results) {
  const byModel = new Map()
  for (const result of results) {
    const values = byModel.get(result.model) ?? []
    values.push(result)
    byModel.set(result.model, values)
  }
  return [...byModel.entries()].map(([model, entries]) => {
    const average = (field) => {
      const available = entries.map((item) => item[field]).filter((value) => typeof value === 'number' && Number.isFinite(value))
      return available.length ? available.reduce((total, value) => total + value, 0) / available.length : null
    }
    const percentage = (field) => (entries.filter((item) => item[field]).length / entries.length) * 100
    return {
      model,
      cases: entries.length,
      schemaValidRate: percentage('schemaValid'),
      structuralMatchScore: average('structuralMatchScore'),
      actionCountRate: percentage('actionCountCorrect'),
      actionOrderRate: percentage('actionOrderCorrect'),
      ambiguityRate: percentage('ambiguityCorrect'),
      averageLatencyMs: average('latencyMs'),
      averageInputTokens: average('inputTokens'),
      averageOutputTokens: average('outputTokens'),
      averageTotalTokens: average('totalTokens'),
    }
  })
}
