import { useEffect, useMemo, useState } from 'react'
import { choiceForKey } from '../input/action'
import { createGameSnapshot } from '../state/snapshot'
import type { PublicRuntimeCheckpoint } from '../runtime/publicRuntimeCheckpoint'
import { runGMProviderTurn } from '../runtime/gmTurnRuntime'
import { HttpGMProvider } from '../runtime/gmTransport'
import { createSyntheticPublicRuntimeFixture } from '../runtime/syntheticPublicRuntimeFixture'
import { ChoiceButtons } from './ChoiceButtons'
import { FreeActionForm } from './FreeActionForm'
import { GameLog } from './GameLog'
import { PresentationBlocks } from './PresentationBlocks'
import { SceneHeader } from './SceneHeader'
import { StatusPanels } from './StatusPanels'

export function PlayableTurnLoop() {
  const [checkpoint, setCheckpoint] = useState<PublicRuntimeCheckpoint>(createSyntheticPublicRuntimeFixture)
  const [showPanels, setShowPanels] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const provider = useMemo(() => new HttpGMProvider(), [])
  const snapshot = createGameSnapshot(checkpoint.public_state)

  async function submit(input: { kind: 'numbered-choice'; choice_id: number } | { kind: 'free-action'; text: string }) {
    if (submitting) return
    setSubmitting(true)
    try {
      setCheckpoint(await runGMProviderTurn(checkpoint, input, provider))
    } finally {
      setSubmitting(false)
    }
  }

  function selectChoice(choiceId: number) {
    void submit({ kind: 'numbered-choice', choice_id: choiceId })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const choice = choiceForKey(event.key, checkpoint.current_scene.choices)
      if (choice) selectChoice(choice.id)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [checkpoint])

  return <section className="playable-loop" aria-label="synthetic playable turn loop">
    <p className="playable-loop-kicker">SYNTHETIC CONTRACT FIXTURE · /api/gm MOCK TRANSPORT · NOT CANON S02</p>
    <SceneHeader
      day={`${checkpoint.date ?? 'DATE UNKNOWN'} · ${checkpoint.phase}`}
      time={snapshot.time}
      location={snapshot.location}
      showPanels={showPanels}
      onTogglePanels={() => setShowPanels((current) => !current)}
    />
    <p className="playable-loop-pressure">PRESSURE · {checkpoint.active_visible_pressure}</p>
    {showPanels && <StatusPanels family={snapshot.family} resources={snapshot.resources} />}
    <section className="scene-copy" aria-label="현재 장면"><p>{checkpoint.current_scene.narrative}</p></section>
    <PresentationBlocks blocks={checkpoint.current_scene.presentation_blocks} />
    <ChoiceButtons choices={checkpoint.current_scene.choices} onSelect={(choice) => selectChoice(choice.id)} />
    <FreeActionForm onSubmit={(text) => { void submit({ kind: 'free-action', text }) }} />
    <GameLog entries={checkpoint.committed_turn.log} />
  </section>
}
