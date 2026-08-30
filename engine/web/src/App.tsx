import { useEffect, useMemo, useState } from 'react'
import { FreeActionForm } from './components/FreeActionForm'
import { SceneHeader } from './components/SceneHeader'
import { StatusPanels } from './components/StatusPanels'
import { createGameSnapshot } from './state/snapshot'
import { actionForIntent, createInitialSlice, executeTurn } from './slice/engine'
import { contextualChoicesForState } from './slice/eventChoices'
import { eventArchetypes } from './slice/events'
import { parseFreeAction } from './slice/parser'
import { clearSlice, loadSlice, saveSlice } from './slice/storage'
import type { SliceChoice, SliceState } from './slice/types'

function loadInitial(): SliceState {
  if (typeof window === 'undefined') return createInitialSlice()
  return loadSlice(window.localStorage) ?? createInitialSlice()
}

export default function App() {
  const [showPanels, setShowPanels] = useState(true)
  const [slice, setSlice] = useState<SliceState>(loadInitial)
  const [queueText, setQueueText] = useState('')
  const [inputMessage, setInputMessage] = useState('')
  const snapshot = createGameSnapshot(slice.live)
  const choices = useMemo(() => contextualChoicesForState(slice), [slice])
  const currentEvent = eventArchetypes.find((event) => event.id === slice.currentEventId)

  useEffect(() => {
    if (typeof window !== 'undefined') saveSlice(window.localStorage, slice)
  }, [slice])

  const playChoice = (choice: SliceChoice) => {
    const result = executeTurn(slice, choice)
    setSlice(result.state)
    setInputMessage(result.validation?.status === 'REJECT_STATE_CONFLICT' ? '현재 상태와 충돌해 행동이 막혔습니다.' : '')
  }

  const playQueue = () => {
    const ids = queueText.split(/[^0-9]+/).map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5)
    if (ids.length === 0) {
      setInputMessage('예: 3 → 5 → 1 처럼 입력하세요.')
      return
    }
    let next = slice
    for (const id of ids.slice(0, 5)) {
      const choice = contextualChoicesForState(next).find((candidate) => candidate.id === id)
      if (!choice) continue
      const result = executeTurn(next, choice)
      next = result.state
      if (result.validation?.status === 'REJECT_STATE_CONFLICT' || result.validation?.status === 'NEED_GM_REPLAN') break
    }
    setSlice(next)
    setQueueText('')
    setInputMessage(`${Math.min(ids.length, 5)}개 행동을 순서대로 처리했습니다.`)
  }

  const playFreeAction = (input: string) => {
    const parsed = parseFreeAction(input)
    if (!parsed.matched) {
      setInputMessage(`이해하지 못했습니다. 예: ${parsed.suggestions.join(' / ')}`)
      return
    }
    const choice = actionForIntent(slice, parsed.intent, `free-${slice.turn + 1}`)
    const result = executeTurn(slice, { ...choice, label: parsed.normalized })
    setSlice(result.state)
    setInputMessage(`직접 행동을 '${parsed.normalized}'(으)로 해석했습니다.`)
  }

  const reset = () => {
    if (typeof window !== 'undefined') clearSlice(window.localStorage)
    setSlice(createInitialSlice())
    setInputMessage('새 Zero-AI Slice를 시작했습니다.')
  }

  return <main className="app-shell">
    <section className="game-shell">
      <SceneHeader day={`SLICE · TURN ${slice.turn}`} time={snapshot.time} location={snapshot.location} showPanels={showPanels} onTogglePanels={() => setShowPanels((visible) => !visible)} />

      <section className="slice-meta" aria-label="검증 상태">
        <span>AI CALLS <strong>0</strong></span>
        <span>PRESSURE <strong>{slice.pressure}/4</strong></span>
        <span>SEED <strong>{slice.worldSeed}</strong></span>
        <button type="button" onClick={reset}>RESET</button>
      </section>

      <section className="narrative" aria-label="현재 장면">
        {currentEvent && <p className="event-kicker">EVENT · {currentEvent.title}</p>}
        <p>{slice.narrative}</p>
        {slice.lastFamilyDecision && <p className="family-response">FAMILY · {slice.lastFamilyDecision.text}</p>}
      </section>

      {showPanels && <StatusPanels family={snapshot.family} resources={snapshot.resources} />}

      <section className="choices" aria-label="선택지">
        {choices.map((choice) => <button type="button" key={choice.id} onClick={() => playChoice(choice)}><kbd>{choice.id}</kbd><span>{choice.label}</span></button>)}
      </section>

      <section className="queue-panel" aria-label="복수 행동 큐">
        <label htmlFor="queue-input">복수 행동 · 순서가 결과에 영향을 줍니다</label>
        <div>
          <input id="queue-input" value={queueText} onChange={(event) => setQueueText(event.target.value)} placeholder="예: 3 → 5 → 1" inputMode="numeric" />
          <button type="button" onClick={playQueue}>실행</button>
        </div>
      </section>

      <FreeActionForm onSubmit={playFreeAction} />
      {inputMessage && <p className="input-message" role="status">{inputMessage}</p>}

      <section className="slice-log" aria-label="검증 로그">
        <p className="log-title">LOCAL VALIDATION LOG</p>
        {[...slice.log].reverse().slice(0, 8).map((entry) => <article key={entry.turn}>
          <strong>T{entry.turn}</strong>
          <span>{entry.action}</span>
          <small>{entry.elapsedMinutes}분 · EVENT {entry.eventId ?? 'NONE'} · FAMILY {entry.familyDecision ?? 'NONE'} · {entry.validator}{entry.repetitionGuard ? ' · REPEAT-GUARD' : ''}</small>
        </article>)}
        {slice.log.length === 0 && <p className="empty-log">선택하면 턴 검증 기록이 여기에 쌓입니다.</p>}
      </section>
    </section>
  </main>
}
