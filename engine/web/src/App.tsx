import { useEffect, useState } from 'react'
import { ChoiceButtons } from './components/ChoiceButtons'
import { FreeActionForm } from './components/FreeActionForm'
import { GameLog } from './components/GameLog'
import { PresentationBlocks } from './components/PresentationBlocks'
import { SceneHeader } from './components/SceneHeader'
import { StatusPanels } from './components/StatusPanels'
import { demoScene, initialLog } from './data/demoScene'
import { choiceForKey, choiceLog, freeActionLog } from './input/action'
import { applyDemoChoice } from './state/demoTransition'
import { demoLiveState } from './state/demoLiveState'
import { createGameSnapshot } from './state/snapshot'
import type { Choice, LogEntry } from './types'

export default function App() {
  const [showPanels, setShowPanels] = useState(true)
  const [log, setLog] = useState<LogEntry[]>(initialLog)
  const [liveState, setLiveState] = useState(demoLiveState)
  const snapshot = createGameSnapshot(liveState)
  const append = (entry: LogEntry) => setLog((entries) => [...entries, entry])
  const select = (choice: Choice) => {
    setLiveState((state) => applyDemoChoice(state, choice.id))
    append(choiceLog(choice, log.length))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const choice = choiceForKey(event.key, demoScene.choices)
      if (choice) select(choice)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return <main className="app-shell">
    <section className="game-shell">
      <SceneHeader day={snapshot.day} time={snapshot.time} location={snapshot.location} showPanels={showPanels} onTogglePanels={() => setShowPanels((visible) => !visible)} />
      <section className="narrative" aria-label="현재 장면"><p>{demoScene.narrative}</p></section>
      {showPanels && <StatusPanels family={snapshot.family} resources={snapshot.resources} />}
      {showPanels && <PresentationBlocks blocks={demoScene.presentationBlocks} />}
      <ChoiceButtons choices={demoScene.choices} onSelect={select} />
      <FreeActionForm onSubmit={(action) => append(freeActionLog(action, log.length))} />
      <GameLog entries={log} />
    </section>
  </main>
}
