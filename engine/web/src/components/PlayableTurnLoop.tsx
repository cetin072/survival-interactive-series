import { useEffect, useMemo, useRef, useState } from 'react'
import { choiceForKey, choiceShortcutFromText } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { GMPlayerInput } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import { WEB_MVP_TEST_SESSION_CHECKPOINT_ID, WEB_MVP_TEST_SESSION_STORAGE_KEY, createWebMvpTestSession, resetWebMvpTestSession } from '../runtime/webMvpTestSession'
import type { Choice, LogEntry } from '../types'
import { BgmControl } from './BgmControl'
import { ChoiceButtons } from './ChoiceButtons'
import { FreeActionForm } from './FreeActionForm'
import { PresentationBlocks } from './PresentationBlocks'

const WEB_MVP_UI_BUILD = 'AI-STORY-GM-20260903-C'
const WEB_MVP_UI_BUILD_KEY = 'survival-web-mvp-ui-build'
const TEXT_SIZE_KEY = 'survival-web-mvp-text-size'
const MAX_ORDERED_CHOICES = 2

type TextSize = 'small' | 'normal' | 'large'
type HudPanel = 'family' | 'base' | 'vehicle' | 'resource' | 'settings' | null

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

function pressureLabel(pressure: string): string {
  if (/심각|붕괴|치명/.test(pressure)) return '심각'
  if (/위험|공격|화재|폭발/.test(pressure)) return '위험'
  if (/안정|평온/.test(pressure)) return '안정'
  return '주의'
}

function visibleStoryEntries(checkpoint: PublicRuntimeCheckpoint): LogEntry[] {
  const entries = checkpoint.committed_turn.log.filter((entry) =>
    (entry.kind === 'scene' && !entry.text.startsWith('TURN 0 ·'))
    || entry.kind === 'choice'
    || entry.kind === 'free-action',
  )

  const currentAlreadyLogged = entries.some((entry) => entry.kind === 'scene' && entry.text === checkpoint.current_scene.narrative)
  if (currentAlreadyLogged) return entries
  return [...entries, { id: -1, kind: 'scene', text: checkpoint.current_scene.narrative }]
}

function StoryScene({ text, latestRef }: { text: string; latestRef?: React.RefObject<HTMLElement | null> }) {
  const groups = buildNarrativeGroups(text)
  return <article className="story-turn" ref={latestRef}>
    {groups.map((group, groupIndex) => <div className="story-paragraph" key={`${groupIndex}-${group.sentences[0] ?? ''}`}>
      {group.sentences.map((sentence, sentenceIndex) => <span className="scene-sentence" key={`${groupIndex}-${sentenceIndex}`}>{sentence}</span>)}
    </div>)}
  </article>
}

