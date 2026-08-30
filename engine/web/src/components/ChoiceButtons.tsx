import type { Choice } from '../types'

export function ChoiceButtons({ choices, onSelect }: { choices: Choice[]; onSelect: (choice: Choice) => void }) {
  return <section className="choices" aria-label="선택지">
    {choices.map((choice) => <button type="button" key={choice.id} onClick={() => onSelect(choice)}><kbd>{choice.id}</kbd><span>{choice.label}</span></button>)}
  </section>
}
