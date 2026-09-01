import type { Choice, PresentationBlock } from '../types'
import type { QueuedAction } from '../validator/types'

export type GMProposal = {
  actions: QueuedAction[]
  narrative: string
  next_choices: Array<Choice & { action: QueuedAction }>
  presentation_blocks: PresentationBlock[]
  visible_reaction?: string
  ambiguity?: { kind: 'linguistic' | 'deferred'; message: string }
}

export type GMProposalValidation =
  | { valid: true; proposal: GMProposal }
  | { valid: false; message: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isObject(value) && Object.values(value).every(isJsonValue)
}

function isQueuedAction(value: unknown): value is QueuedAction {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.label !== 'string' || !Array.isArray(value.actors)) return false
  if (!value.actors.every((actor) => ['player', 'wife', 'son', 'father'].includes(String(actor)))) return false
  if (value.exclusive_resources !== undefined && (!Array.isArray(value.exclusive_resources) || !value.exclusive_resources.every((resource) => typeof resource === 'string'))) return false
  if (!isObject(value.proposal)) return false

  const proposal = value.proposal
  if (!Number.isInteger(proposal.time_delta_min) || (proposal.time_delta_min as number) < 0) return false
  if (!Array.isArray(proposal.moves) || !Array.isArray(proposal.resource_changes) || !Array.isArray(proposal.world_changes)) return false
  return proposal.moves.every((move) => isObject(move)
    && (move.entity_type === 'party' || move.entity_type === 'vehicle')
    && typeof move.entity_id === 'string' && typeof move.from === 'string' && typeof move.to === 'string')
    && proposal.resource_changes.every((change) => isObject(change)
      && typeof change.resource_id === 'string' && typeof change.from === 'string' && typeof change.to === 'string')
    && proposal.world_changes.every((change) => isObject(change)
      && typeof change.key === 'string' && (change.from === undefined || isJsonValue(change.from)) && isJsonValue(change.to))
}

function isChoice(value: unknown): value is Choice & { action: QueuedAction } {
  return isObject(value) && Number.isInteger(value.id) && typeof value.label === 'string' && isQueuedAction(value.action)
}

function isPresentationBlock(value: unknown): value is PresentationBlock {
  return isObject(value) && ['EVENT', 'AUTO', 'PHASE CHANGE'].includes(String(value.type)) && typeof value.message === 'string'
}

/** Runtime guard for provider output. It validates shape only; physical feasibility remains the engine Validator's job. */
export function validateGMProposal(value: unknown): GMProposalValidation {
  if (!isObject(value)) return { valid: false, message: 'GM proposal must be an object.' }
  if (!Array.isArray(value.actions) || !value.actions.every(isQueuedAction)) return { valid: false, message: 'GM proposal has malformed actions.' }
  if (typeof value.narrative !== 'string') return { valid: false, message: 'GM proposal needs narration.' }
  if (!Array.isArray(value.next_choices) || !value.next_choices.every(isChoice)) return { valid: false, message: 'GM proposal has malformed next choices.' }
  if (!Array.isArray(value.presentation_blocks) || !value.presentation_blocks.every(isPresentationBlock)) return { valid: false, message: 'GM proposal has malformed presentation blocks.' }
  if (value.visible_reaction !== undefined && typeof value.visible_reaction !== 'string') return { valid: false, message: 'GM proposal has malformed visible reaction.' }
  if (value.ambiguity !== undefined) {
    if (!isObject(value.ambiguity) || !['linguistic', 'deferred'].includes(String(value.ambiguity.kind)) || typeof value.ambiguity.message !== 'string') {
      return { valid: false, message: 'GM proposal has malformed ambiguity metadata.' }
    }
  }
  return { valid: true, proposal: value as GMProposal }
}
