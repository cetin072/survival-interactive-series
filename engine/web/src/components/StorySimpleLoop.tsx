import { useMemo, useRef, useState, useEffect } from 'react'
import { choiceShortcutFromText } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { GMPlayerInput } from '../runtime/gmProvider'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import {
  STORY_BENCHMARK_CHECKPOINT_ID,
  STORY_BENCHMARK_SEASON_ID,
  STORY_BENCHMARK_STORAGE_KEY,
  createStorytellingBenchmarkSession,
  resetStorytellingBenchmarkSession,
} from '../runtime/storytellingBenchmarkSession'
import type { LogEntry } from '../types'
import '../story-simple-ui.css'

const UI_BUILD = 'STORY-MUD-20260903-B'
const UI_BUILD_KEY = 'survival-story-simple-ui-build'
const MAX_ORDERED_CHOICES = 2

type StoryBlock =
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'dialogue'; speaker: string; text: string }
  | { type: 'signal'; label?: string; lines: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'divider' }

function loadSession(): PublicRuntimeCheckpoint {
  if (typeof window === 'undefined') return createStorytellingBenchmarkSession()
  try {
    const previousBuild = window.localStorage.getItem(UI_BUILD_KEY)
    if (previousBuild !== UI_BUILD) {
      window.localStorage.removeItem(STORY_BENCHMARK_STORAGE_KEY)
      window.localStorage.setItem(UI_BUILD_KEY, UI_BUILD)
      return createStorytellingBenchmarkSession()
    }

    const raw = window.localStorage.getItem(STORY_BENCHMARK_STORAGE_KEY)
    if (!raw) return createStorytellingBenchmarkSession()
    const saved: unknown = JSON.parse(raw)
    if (typeof saved === 'object' && saved !== null
      && (saved as { contract_version?: unknown }).contract_version === 1
      && (saved as { checkpoint_id?: unknown }).checkpoint_id === STORY_BENCHMARK_CHECKPOINT_ID
      && (saved as { season_id?: unknown }).season_id === STORY_BENCHMARK_SEASON_ID) {
      return saved as PublicRuntimeCheckpoint
    }
  } catch {
    // Invalid local benchmark state starts cleanly.
  }
  return createStorytellingBenchmarkSession()
}

function visibleStoryEntries(checkpoint: PublicRuntimeCheckpoint): LogEntry[] {
  const entries = checkpoint.committed_turn.log.filter((entry) =>
    (entry.kind === 'scene' && !entry.text.startsWith('STORYTELLING BENCHMARK S01 시작'))
    || entry.kind === 'choice'
    || entry.kind === 'free-action',
  )
  const currentAlreadyLogged = entries.some((entry) => entry.kind === 'scene' && entry.text === checkpoint.current_scene.narrative)
  if (currentAlreadyLogged) return entries
  return [...entries, { id: -1, kind: 'scene', text: checkpoint.current_scene.narrative }]
}

function stripInlineMarkup(text: string): string {
  return text.replace(/\*\*/g, '').replace(/__+/g, '').trim()
}

