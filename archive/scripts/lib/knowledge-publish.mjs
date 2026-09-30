const fail = (condition, message) => { if (!condition) throw new Error(`KNOWLEDGE_PUBLISH_PREPARE: ${message}`) }

export function expectedReleaseDecision(mode) {
  if (mode === 'AUTO_LOW_RISK_SHADOW') return 'WOULD_AUTO_PUBLISH'
  if (mode === 'AUTO_LOW_RISK') return 'AUTO_PUBLISH_ELIGIBLE'
  return null
}

export function assertReleaseReady(result, mode) {
  const expected = expectedReleaseDecision(mode)
  fail(expected, `unsupported mode ${mode}`)
  fail(result?.decision === expected, `release decision ${result?.decision ?? 'missing'}; expected ${expected}`)
  fail(result.requires_human === false, 'human review required')
  fail(result.content_only?.allowed === true, 'content-only boundary failed')
  fail(Array.isArray(result.reasons) && result.reasons.length === 0, 'release reasons not empty')
  return true
}

export function promoteBriefRecord(brief, today) {
  fail(brief?.content_type === 'BRIEF', 'target must be BRIEF')
  fail(brief.status === 'READY', `brief status must be READY, got ${brief.status}`)
  fail(brief.risk_level === 'LOW', 'brief risk must be LOW')
  fail(brief.publication_policy === 'AUTO_LOW_RISK', 'brief policy must be AUTO_LOW_RISK')
  fail(brief.semantic_qa_status === 'PASS', 'semantic QA must PASS')
  fail(typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today), 'invalid publication date')
  return {
    ...brief,
    status: 'PUBLISHED',
    published_at: brief.published_at || today,
    updated_at: brief.updated_at >= today ? brief.updated_at : today,
  }
}


export function assertHumanApprovedReleaseReady(result) {
  fail(result?.decision === 'HUMAN_APPROVED_ELIGIBLE', `human-approved release decision ${result?.decision ?? 'missing'}`)
  fail(result.requires_human === false, 'human-approved machine gate still requires review')
  fail(result.content_only?.allowed === true, 'human-approved content-only boundary failed')
  fail(Array.isArray(result.reasons) && result.reasons.length === 0, 'human-approved release reasons not empty')
  return true
}

export function promoteHumanApprovedBriefRecord(brief, today) {
  fail(brief?.content_type === 'BRIEF', 'target must be BRIEF')
  fail(brief.status === 'READY', `brief status must be READY, got ${brief.status}`)
  fail(['LOW', 'HIGH'].includes(brief.risk_level), 'brief risk must be LOW or HIGH')
  fail(['AUTO_LOW_RISK', 'HUMAN_APPROVED'].includes(brief.publication_policy), 'brief policy must be reviewable')
  fail(brief.semantic_qa_status === 'PASS', 'semantic QA must PASS')
  fail(typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today), 'invalid publication date')
  return {
    ...brief,
    status: 'PUBLISHED',
    publication_policy: 'HUMAN_APPROVED',
    published_at: brief.published_at || today,
    updated_at: brief.updated_at >= today ? brief.updated_at : today,
  }
}
