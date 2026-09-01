import type { ReactNode } from 'react'
import type { CanonV2RuntimeBlock } from '../runtime/canonV2Runtime'

export function CanonV2RuntimeBlock({ block, children }: { block: CanonV2RuntimeBlock; children?: ReactNode }) {
  return <main className="console-shell runtime-block" aria-live="polite">
    <p className="console-kicker">생존일기 · CANON V2 RUNTIME</p>
    <h1>공개 플레이 checkpoint를 기다리는 중입니다.</h1>
    <p className="runtime-block-copy">{block.message}</p>
    <section className="runtime-block-panel" aria-label="필요한 공개 런타임 계약">
      <p className="runtime-block-code">{block.code} · {block.seasonId}</p>
      <h2>필요한 최소 공개 계약</h2>
      <ul>
        {block.missingContract.map((field) => <li key={field}>{field}</li>)}
      </ul>
    </section>
    <p className="runtime-block-help">Legacy 상태와 Raw Transcript는 대체 자료로 사용하지 않았습니다.</p>
    {children}
  </main>
}
