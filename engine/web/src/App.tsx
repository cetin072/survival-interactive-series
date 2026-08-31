import { useCallback, useEffect, useState } from 'react'
import { PlayBridge } from './components/PlayBridge'
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
      <p className="console-kicker">생존기록 · WEB PLAY SHELL</p>
      <h1>현재 세계 상태를 불러오는 중…</h1>
      <p className="loading-copy">GitHub checkpoint와 가족 Canon을 동기화하고 있습니다.</p>
    </main>
  }

  return <StateConsole
    view={compileStateConsole(loaded.runtime, loaded.characters, runtimeCanon)}
    source={loaded.source}
    sourceWarning={loaded.warning}
    refreshing={refreshing}
    onRefresh={() => { void refresh() }}
    playBridge={<PlayBridge />}
  />
}
