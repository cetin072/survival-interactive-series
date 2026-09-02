import { useEffect, useMemo, useState } from 'react'
import { choiceForKey } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { MockProvider } from '../runtime/gmProvider'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import { WEB_MVP_TEST_SESSION_CHECKPOINT_ID, WEB_MVP_TEST_SESSION_STORAGE_KEY, commitWebMvpChoice, createWebMvpTestSession, resetWebMvpTestSession, submitWebMvpFreeAction } from '../runtime/webMvpTestSession'
import { BgmControl } from './BgmControl'
import { ChoiceButtons } from './ChoiceButtons'
import { FreeActionForm } from './FreeActionForm'
import { GameLog } from './GameLog'
import { PresentationBlocks } from './PresentationBlocks'
import { SceneHeader } from './SceneHeader'
import { StatusPanels } from './StatusPanels'

function loadSession(): PublicRuntimeCheckpoint {
  if (typeof window === 'undefined') return createWebMvpTestSession()
  try {
    const raw = window.localStorage.getItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
    if (!raw) return createWebMvpTestSession()
    const saved: unknown = JSON.parse(raw)
    if (typeof saved === 'object' && saved !== null
      && (saved as { contract_version?: unknown }).contract_version === 1
      && (saved as { checkpoint_id?: unknown }).checkpoint_id === WEB_MVP_TEST_SESSION_CHECKPOINT_ID
      && (saved as { season_id?: unknown }).season_id === 'WEB_MVP_TEST_SESSION'
      && typeof (saved as { current_scene?: unknown }).current_scene === 'object'
      && typeof (saved as { public_state?: unknown }).public_state === 'object') return saved as PublicRuntimeCheckpoint
  } catch {
    // Broken or stale test-only storage starts a fresh non-canonical session.
  }
  return createWebMvpTestSession()
}

export function PlayableTurnLoop() {
  const [checkpoint, setCheckpoint] = useState<PublicRuntimeCheckpoint>(loadSession)
  const [showPanels, setShowPanels] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [stallMessage, setStallMessage] = useState<string | null>(null)
  const provider = useMemo(() => new HttpGMProvider(), [])
  const snapshot = createGameSnapshot(checkpoint.public_state)

  useEffect(() => {
    window.localStorage.setItem(WEB_MVP_TEST_SESSION_STORAGE_KEY, JSON.stringify(checkpoint))
  }, [checkpoint])

  function applyCheckpoint(current: PublicRuntimeCheckpoint, next: PublicRuntimeCheckpoint, source: 'choice' | 'free-action') {
    setCheckpoint(next)
    if (next.committed_turn.number > current.committed_turn.number) {
      setStallMessage(null)
      return
    }
    setStallMessage(source === 'choice'
      ? '이 선택은 엔진 검증에서 커밋되지 않았습니다. 화면이 멈춘 것이 아닙니다. 다른 선택을 하거나 RESET으로 새 테스트 세션을 시작할 수 있습니다.'
      : '자유행동 결과가 상태 커밋으로 이어지지 않았습니다. 공개 선택지를 계속 사용하거나 다시 시도할 수 있습니다.')
  }

  function reset() {
    window.localStorage.removeItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
    setStallMessage(null)
    setCheckpoint(resetWebMvpTestSession())
  }

  function selectChoice(choiceId: number) {
    if (submitting) return
    const current = checkpoint
    const next = commitWebMvpChoice(current, choiceId)
    applyCheckpoint(current, next, 'choice')
  }

  async function submitFreeAction(text: string) {
    if (submitting) return
    setSubmitting(true)
    const current = checkpoint
    try {
      const input = { kind: 'free-action' as const, text }
      const result = await provider.proposeTurn({ input, checkpoint: current })
      if (result.status === 'unavailable') {
        applyCheckpoint(current, submitWebMvpFreeAction(current, text), 'free-action')
        return
      }
      applyCheckpoint(current, await runGMProviderTurn(current, input, new MockProvider(() => result)), 'free-action')
    } catch {
      applyCheckpoint(current, submitWebMvpFreeAction(current, text), 'free-action')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (submitting || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const choice = choiceForKey(event.key, checkpoint.current_scene.choices)
      if (choice) selectChoice(choice.id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [checkpoint.current_scene.choices, submitting])

  return <main className="playable-loop" aria-label="WEB MVP TEST SESSION">
    <header className="test-session-header">
      <div><p>생존일기</p><h1>WEB MVP TEST SESSION</h1><span>NON-CANONICAL · TEST ONLY</span></div>
      <div className="test-session-controls"><BgmControl /><button type="button" onClick={reset}>RESET</button></div>
    </header>
    <p className="test-session-notice">이 화면의 장면·시간·위치·상태 변화는 UI/엔진 검증 전용입니다. 실제 S02 Canon에는 기록되지 않습니다.</p>
    <SceneHeader
      day={`${checkpoint.date ?? 'DATE UNKNOWN'} · ${checkpoint.phase}`}
      time={snapshot.time}
      location={snapshot.location}
      showPanels={showPanels}
      onTogglePanels={() => setShowPanels((current) => !current)}
    />
    <p className="playable-loop-pressure">TEST PRESSURE · {checkpoint.active_visible_pressure}</p>
    {showPanels && <StatusPanels family={snapshot.family} resources={snapshot.resources} />}
    <section className="test-base-status" aria-label="테스트 거점 능력"><strong>TEST BASE</strong><span>{checkpoint.base_capabilities.flatMap((base) => base.capabilities).join(' · ')}</span></section>
    <section className="scene-copy" aria-label="현재 장면"><h2>현재 장면</h2><p>{checkpoint.current_scene.narrative}</p></section>
    <PresentationBlocks blocks={checkpoint.current_scene.presentation_blocks} />
    {stallMessage && <p className="test-session-notice" role="alert">{stallMessage}</p>}
    <ChoiceButtons choices={checkpoint.current_scene.choices} disabled={submitting} onSelect={(choice) => selectChoice(choice.id)} />
    <FreeActionForm onSubmit={submitFreeAction} disabled={submitting} />
    {submitting && <p className="free-action-help" role="status">AI 응답 중…</p>}
    <p className="free-action-help">자유행동은 서버의 AI GM이 제안하고 엔진이 검증·커밋합니다. 연결할 수 없으면 테스트 지원 입력 또는 숫자 선택지를 계속 사용할 수 있습니다.</p>
    <section className="turn-status" aria-label="현재 턴"><strong>현재 턴</strong><span>{checkpoint.committed_turn.number}</span></section>
    <GameLog entries={checkpoint.committed_turn.log} />
  </main>
}
