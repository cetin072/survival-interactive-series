import type { GMProviderTurnRequest } from '../runtime/gmProvider'

const NUMBERED_CHOICE_REFERENCE = /([1-4])\s*번/g

/**
 * Free-action text can refer to the currently visible choices (for example, "1번 후속 진행").
 * The browser/log keeps the user's original text; only the provider-facing copy receives the
 * matching public choice labels so the model does not have to guess what "1번" means.
 */
export function addChoiceReferenceContext(request: GMProviderTurnRequest): GMProviderTurnRequest {
  if (request.input.kind !== 'free-action') return request

  const referencedIds = [...request.input.text.matchAll(NUMBERED_CHOICE_REFERENCE)]
    .map((match) => Number(match[1]))
    .filter((id, index, all) => Number.isInteger(id) && all.indexOf(id) === index)

  if (referencedIds.length === 0) return request

  const references = referencedIds
    .map((id) => request.checkpoint.current_scene.choices.find((choice) => choice.id === id))
    .filter((choice): choice is NonNullable<typeof choice> => Boolean(choice))
    .map((choice) => `${choice.id}번 = ${choice.label}`)

  if (references.length === 0) return request

  return {
    ...request,
    input: {
      ...request.input,
      text: `${request.input.text}\n\n[현재 선택지 참조]\n${references.join('\n')}`,
    },
  }
}
