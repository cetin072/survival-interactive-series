import { useEffect, useMemo, useState } from 'react'
import { choiceForKey } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { GMPlayerInput } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import { WEB_MVP_TEST_SESSION_CHECKPOINT_ID, WEB_MVP_TEST_SESSION_STORAGE_KEY, createWebMvpTestSession, resetWebMvpTestSession } from '../runtime/webMvpTestSession'
import type { Choice } from '../types'
import { BgmControl } from './BgmControl'
import { ChoiceButtons } from './ChoiceButtons'
import { FreeActionForm } from './FreeActionForm'
import { GameLog } from './GameLog'
import { PresentationBlocks } from './PresentationBlocks'
import { SceneHeader } from './SceneHeader'
import { StatusPanels } from './StatusPanels'

const WEB_MVP_UI_BUILD = 'AI-STORY-GM-20260902-B'
const WEB_MVP_UI_BUILD_KEY = 'survival-web-mvp-ui-build'
const TEXT_SIZE_KEY = 'survival-web-mvp-text-size'
const MAX_ORDERED_CHOICES = 2

type TextSize = 'small' | 'normal' | 'large'

type NarrativeGroup = {
  sentences: string[]
}

function loadTextSize(): TextSize {
  if (typeof window === 'undefined') return 'normal'
  const saved = window.localStorage.getItem(TEXT_SIZE_KEY)
  return saved === 'small' || saved === 'large' ? saved : 'normal'
}

function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?。！？]+[.!?。！？]+(?:[\"”’']+)?|[^.!?。！？]+$/g)
  return (matches ?? [text]).map((sentence) => sentence.trim()).filter(Boolean)
}

function buildNarrativeGroups(narrative: string): NarrativeGroup[] {
  const explicitParagraphs = narrative
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)

  const paragraphs = explicitParagraphs.length > 0 ? explicitParagraphs : [narrative.trim()]
  const groups: NarrativeGroup[] = []

  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph)
    if (explicitParagraphs.length > 1 || sentences.length <= 2) {
      groups.push({ sentences })
      continue
    }

    for (let index = 0; index < sentences.length; index += 2) {
      groups.push({ sentences: sentences.slice(index, index + 2) })
    }
  }

  return groups.filter((group) => group.sentences.length > 0)
}

