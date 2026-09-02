import { StateConsole } from './components/StateConsole'
import { loadCanonV2Runtime } from './runtime/canonV2Runtime'

export default function App() {
  const runtime = loadCanonV2Runtime()

  return <StateConsole
    view={runtime.view}
    source="canon-v2-bundled"
    sourceWarning={runtime.warning}
    refreshing={false}
    onRefresh={() => undefined}
    showRefresh={false}
    playBridge={null}
    bgmControl={null}
  />
}
