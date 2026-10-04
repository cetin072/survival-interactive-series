import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OperatorDashboard, emptyInbox, type ProductionStatus, type SystemStatus } from './OperatorDashboard'

const systemStatus: SystemStatus = {
  archive: { dispatch_count: 1, latest_dispatch: null, cron: null },
  a_wiki: { job_count: 1, active_count: 1, published_count: 0, latest_job: { status: 'EXTRACTOR_READY', session_id: 'SESSION_007' } },
  visual: {
    job_count: 1,
    today_job_count: 1,
    today_success_count: 0,
    active_count: 1,
    latest_job: { status: 'PREPARED', subject_id: 'char-test' },
    prep_cron: null,
    retry_cron: null,
  },
  review: { pending_count: 0, automation_error_count: 0 },
  knowledge_semantic: { active_count: 0, latest_job: null, prep: null },
}

const productionStatus: ProductionStatus = {
  release: { source_main_sha: '1234567890abcdef1234567890abcdef12345678', released_on_kst: '2026-10-04' },
  deploy: { context: 'production', commit_ref: 'abcdef1234567890abcdef1234567890abcdef12' },
}

describe('Operator dashboard structure', () => {
  it('keeps exactly four automation boards and Production outside the grid', () => {
    const markup = renderToStaticMarkup(createElement(OperatorDashboard, {
      email: 'operator@example.com',
      busy: false,
      refreshing: false,
      lastRefreshedAt: null,
      error: '',
      statusError: '',
      inbox: emptyInbox,
      systemStatus,
      productionStatus,
      selected: null,
      note: '',
      onNoteChange: () => {},
      onRefresh: () => {},
      onLoadDetail: () => {},
      onDecide: () => {},
      onSignOut: () => {},
    }))

    expect(markup).toContain('A · Archive')
    expect(markup).toContain('A-Wiki · Wiki')
    expect(markup).toContain('B · Visual')
    expect(markup).toContain('C · Knowledge')
    expect(markup.match(/operator-system-card/g)).toHaveLength(4)
    expect(markup).toContain('operator-release-strip')
    expect(markup).toContain('Production')
    expect(markup).not.toContain('VISUAL METADATA')
  })
})
