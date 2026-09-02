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
    {choices.map((choice) => {
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
          {selected && <span className="choice-card-order" aria-label={`${selectedIndex + 1}순위`}>{selectedIndex + 1}순위</span>}
        </span>
        <span className="choice-card-copy">
          <strong>{choice.label}</strong>
          <span className="choice-card-description">{choice.description ?? '이 행동을 우선해 현재 상황에 대응합니다. 구체적인 결과는 선택 후 드러납니다.'}</span>
        </span>
        <small>{selected
          ? `${selectedIndex + 1}번째 행동으로 선택됨`
          : selectionLocked
            ? `한 턴에 최대 ${maxSelections}개 선택`
            : `최대 ${maxSelections}개 · 터치한 순서대로 실행`}</small>
      </button>
    })}
  </section>
}
