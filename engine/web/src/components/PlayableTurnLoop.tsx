import { useEffect, useState } from 'react'
import { choiceForKey } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { WEB_MVP_TEST_SESSION_STORAGE_KEY, commitWebMvpChoice, createWebMvpTestSession, resetWebMvpTestSession, submitWebMvpFreeAction } from '../runtime/webMvpTestSession'
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
  const snapshot = createGameSnapshot(checkpoint.public_state)

  useEffect(() => {
    window.localStorage.setItem(WEB_MVP_TEST_SESSION_STORAGE_KEY, JSON.stringify(checkpoint))
  }, [checkpoint])

  function reset() {
    window.localStorage.removeItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
    setCheckpoint(resetWebMvpTestSession())
  }

  function selectChoice(choiceId: number) {
    setCheckpoint((current) => commitWebMvpChoice(current, choiceId))
  }

  function submitFreeAction(text: string) {
    setCheckpoint((current) => submitWebMvpFreeAction(current, text))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const choice = choiceForKey(event.key, checkpoint.current_scene.choices)
      if (choice) selectChoice(choice.id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [checkpoint.current_scene.choices])

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
    <ChoiceButtons choices={checkpoint.current_scene.choices} onSelect={(choice) => selectChoice(choice.id)} />
    <FreeActionForm onSubmit={submitFreeAction} />
    <p className="free-action-help">테스트 지원 입력: “물 상태를 확인한다”, “통신 상태를 확인한다” (첫 장면). 그 외 입력은 안전하게 상태 변경 없이 기록됩니다.</p>
    <section className="turn-status" aria-label="현재 턴"><strong>현재 턴</strong><span>{checkpoint.committed_turn.number}</span></section>
    <GameLog entries={checkpoint.committed_turn.log} />
  </main>
}
