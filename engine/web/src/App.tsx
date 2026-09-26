import { PlayableTurnLoop } from './components/PlayableTurnLoop'
import { StateConsole } from './components/StateConsole'
import { loadCanonV2Runtime } from './runtime/canonV2Runtime'

export default function App() {
  const runtime = loadCanonV2Runtime()

  return <div className="app-shell">
    <PlayableTurnLoop />
    <details className="canon-console-details">
      <summary>Canon v2 공개 baseline 보기 (개발용 상태판)</summary>
      <StateConsole
        view={runtime.view}
        source="canon-v2-bundled"
        sourceWarning={runtime.warning}
        refreshing={false}
        onRefresh={() => undefined}
        showRefresh={false}
        playBridge={null}
        bgmControl={null}
        embedded
      />
    </details>
  </div>
}
