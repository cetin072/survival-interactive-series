import type { ReactNode } from 'react'
import type { RuntimeLoadResult } from '../runtime/loadRuntimeState'
import type { StateConsoleView } from '../runtime/types'

type Props = {
  view: StateConsoleView
  source: RuntimeLoadResult['source']
  sourceWarning: string | null
  refreshing: boolean
  onRefresh: () => void
}

function Section({ title, children, empty }: { title: string; children: ReactNode; empty?: boolean }) {
  return <section className="console-section" aria-label={title}>
    <h2>{title}</h2>
    {empty ? <p className="empty-state">현재 항목 없음</p> : children}
  </section>
}

function valueOrNone(value: string | null): string {
  return value ?? '미기록'
}

export function StateConsole({ view, source, sourceWarning, refreshing, onRefresh }: Props) {
  return <main className="console-shell">
    <header className="console-header">
      <div>
        <p className="console-kicker">GM COPROCESSOR · READ ONLY</p>
        <h1>{view.header.season} · {view.header.phase}</h1>
        <p className="headline-meta">{view.header.date} · {view.header.time}</p>
        <p className="headline-location">{view.header.location}</p>
      </div>
      <button className="refresh-button" type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'SYNC…' : 'REFRESH'}
      </button>
    </header>

    <div className="source-line">
      <span className={source === 'github-raw' ? 'source-dot live' : 'source-dot'} aria-hidden="true" />
      {source === 'github-raw' ? 'GITHUB CHECKPOINT LIVE' : 'DEPLOY CHECKPOINT FALLBACK'}
    </div>
    {sourceWarning && <p className="source-warning" role="status">{sourceWarning}</p>}

    <Section title="FAMILY" empty={view.family.length === 0}>
      <div className="family-list">
        {view.family.map((member) => <article className="family-row" key={member.id}>
          <div><strong>{member.name}</strong><span>{member.age}세 · {member.sex} · {member.relation}</span></div>
          <div className="row-values"><span>{member.location}</span><b>{member.status}</b></div>
        </article>)}
      </div>
    </Section>

    <div className="console-grid">
      <Section title="VEHICLE" empty={view.vehicles.length === 0}>
        {view.vehicles.map((vehicle) => <article className="data-card" key={vehicle.id}>
          <strong>{vehicle.name}</strong>
          <dl><dt>위치</dt><dd>{vehicle.location}</dd><dt>사용자</dt><dd>{vehicle.current_user ?? '없음'}</dd><dt>상태</dt><dd>{vehicle.availability}</dd></dl>
        </article>)}
      </Section>

      <Section title="RESOURCE" empty={view.resources.length === 0}>
        <div className="compact-list">
          {view.resources.map((resource) => <p key={resource.id}><span>{resource.name}</span><strong className={`band band-${resource.band}`}>{resource.band_label}</strong></p>)}
        </div>
      </Section>
    </div>

    <Section title="BASE" empty={view.bases.length === 0}>
      <div className="base-list">
        {view.bases.map((base) => <article className="data-card" key={base.id}>
          <div className="card-title"><strong>{base.name}</strong><span>{base.state}</span></div>
          <p>{base.location}</p>
          <ul className="tag-list">{base.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
        </article>)}
      </div>
    </Section>

    <Section title="ACTIVE" empty={view.active_actions.length === 0}>
      {view.active_actions.map((action) => <article className="data-card" key={action.id}><strong>{action.label}</strong><p>{action.actors.join(' · ')}</p></article>)}
    </Section>

    <Section title="RECENT CHANGE" empty={view.recent_changes.length === 0}>
      <ol className="change-list">
        {view.recent_changes.map((change) => <li key={change.id}><span>{valueOrNone(change.at)}</span><p>{change.message}</p></li>)}
      </ol>
    </Section>

    <Section title="CHECKPOINT">
      <article className="checkpoint-card">
        <strong>{view.checkpoint.id}</strong>
        <span>save v{view.checkpoint.save_version} · runtime schema v{view.checkpoint.runtime_schema_version}</span>
        <span>{valueOrNone(view.checkpoint.at)}</span>
      </article>
    </Section>

    <Section title="CONSISTENCY">
      {view.warnings.length === 0
        ? <p className="consistency-ok"><span aria-hidden="true">●</span> CONSISTENCY OK</p>
        : <ul className="warning-list">{view.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong><span>{warning.message}</span></li>)}</ul>}
    </Section>

    <footer>PUBLIC STATE ONLY · RUNTIME AI/API CALLS 0</footer>
  </main>
}
