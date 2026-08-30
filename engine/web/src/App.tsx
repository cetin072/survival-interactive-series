import { useEffect, useState } from 'react'
import { ChoiceButtons } from './components/ChoiceButtons'
import { FreeActionForm } from './components/FreeActionForm'
import { GameLog } from './components/GameLog'
import { SceneHeader } from './components/SceneHeader'
import { StatusPanels } from './components/StatusPanels'
import { demoScene, initialLog } from './data/demoScene'
import { choiceForKey, choiceLog, freeActionLog } from './input/action'
import type { Choice, LogEntry } from './types'

export default function App() {
  const [showPanels, setShowPanels] = useState(true)
  const [log, setLog] = useState<LogEntry[]>(initialLog)
  const append = (entry: LogEntry) => setLog((entries) => [...entries, entry])
  const select = (choice: Choice) => append(choiceLog(choice, log.length))

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
      <SceneHeader day={demoScene.day} time={demoScene.time} location={demoScene.location} showPanels={showPanels} onTogglePanels={() => setShowPanels((visible) => !visible)} />
      <section className="narrative" aria-label="현재 장면"><p>{demoScene.narrative}</p></section>
      {showPanels && <StatusPanels family={demoScene.family} resources={demoScene.resources} />}
      <ChoiceButtons choices={demoScene.choices} onSelect={select} />
      <FreeActionForm onSubmit={(action) => append(freeActionLog(action, log.length))} />
      <GameLog entries={log} />
    </section>
  </main>
}
