import type { PresentationBlock } from '../types'

export function PresentationBlocks({ blocks }: { blocks: PresentationBlock[] }) {
  if (blocks.length === 0) return null

  return <section className="presentation-blocks" aria-label="장면 변화">
    {blocks.map((block) => <article className={`presentation-block ${block.type.toLowerCase().replace(' ', '-')}`} key={`${block.type}-${block.message}`}>
      <h2>{block.type}</h2><p>{block.message}</p>
    </article>)}
  </section>
}
