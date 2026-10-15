import test from 'node:test'
import assert from 'node:assert/strict'
import { stageEvidenceRiskNotes } from './knowledge-semantic-jobs.mjs'

test('risk-note text is losslessly wrapped without changing source facts, unknowns or rights', () => {
  const evidence = { risk_notes: '  원문 안전 경계\n두 번째 문장도 그대로 보존.  ', unknowns: ['미확인'], conflicts: [], copyright_status: 'UNCHECKED', claims: [{ claim: '원래 주장' }] }
  const before = JSON.stringify(evidence)
  const result = stageEvidenceRiskNotes(evidence)
  assert.equal(result.risk_notes_wrapped, true)
  assert.deepEqual(result.evidence.risk_notes, [evidence.risk_notes])
  assert.deepEqual(result.evidence.unknowns, ['미확인'])
  assert.equal(result.evidence.copyright_status, 'UNCHECKED')
  assert.equal(JSON.stringify(evidence), before)
})

test('valid arrays stay equivalent; missing, empty and invalid notes are not invented or silently cleared', () => {
  for (const risk_notes of [[], ['경계'], undefined, null, '', '  ', { text: 'invalid' }]) {
    const original = { risk_notes }
    const result = stageEvidenceRiskNotes(original)
    assert.equal(result.risk_notes_wrapped, false)
    assert.deepEqual(result.evidence, original)
    assert.notEqual(result.evidence, original)
  }
})
