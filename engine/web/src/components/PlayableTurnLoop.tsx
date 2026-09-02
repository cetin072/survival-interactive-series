import { useEffect, useMemo, useState } from 'react'
import { choiceForKey } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { GMPlayerInput } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import { WEB_MVP_TEST_SESSION_CHECKPOINT_ID, WEB_MVP_TEST_SESSION_STORAGE_KEY, createWebMvpTestSession, resetWebMvpTestSession } from '../runtime/webMvpTestSession'
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

  function applyCheckpoint(current: PublicRuntimeCheckpoint, next: PublicRuntimeCheckpoint) {
    setCheckpoint(next)
    if (next.committed_turn.number > current.committed_turn.number) {
      setStallMessage(null)
      return
    }
    setStallMessage('AI GM이 이번 턴을 완료하지 못했습니다. 상태는 바뀌지 않았습니다. 같은 행동을 다시 시도해 주세요.')
  }

  function reset() {
    window.localStorage.removeItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
    setStallMessage(null)
    setCheckpoint(resetWebMvpTestSession())
  }

  async function submitPlayerTurn(input: GMPlayerInput) {
    if (submitting) return
    setSubmitting(true)
    const current = checkpoint
    try {
      const next = await runGMProviderTurn(current, input, provider)
      applyCheckpoint(current, next)
    } finally {
      setSubmitting(false)
    }
  }

  function selectChoice(choiceId: number) {
    void submitPlayerTurn({ kind: 'numbered-choice', choice_id: choiceId })
  }

  async function submitFreeAction(text: string) {
    await submitPlayerTurn({ kind: 'free-action', text })
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
    <p className="test-session-notice">이 테스트 세션은 실제 S02 Canon을 수정하지 않습니다. 이야기 진행은 AI GM이 제안하고 엔진이 공개 상태 변화만 검증·확정합니다.</p>
    <SceneHeader
      day={`${checkpoint.date ?? 'DATE UNKNOWN'} · ${checkpoint.phase}`}
      time={snapshot.time}
      location={snapshot.location}
      showPanels={showPanels}
      onTogglePanels={() => setShowPanels((current) => !current)}
    />
    <p className="playable-loop-pressure">PRESSURE · {checkpoint.active_visible_pressure}</p>
    {showPanels && <StatusPanels family={snapshot.family} resources={snapshot.resources} />}
    <section className="test-base-status" aria-label="테스트 거점 능력"><strong>BASE</strong><span>{checkpoint.base_capabilities.flatMap((base) => base.capabilities).join(' · ')}</span></section>
    <section className="scene-copy" aria-label="현재 장면"><h2>현재 장면</h2><p>{checkpoint.current_scene.narrative}</p></section>
    <PresentationBlocks blocks={checkpoint.current_scene.presentation_blocks} />
    {stallMessage && <p className="test-session-notice" role="alert">{stallMessage}</p>}
    <ChoiceButtons choices={checkpoint.current_scene.choices} disabled={submitting} onSelect={(choice) => selectChoice(choice.id)} />
    <FreeActionForm onSubmit={submitFreeAction} disabled={submitting} />
    {submitting && <p className="free-action-help" role="status">AI GM이 다음 장면을 작성 중…</p>}
    <p className="free-action-help">숫자 선택과 자유행동 모두 AI GM이 현재 장면과 최근 진행을 읽고 다음 이야기를 제안합니다. 상태 변화는 엔진 검증을 통과한 것만 반영됩니다.</p>
    <section className="turn-status" aria-label="현재 턴"><strong>현재 턴</strong><span>{checkpoint.committed_turn.number}</span></section>
    <GameLog entries={checkpoint.committed_turn.log} />
  </main>
}
