import { useCallback, useEffect, useState } from 'react'
import { StateConsole } from './components/StateConsole'
import { loadRuntimeState } from './runtime/loadRuntimeState'
import { runtimeCanon } from './runtime/runtimeCanon'
import { compileStateConsole } from './runtime/stateCompiler'
import type { RuntimeLoadResult } from './runtime/loadRuntimeState'

export default function App() {
  const [loaded, setLoaded] = useState<RuntimeLoadResult | null>(null)
  const [refreshing, setRefreshing] = useState(true)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const next = await loadRuntimeState({ cacheToken: `${Date.now()}` })
    setLoaded(next)
    setRefreshing(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  if (!loaded) {
    return <main className="console-shell loading-shell" aria-live="polite">
      <p className="console-kicker">GM COPROCESSOR · READ ONLY</p>
      <h1>STATE CONSOLE</h1>
      <p>최신 checkpoint를 불러오는 중…</p>
    </main>
  }

  return <StateConsole
    view={compileStateConsole(loaded.runtime, loaded.characters, runtimeCanon)}
    source={loaded.source}
    sourceWarning={loaded.warning}
    refreshing={refreshing}
    onRefresh={() => { void refresh() }}
  />
}
