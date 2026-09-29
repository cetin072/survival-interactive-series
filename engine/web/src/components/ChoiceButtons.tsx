import type { Choice } from '../types'

type ChoiceButtonsProps = {
  choices: Choice[]
  selectedChoiceIds: number[]
  onToggle: (choice: Choice) => void
  maxSelections?: number
  disabled?: boolean
}

export function ChoiceButtons({ choices, selectedChoiceIds, onToggle, maxSelections = 2, disabled = false }: ChoiceButtonsProps) {
  const atLimit = selectedChoiceIds.length >= maxSelections

  return <section className="choices choice-grid" aria-label="선택지">
    {choices.slice(0, 4).map((choice) => {
      const selectedIndex = selectedChoiceIds.indexOf(choice.id)
      const selected = selectedIndex >= 0
      const selectionLocked = atLimit && !selected
      return <button
        type="button"
        disabled={disabled || selectionLocked}
        key={choice.id}
        className={selected ? 'choice-card selected' : 'choice-card'}
        aria-pressed={selected}
        aria-label={`${choice.id}번 선택지: ${choice.label}`}
        onClick={() => onToggle(choice)}
      >
        <span className="choice-card-topline">
          <span className="choice-card-index">{choice.id}</span>
          {selected && <span className="choice-card-order" aria-label={`${selectedIndex + 1}순위`}>{selectedIndex + 1}</span>}
        </span>
        <strong className="choice-card-title">{choice.label}</strong>
      </button>
    })}
  </section>
}