function loadSession(): PublicRuntimeCheckpoint {
  if (typeof window === 'undefined') return createWebMvpTestSession()
  try {
    const previousBuild = window.localStorage.getItem(WEB_MVP_UI_BUILD_KEY)
    if (previousBuild !== WEB_MVP_UI_BUILD) {
      window.localStorage.removeItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
      window.localStorage.setItem(WEB_MVP_UI_BUILD_KEY, WEB_MVP_UI_BUILD)
      return createWebMvpTestSession()
    }

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

function summarizeTurnChanges(current: PublicRuntimeCheckpoint, next: PublicRuntimeCheckpoint): string[] {
  const before = current.public_state
  const after = next.public_state
  const changes: string[] = []

  if (before.clock.date !== after.clock.date || before.clock.time !== after.clock.time) {
    changes.push(`시간: ${before.clock.date ?? ''} ${before.clock.time} → ${after.clock.date ?? ''} ${after.clock.time}`.trim())
  }

  for (const [id, member] of Object.entries(after.party)) {
    const previous = before.party[id as keyof typeof before.party]
    if (!previous) continue
    if (previous.location !== member.location) changes.push(`${member.name} 위치: ${previous.location} → ${member.location}`)
    if (previous.status !== member.status) changes.push(`${member.name} 상태: ${previous.status} → ${member.status}`)
  }

  for (const [id, resource] of Object.entries(after.resources)) {
    const previous = before.resources[id]
    if (previous && previous.band !== resource.band) changes.push(`${resource.name}: ${previous.band} → ${resource.band}`)
  }

  for (const [id, base] of Object.entries(after.bases)) {
    const previous = before.bases[id]
    if (!previous) continue
    const added = base.capabilities.filter((capability) => !previous.capabilities.includes(capability))
    for (const capability of added) changes.push(`${base.name}: ${capability} 확보`)
  }

  return changes.slice(0, 4)
}

export function PlayableTurnLoop() {
  const [checkpoint, setCheckpoint] = useState<PublicRuntimeCheckpoint>(loadSession)
  const [showPanels, setShowPanels] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [stallMessage, setStallMessage] = useState<string | null>(null)
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<number[]>([])
  const [choiceQueueNotice, setChoiceQueueNotice] = useState<string | null>(null)
  const [turnChanges, setTurnChanges] = useState<string[]>([])
  const [textSize, setTextSize] = useState<TextSize>(loadTextSize)
  const provider = useMemo(() => new HttpGMProvider(), [])
  const snapshot = createGameSnapshot(checkpoint.public_state)
  const narrativeGroups = buildNarrativeGroups(checkpoint.current_scene.narrative)

  useEffect(() => {
    window.localStorage.setItem(WEB_MVP_TEST_SESSION_STORAGE_KEY, JSON.stringify(checkpoint))
  }, [checkpoint])

  useEffect(() => {
    window.localStorage.setItem(TEXT_SIZE_KEY, textSize)
  }, [textSize])

  function applyCheckpoint(current: PublicRuntimeCheckpoint, next: PublicRuntimeCheckpoint) {
    setCheckpoint(next)
    if (next.committed_turn.number > current.committed_turn.number) {
      setStallMessage(null)
      setSelectedChoiceIds([])
      setChoiceQueueNotice(null)
      setTurnChanges(summarizeTurnChanges(current, next))
      return
    }
    setTurnChanges([])
    setStallMessage('AI GM이 이번 턴을 완료하지 못했습니다. 상태는 바뀌지 않았습니다. 같은 행동을 다시 시도해 주세요.')
  }

  function reset() {
    window.localStorage.removeItem(WEB_MVP_TEST_SESSION_STORAGE_KEY)
    setStallMessage(null)
    setSelectedChoiceIds([])
    setChoiceQueueNotice(null)
    setTurnChanges([])
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

  function toggleChoice(choice: Choice) {
    setSelectedChoiceIds((current) => {
      if (current.includes(choice.id)) {
        setChoiceQueueNotice(null)
        return current.filter((id) => id !== choice.id)
      }
      if (current.length >= MAX_ORDERED_CHOICES) {
        setChoiceQueueNotice(`한 턴에는 최대 ${MAX_ORDERED_CHOICES}개까지 선택할 수 있습니다.`)
        return current
      }
      setChoiceQueueNotice(null)
      return [...current, choice.id]
    })
  }

  function confirmChoiceQueue() {
    if (selectedChoiceIds.length === 0 || submitting) return
    if (selectedChoiceIds.length === 1) {
      void submitPlayerTurn({ kind: 'numbered-choice', choice_id: selectedChoiceIds[0] })
      return
    }
    void submitPlayerTurn({ kind: 'ordered-choices', choice_ids: selectedChoiceIds })
  }

  async function submitFreeAction(text: string) {
    setSelectedChoiceIds([])
    setChoiceQueueNotice(null)
    await submitPlayerTurn({ kind: 'free-action', text })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (submitting || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Enter' && selectedChoiceIds.length > 0) {
        event.preventDefault()
        confirmChoiceQueue()
        return
      }
      const choice = choiceForKey(event.key, checkpoint.current_scene.choices)
      if (choice) toggleChoice(choice)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [checkpoint.current_scene.choices, selectedChoiceIds, submitting])

  const selectedLabels = selectedChoiceIds.flatMap((id) => {
    const choice = checkpoint.current_scene.choices.find((item) => item.id === id)
    return choice ? [choice.label] : []
  })

  return <main className={`playable-loop text-size-${textSize}`} aria-label="WEB MVP TEST SESSION">
    <header className="test-session-header">
      <div><p>생존일기</p><h1>WEB MVP TEST SESSION</h1><span>NON-CANONICAL · TEST ONLY · {WEB_MVP_UI_BUILD}</span></div>
      <div className="test-session-controls">
        <div className="text-size-control" aria-label="본문 글자 크기">
          <button type="button" aria-pressed={textSize === 'small'} onClick={() => setTextSize('small')}>글-</button>
          <button type="button" aria-pressed={textSize === 'normal'} onClick={() => setTextSize('normal')}>기본</button>
          <button type="button" aria-pressed={textSize === 'large'} onClick={() => setTextSize('large')}>글+</button>
        </div>
        <BgmControl />
        <button type="button" onClick={reset}>RESET</button>
      </div>
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
    <section className="scene-copy" aria-label="현재 장면">
      <h2>현재 장면</h2>
      <div className="scene-narrative">
        {narrativeGroups.map((group, groupIndex) => <div className="story-paragraph" key={`${checkpoint.current_scene.id}-${groupIndex}`}>
          {group.sentences.map((sentence, sentenceIndex) => <span className="scene-sentence" key={`${groupIndex}-${sentenceIndex}`}>{sentence}</span>)}
        </div>)}
      </div>
    </section>
    <PresentationBlocks blocks={checkpoint.current_scene.presentation_blocks} />
    {turnChanges.length > 0 && <section className="turn-changes" aria-label="이번 턴 변화">
      <h2>이번 턴 변화</h2>
      <ul>{turnChanges.map((change) => <li key={change}>{change}</li>)}</ul>
    </section>}
    {stallMessage && <p className="test-session-notice" role="alert">{stallMessage}</p>}
    <ChoiceButtons choices={checkpoint.current_scene.choices} selectedChoiceIds={selectedChoiceIds} maxSelections={MAX_ORDERED_CHOICES} disabled={submitting} onToggle={toggleChoice} />
    <section className="choice-queue" aria-label="선택 실행 순서">
      <div>
        <strong>실행 순서 · 최대 {MAX_ORDERED_CHOICES}개</strong>
        <span>{selectedLabels.length > 0 ? selectedLabels.map((label, index) => `${index + 1}. ${label}`).join(' → ') : '카드를 순서대로 선택하세요.'}</span>
        {choiceQueueNotice && <em className="choice-queue-notice">{choiceQueueNotice}</em>}
      </div>
      <div className="choice-queue-actions">
        <button type="button" disabled={selectedChoiceIds.length === 0 || submitting} onClick={() => { setSelectedChoiceIds([]); setChoiceQueueNotice(null) }}>전체 취소</button>
        <button type="button" className="choice-confirm" disabled={selectedChoiceIds.length === 0 || submitting} onClick={confirmChoiceQueue}>
          {selectedChoiceIds.length > 0 ? `선택 종료 · ${selectedChoiceIds.length}개 실행` : '선택 종료'}
        </button>
      </div>
    </section>
    <FreeActionForm onSubmit={submitFreeAction} disabled={submitting} />
    {submitting && <p className="free-action-help" role="status">AI GM이 다음 장면을 작성 중…</p>}
    <p className="free-action-help">선택지는 최대 2개까지 묶을 수 있고, 터치한 순서대로 AI GM에게 전달됩니다. 자유행동도 계속 사용할 수 있습니다.</p>
    <section className="turn-status" aria-label="현재 턴"><strong>현재 턴</strong><span>{checkpoint.committed_turn.number}</span></section>
    <GameLog entries={checkpoint.committed_turn.log} />
  </main>
}
