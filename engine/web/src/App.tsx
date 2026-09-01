import { CanonV2RuntimeBlock } from './components/CanonV2RuntimeBlock'
import { loadCanonV2Runtime } from './runtime/canonV2Runtime'

export default function App() {
  return <CanonV2RuntimeBlock block={loadCanonV2Runtime()} />
}