function parseStoryBlocks(text: string): StoryBlock[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: StoryBlock[] = []
  let paragraph: string[] = []

  const flushParagraph = () => {
    const value = stripInlineMarkup(paragraph.join(' ').replace(/\s+/g, ' '))
    if (value) blocks.push({ type: 'paragraph', text: value })
    paragraph = []
  }

  let index = 0
  while (index < lines.length) {
    const raw = lines[index] ?? ''
    const line = raw.trim()

    if (!line) {
      flushParagraph()
      index += 1
      continue
    }

    if (line === '---') {
      flushParagraph()
      blocks.push({ type: 'divider' })
      index += 1
      continue
    }

    if (line.startsWith('### ')) {
      flushParagraph()
      blocks.push({ type: 'subheading', text: stripInlineMarkup(line.slice(4)) })
      index += 1
      continue
    }

    if (line.startsWith('## ')) {
      flushParagraph()
      blocks.push({ type: 'heading', text: stripInlineMarkup(line.slice(3)) })
      index += 1
      continue
    }

    if (line.startsWith('>')) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quoteLines.push(stripInlineMarkup((lines[index] ?? '').trim().replace(/^>\s?/, '')))
        index += 1
      }
      const first = quoteLines[0] ?? ''
      const labelMatch = first.match(/^\[([^\]]+)\]$/)
      blocks.push({
        type: 'signal',
        label: labelMatch?.[1],
        lines: labelMatch ? quoteLines.slice(1) : quoteLines,
      })
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('- ')) {
        items.push(stripInlineMarkup((lines[index] ?? '').trim().slice(2)))
        index += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }

    const dialogue = stripInlineMarkup(line).match(/^([^:：]{1,28})[:：]\s*(.+)$/)
    if (dialogue && /[“”"']/u.test(dialogue[2])) {
      flushParagraph()
      blocks.push({ type: 'dialogue', speaker: dialogue[1].trim(), text: dialogue[2].trim() })
      index += 1
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks
}

function StoryNarrative({ text }: { text: string }) {
  const blocks = parseStoryBlocks(text)
  return <div className="story-mud-blocks">
    {blocks.map((block, index) => {
      const key = `${index}-${block.type}`
      if (block.type === 'heading') return <h2 className="story-mud-heading" key={key}>{block.text}</h2>
      if (block.type === 'subheading') return <h3 className="story-mud-subheading" key={key}>{block.text}</h3>
      if (block.type === 'dialogue') return <div className="story-mud-dialogue" key={key}><strong>{block.speaker}</strong><p>{block.text}</p></div>
      if (block.type === 'signal') return <aside className="story-mud-signal" key={key}>{block.label && <strong>[{block.label}]</strong>}{block.lines.map((line, lineIndex) => <p key={`${key}-${lineIndex}`}>{line}</p>)}</aside>
      if (block.type === 'list') return <ul className="story-mud-list" key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</ul>
      if (block.type === 'divider') return <hr className="story-mud-divider" key={key} />
      return <p className="story-mud-paragraph" key={key}>{block.text}</p>
    })}
  </div>
}

function pressureLabel(pressure: string): string {
  if (/심각|붕괴|치명/.test(pressure)) return '심각'
  if (/위험|공격|화재|폭발|산불/.test(pressure)) return '위험'
  if (/안정|평온/.test(pressure)) return '안정'
  return '주의'
}

export function StorySimpleLoop() {
  const [checkpoint, setCheckpoint] = useState<PublicRuntimeCheckpoint>(loadSession)
  const [selectedChoiceIds, setSelectedChoiceIds] = useState<number[]>([])
  const [freeText, setFreeText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  const latestSceneRef = useRef<HTMLElement | null>(null)
  const previousTurnRef = useRef(checkpoint.committed_turn.number)
  const provider = useMemo(() => new HttpGMProvider(), [])
  const snapshot = createGameSnapshot(checkpoint.public_state)
  const storyEntries = visibleStoryEntries(checkpoint)
  const lastSceneIndex = storyEntries.reduce((latest, entry, index) => entry.kind === 'scene' ? index : latest, -1)

  useEffect(() => {
    window.localStorage.setItem(STORY_BENCHMARK_STORAGE_KEY, JSON.stringify(checkpoint))
  }, [checkpoint])

  useEffect(() => {
    if (checkpoint.committed_turn.number > previousTurnRef.current) {
      window.requestAnimationFrame(() => {
        const container = scrollRef.current
        const target = latestSceneRef.current
        if (container && target) container.scrollTo({ top: Math.max(0, target.offsetTop - 14), behavior: 'smooth' })
      })
    }
    previousTurnRef.current = checkpoint.committed_turn.number
  }, [checkpoint.committed_turn.number])

  function reset() {
    window.localStorage.removeItem(STORY_BENCHMARK_STORAGE_KEY)
    setCheckpoint(resetStorytellingBenchmarkSession())
    setSelectedChoiceIds([])
    setFreeText('')
    setMessage(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  async function submitTurn(input: GMPlayerInput) {
    if (submitting) return
    setSubmitting(true)
    setMessage(null)
    const current = checkpoint
    try {
      const next = await runGMProviderTurn(current, input, provider)
      setCheckpoint(next)
      if (next.committed_turn.number > current.committed_turn.number) {
        setSelectedChoiceIds([])
        setFreeText('')
      } else {
        setMessage('AI GM이 이번 턴을 완료하지 못했습니다. 같은 행동을 다시 시도할 수 있습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function toggleChoice(choiceId: number) {
    if (submitting) return
    setSelectedChoiceIds((current) => {
      if (current.includes(choiceId)) return current.filter((id) => id !== choiceId)
      if (current.length >= MAX_ORDERED_CHOICES) {
        setMessage('한 턴에는 최대 2개까지 순서대로 선택할 수 있습니다.')
        return current
      }
      setMessage(null)
      return [...current, choiceId]
    })
  }

  function executeChoices() {
    if (selectedChoiceIds.length === 0 || submitting) return
    if (selectedChoiceIds.length === 1) {
      void submitTurn({ kind: 'numbered-choice', choice_id: selectedChoiceIds[0] })
      return
    }
    void submitTurn({ kind: 'ordered-choices', choice_ids: selectedChoiceIds })
  }

  async function submitFreeAction(event: React.FormEvent) {
    event.preventDefault()
    const text = freeText.trim()
    if (!text || submitting) return

    const shortcut = choiceShortcutFromText(text, checkpoint.current_scene.choices, MAX_ORDERED_CHOICES)
    if (shortcut?.kind === 'invalid') {
      setMessage(shortcut.message)
      return
    }
    if (shortcut?.kind === 'choices') {
      if (shortcut.choiceIds.length === 1) await submitTurn({ kind: 'numbered-choice', choice_id: shortcut.choiceIds[0] })
      else await submitTurn({ kind: 'ordered-choices', choice_ids: shortcut.choiceIds })
      return
    }
    await submitTurn({ kind: 'free-action', text })
  }

  return <main className="story-simple-shell" aria-label="생존일기 스토리텔링 벤치마크">
    <header className="story-simple-header">
      <div className="story-simple-now">
        <strong>{snapshot.day}</strong>
        <span>{snapshot.time}</span>
        <span>🏠 {snapshot.location}</span>
        <span className="story-simple-risk">⚠ {pressureLabel(checkpoint.active_visible_pressure)}</span>
      </div>
      <button type="button" onClick={reset} aria-label="처음부터 다시 시작">↻</button>
    </header>

    <section className="story-simple-scroll" ref={scrollRef}>
      <div className="story-simple-column">
        {storyEntries.map((entry, index) => entry.kind === 'scene'
          ? <article className="story-simple-scene" ref={index === lastSceneIndex ? latestSceneRef : undefined} key={`scene-${entry.id}-${index}`}>
              <StoryNarrative text={entry.text} />
            </article>
          : <div className="story-simple-player-log" key={`log-${entry.id}-${index}`}>
              <span>{entry.kind === 'free-action' ? '직접 행동' : '내 선택'}</span>
              <strong>{entry.text.replace(/^선택\s*\d+\.\s*/, '').replace(/^자유행동:\s*/, '')}</strong>
            </div>)}

        <section className="story-simple-actions" aria-label="행동 선택">
          <div className="story-simple-actions-title">
            <span>TURN {checkpoint.committed_turn.number}</span>
            <h2>어떻게 할까?</h2>
          </div>

          <div className="story-simple-choice-list">
            {checkpoint.current_scene.choices.slice(0, 4).map((choice) => {
              const order = selectedChoiceIds.indexOf(choice.id)
              return <button
                type="button"
                key={choice.id}
                className={order >= 0 ? 'selected' : ''}
                aria-pressed={order >= 0}
                onClick={() => toggleChoice(choice.id)}
                disabled={submitting}
              >
                <span className="story-simple-choice-number">{choice.id}</span>
                <strong>{choice.label}</strong>
                {order >= 0 && <span className="story-simple-choice-order">{order + 1}순위</span>}
              </button>
            })}
          </div>

          <button type="button" className="story-simple-execute" onClick={executeChoices} disabled={selectedChoiceIds.length === 0 || submitting}>
            {selectedChoiceIds.length > 0 ? `선택 실행 · ${selectedChoiceIds.length}개` : '선택지를 고르세요'}
          </button>

          <form className="story-simple-free" onSubmit={submitFreeAction}>
            <input value={freeText} onChange={(event) => setFreeText(event.target.value)} disabled={submitting} placeholder="직접 행동하기…" aria-label="자유행동" />
            <button type="submit" disabled={submitting || freeText.trim().length === 0}>전송</button>
          </form>

          {submitting && <p className="story-simple-writing" role="status">AI GM이 다음 장면을 쓰고 있습니다…</p>}
          {message && <p className="story-simple-alert" role="alert">{message}</p>}
        </section>
      </div>
    </section>
  </main>
}