export function PlayableTurnLoop() {
  const [checkpoint, setCheckpoint] = useState<PublicRuntimeCheckpoint>(loadSession)
  const [submitting, setSubmitting] = useState(false)
  const [stallMessage, setStallMessage] = useState<string | null>(null)
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<number[]>([])
  const [choiceQueueNotice, setChoiceQueueNotice] = useState<string | null>(null)
  const [turnChanges, setTurnChanges] = useState<string[]>([])
  const [textSize, setTextSize] = useState<TextSize>(loadTextSize)
  const [hudPanel, setHudPanel] = useState<HudPanel>(null)
  const latestSceneRef = useRef<HTMLElement | null>(null)
  const previousTurnRef = useRef(checkpoint.committed_turn.number)
  const provider = useMemo(() => new HttpGMProvider(), [])
  const snapshot = createGameSnapshot(checkpoint.public_state)
  const storyEntries = visibleStoryEntries(checkpoint)
  const lastSceneIndex = storyEntries.reduce((latest, entry, index) => entry.kind === 'scene' ? index : latest, -1)
  const familyCount = Object.keys(checkpoint.public_state.party).length
  const bases = Object.values(checkpoint.public_state.bases)
  const vehicles = Object.values(checkpoint.public_state.vehicles)
  const resources = Object.values(checkpoint.public_state.resources)
  const water = resources.find((resource) => resource.name.includes('물'))

  useEffect(() => {
    window.localStorage.setItem(WEB_MVP_TEST_SESSION_STORAGE_KEY, JSON.stringify(checkpoint))
  }, [checkpoint])

  useEffect(() => {
    window.localStorage.setItem(TEXT_SIZE_KEY, textSize)
  }, [textSize])

  useEffect(() => {
    if (checkpoint.committed_turn.number > previousTurnRef.current) {
      window.requestAnimationFrame(() => {
        latestSceneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
    previousTurnRef.current = checkpoint.committed_turn.number
  }, [checkpoint.committed_turn.number])

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
    setHudPanel(null)
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

    const shortcut = choiceShortcutFromText(text, checkpoint.current_scene.choices, MAX_ORDERED_CHOICES)
    if (shortcut?.kind === 'invalid') {
      setStallMessage(shortcut.message)
      return
    }
    if (shortcut?.kind === 'choices') {
      setStallMessage(null)
      if (shortcut.choiceIds.length === 1) {
        await submitPlayerTurn({ kind: 'numbered-choice', choice_id: shortcut.choiceIds[0] })
      } else {
        await submitPlayerTurn({ kind: 'ordered-choices', choice_ids: shortcut.choiceIds })
      }
      return
    }

    await submitPlayerTurn({ kind: 'free-action', text })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (submitting || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape' && hudPanel) {
        setHudPanel(null)
        return
      }
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
  }, [checkpoint.current_scene.choices, selectedChoiceIds, submitting, hudPanel])

  const selectedLabels = selectedChoiceIds.flatMap((id) => {
    const choice = checkpoint.current_scene.choices.find((item) => item.id === id)
    return choice ? [choice.label] : []
  })

  return <main className={`playable-loop survival-shell text-size-${textSize}`} aria-label="WEB MVP TEST SESSION">
    <header className="survival-top-hud">
      <div className="survival-now">
        <strong>{snapshot.day}</strong>
        <span>{snapshot.time}</span>
        <span className="survival-location">🏠 {snapshot.location}</span>
        <span className="survival-risk">⚠ {pressureLabel(checkpoint.active_visible_pressure)}</span>
      </div>
      <button type="button" className="survival-settings-button" aria-label="설정" onClick={() => setHudPanel(hudPanel === 'settings' ? null : 'settings')}>⚙</button>
    </header>

    <section className="story-scroll" aria-label="생존일기 이야기">
      <div className="story-column">
        {storyEntries.map((entry, index) => entry.kind === 'scene'
          ? <StoryScene key={`scene-${entry.id}-${index}`} text={entry.text} latestRef={index === lastSceneIndex ? latestSceneRef : undefined} />
          : <div className="story-choice-record" key={`choice-${entry.id}-${index}`}>
              <span>{entry.kind === 'free-action' ? '직접 행동' : '내 선택'}</span>
              <strong>{entry.text.replace(/^선택\s*\d+\.\s*/, '').replace(/^자유행동:\s*/, '')}</strong>
            </div>)}

        <PresentationBlocks blocks={checkpoint.current_scene.presentation_blocks} />

        {turnChanges.length > 0 && <section className="turn-changes" aria-label="이번 턴 변화">
          <h2>이번 턴 변화</h2>
          <ul>{turnChanges.map((change) => <li key={change}>{change}</li>)}</ul>
        </section>}

        {stallMessage && <p className="story-alert" role="alert">{stallMessage}</p>}

        <section className="inline-choice-phase" aria-label="현재 선택">
          <div className="inline-choice-heading">
            <span>TURN {checkpoint.committed_turn.number}</span>
            <h2>어떻게 할까?</h2>
            <p>카드를 최대 {MAX_ORDERED_CHOICES}개까지 터치한 순서대로 실행할 수 있습니다.</p>
          </div>

          <ChoiceButtons choices={checkpoint.current_scene.choices} selectedChoiceIds={selectedChoiceIds} maxSelections={MAX_ORDERED_CHOICES} disabled={submitting} onToggle={toggleChoice} />

          <div className="inline-free-action">
            <FreeActionForm onSubmit={submitFreeAction} disabled={submitting} />
          </div>

          <section className="choice-queue" aria-label="선택 실행 순서">
            <div>
              <strong>실행 순서</strong>
              <span>{selectedLabels.length > 0 ? selectedLabels.map((label, index) => `${index + 1}. ${label}`).join(' → ') : '카드를 선택하거나 직접 행동을 입력하세요.'}</span>
              {choiceQueueNotice && <em className="choice-queue-notice">{choiceQueueNotice}</em>}
            </div>
            <div className="choice-queue-actions">
              <button type="button" disabled={selectedChoiceIds.length === 0 || submitting} onClick={() => { setSelectedChoiceIds([]); setChoiceQueueNotice(null) }}>취소</button>
              <button type="button" className="choice-confirm" disabled={selectedChoiceIds.length === 0 || submitting} onClick={confirmChoiceQueue}>
                {selectedChoiceIds.length > 0 ? `선택 종료 · ${selectedChoiceIds.length}개 실행` : '선택 종료'}
              </button>
            </div>
          </section>

          {submitting && <p className="story-loading" role="status">AI GM이 선택 결과와 다음 이야기를 작성 중…</p>}
        </section>
      </div>
    </section>

    {hudPanel && <section className="hud-detail-sheet" aria-label="상세 상태">
      <div className="hud-detail-header">
        <strong>{hudPanel === 'family' ? '가족' : hudPanel === 'base' ? '거점' : hudPanel === 'vehicle' ? '차량' : hudPanel === 'resource' ? '물자' : '설정'}</strong>
        <button type="button" onClick={() => setHudPanel(null)}>닫기</button>
      </div>
      {hudPanel === 'family' && <div className="hud-detail-list">
        {Object.entries(checkpoint.public_state.party).map(([id, member]) => <div key={id}><strong>{member.name}</strong><span>{member.status}</span><small>{member.location}</small></div>)}
      </div>}
      {hudPanel === 'base' && <div className="hud-detail-list">
        {bases.map((base) => <div key={`${base.name}-${base.location}`}><strong>{base.name}</strong><span>{base.status}</span><small>{base.capabilities.length > 0 ? base.capabilities.join(' · ') : '확보 시설 없음'}</small></div>)}
      </div>}
      {hudPanel === 'vehicle' && <div className="hud-detail-list">
        {vehicles.length > 0 ? vehicles.map((vehicle) => <div key={`${vehicle.name}-${vehicle.location}`}><strong>{vehicle.name}</strong><span>{vehicle.status}</span><small>{vehicle.location}</small></div>) : <p className="hud-empty">현재 공개 상태에 등록된 차량이 없습니다.</p>}
      </div>}
      {hudPanel === 'resource' && <div className="hud-detail-list">
        {resources.map((resource) => <div key={resource.name}><strong>{resource.icon} {resource.name}</strong><span>{resource.band}</span></div>)}
      </div>}
      {hudPanel === 'settings' && <div className="hud-settings">
        <div className="text-size-control" aria-label="본문 글자 크기">
          <button type="button" aria-pressed={textSize === 'small'} onClick={() => setTextSize('small')}>글-</button>
          <button type="button" aria-pressed={textSize === 'normal'} onClick={() => setTextSize('normal')}>기본</button>
          <button type="button" aria-pressed={textSize === 'large'} onClick={() => setTextSize('large')}>글+</button>
        </div>
        <BgmControl />
        <button type="button" className="hud-reset" onClick={reset}>테스트 세션 RESET</button>
        <small>NON-CANONICAL · TEST ONLY · {WEB_MVP_UI_BUILD}</small>
      </div>}
    </section>}

    <nav className="survival-bottom-hud" aria-label="핵심 상태">
      <button type="button" aria-pressed={hudPanel === 'family'} onClick={() => setHudPanel(hudPanel === 'family' ? null : 'family')}><span>👨‍👩‍👦</span><strong>가족</strong><small>{familyCount}/{familyCount}</small></button>
      <button type="button" aria-pressed={hudPanel === 'base'} onClick={() => setHudPanel(hudPanel === 'base' ? null : 'base')}><span>🏠</span><strong>거점</strong><small>{bases[0]?.name ?? '없음'}</small></button>
      <button type="button" aria-pressed={hudPanel === 'vehicle'} onClick={() => setHudPanel(hudPanel === 'vehicle' ? null : 'vehicle')}><span>🚗</span><strong>차량</strong><small>{vehicles.length > 0 ? `${vehicles.length}대` : '없음'}</small></button>
      <button type="button" aria-pressed={hudPanel === 'resource'} onClick={() => setHudPanel(hudPanel === 'resource' ? null : 'resource')}><span>📦</span><strong>물자</strong><small>{water ? `물 ${water.band}` : `${resources.length}종`}</small></button>
    </nav>
  </main>
}
