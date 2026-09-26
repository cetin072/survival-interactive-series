/** Read-only stage accounting. The report cannot authorize execution or publication. */
const demand = (ok, code) => { if (!ok) throw new Error(code) }

export function assembleArchiveRun({ reader, graph = null, visual = null, attemptPlan = null }) {
  demand(reader?.mode === 'LOCAL_READER_BATCH' && reader.files_written === 0
    && reader.external_calls === 0 && reader.database_writes === 0 && reader.site_publications === 0,
  'READER_NOT_DRY_RUN')
  const readerCurrent = reader.reader_status === 'NOOP'
  if (!readerCurrent) demand(graph === null && visual === null && attemptPlan === null, 'DOWNSTREAM_USED_STALE_READER')
  if (readerCurrent) {
    demand(graph?.mode === 'LOCAL_GRAPH_BATCH' && graph.files_written === 0, 'GRAPH_NOT_DRY_RUN')
    demand(visual?.mode === 'LOCAL_VISUAL_BRIEF_COMPILER' && visual.files_written === 0
      && visual.provider_calls === 0 && visual.database_writes === 0 && visual.site_publications === 0
      && visual.selection?.execution_enabled === false, 'VISUAL_EXECUTION_NOT_DISABLED')
    demand(reader.batch_id === graph.batch_id && graph.batch_id === visual.batch_id
      && reader.source_revision === graph.source_revision && graph.source_revision === visual.source_revision,
    'PIPELINE_BATCH_MISMATCH')
    if (attemptPlan !== null) demand(attemptPlan.mode === 'LEDGER_PLAN_ONLY'
      && attemptPlan.catalog_sha256 === visual.catalog_sha256 && attemptPlan.execution_enabled === false
      && attemptPlan.provider_calls === 0 && attemptPlan.images_generated === 0 && attemptPlan.storage_uploads === 0,
    'ATTEMPT_LEDGER_EXECUTION_NOT_DISABLED')
  }
  return {
    version: 'archive-orchestration-check-v1', mode: 'READ_ONLY_CHECK', batch_id: reader.batch_id,
    source_revision: reader.source_revision, source_save_version: reader.source_save_version,
    stages: {
      reader: { status: readerCurrent ? 'CURRENT_COMMITTED_BOOK' : 'AWAITING_REVIEWED_BOOK_COMMIT',
        added_chapters: reader.added_chapters, candidate_sha256: reader.book_sha256 },
      graph: { status: readerCurrent ? 'COMPILED_IN_MEMORY' : 'WAITING_READER',
        content_sha256: graph?.graph_sha256 ?? null },
      visual: { status: readerCurrent ? 'BRIEFS_COMPILED_IN_MEMORY' : 'WAITING_READER',
        content_sha256: visual?.catalog_sha256 ?? null, ready_briefs: visual?.selection.ready ?? 0,
        waiting_briefs: visual?.selection.waiting ?? 0 },
      image: { status: 'BLOCKED_REAL_ACCEPTED_RESULT', accepted_images: 0, execution_enabled: false },
      storage: { status: 'DISABLED', durable_assets: 0 },
      site: { status: 'NOT_PUBLISHED', site_publications: 0 },
      schedule: { status: 'NOT_PROVEN', unattended_runs: 0 },
      cost: { status: 'NOT_AUDITED', added_cost_proven_zero: false },
    },
    attempt_ledger: attemptPlan === null ? { status: 'NOT_SUPPLIED', reserved: 0, failed: 0, quarantined: 0 }
      : { status: 'VALIDATED_LOCAL_PLAN', reserved: attemptPlan.reserved, failed: attemptPlan.failed,
        quarantined: attemptPlan.quarantined, retry_exhausted: attemptPlan.retry_exhausted },
    selected_point_ids: attemptPlan?.selected_point_ids ?? visual?.selection.selected_point_ids ?? [],
    file_writes: 0, provider_calls: 0, database_writes: 0, storage_uploads: 0, site_publications: 0,
  }
}
