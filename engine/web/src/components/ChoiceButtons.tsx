import type { Choice } from '../types'

type ChoiceButtonsProps = {
  choices: Choice[]
  selectedChoiceIds: number[]
  onToggle: (choice: Choice) => void
  disabled?: boolean
}

export function ChoiceButtons({ choices, selectedChoiceIds, onToggle, disabled = false }: ChoiceButtonsProps) {
  return <section className="choices" aria-label="선택지">
    {choices.map((choice) => {
      const selectedIndex = selectedChoiceIds.indexOf(choice.id)
      const selected = selectedIndex >= 0
      return <button
        type="button"
        disabled={disabled}
        key={choice.id}
        className={selected ? 'choice-card selected' : 'choice-card'}
        aria-pressed={selected}
        onClick={() => onToggle(choice)}
      >
        <span className="choice-card-index">{choice.id}</span>
        <span className="choice-card-copy">
          <strong>{choice.label}</strong>
          <small>{selected ? `${selectedIndex + 1}순위로 실행` : '터치해서 실행 순서에 추가'}</small>
        </span>
        {selected && <span className="choice-card-order" aria-label={`${selectedIndex + 1}순위`}>{selectedIndex + 1}</span>}
      </button>
    })}
  </section>
}
