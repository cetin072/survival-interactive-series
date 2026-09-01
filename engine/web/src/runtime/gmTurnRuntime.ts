import { runActionQueue } from '../controller/actionQueue'
import { choiceLog, freeActionLog } from '../input/action'
import type { LogEntry } from '../types'
import type { ActionExecutionResult } from '../validator/types'
import { type GMProposal, validateGMProposal } from './gmProposal'
import type { GMPlayerInput, GMProvider } from './gmProvider'
import { createPublicRuntimeCheckpoint, type PublicRuntimeCheckpoint } from './publicRuntimeCheckpoint'

function resultLog(result: ActionExecutionResult, id: number): LogEntry {
  const summary = result.validation.issues.map((issue) => issue.message).join(' · ')
  return { id, kind: 'result', text: summary || `엔진 커밋 완료: ${result.outcome}` }
}

function inputLog(checkpoint: PublicRuntimeCheckpoint, input: GMPlayerInput, id: number): LogEntry {
  if (input.kind === 'free-action') return freeActionLog(input.text, id)
  const choice = checkpoint.current_scene.choices.find((item) => item.id === input.choice_id)
  return choice ? choiceLog(choice, id) : { id, kind: 'system', text: `알 수 없는 선택: ${input.choice_id}` }
}

function fallback(checkpoint: PublicRuntimeCheckpoint, input: GMPlayerInput, message: string): PublicRuntimeCheckpoint {
  const logId = checkpoint.committed_turn.log.length
  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    current_scene: {
      ...checkpoint.current_scene,
      narrative: `${message} 상태를 바꾸지 않았고, 다시 시도하거나 공개 선택지로 진행할 수 있습니다.`,
    },
    committed_turn: {
      ...checkpoint.committed_turn,
      log: [...checkpoint.committed_turn.log, inputLog(checkpoint, input, logId), { id: logId + 1, kind: 'system', text: message }],
    },
  })
}

function sceneFromProposal(proposal: GMProposal) {
  return {
    id: `gm_turn_scene`,
    narrative: proposal.narrative,
    choices: proposal.next_choices,
    presentation_blocks: proposal.visible_reaction
      ? [...proposal.presentation_blocks, { type: 'EVENT' as const, message: proposal.visible_reaction }]
      : proposal.presentation_blocks,
  }
}

/** The only commit path for a provider proposal: proposal shape guard, then existing Action Queue / Validator. */
export async function runGMProviderTurn(
  checkpoint: PublicRuntimeCheckpoint,
  input: GMPlayerInput,
  provider: GMProvider,
): Promise<PublicRuntimeCheckpoint> {
  let providerResult
  try {
    providerResult = await provider.proposeTurn({ input, checkpoint })
  } catch {
    return fallback(checkpoint, input, 'AI GM 연결에 실패했습니다.')
  }
  if (providerResult.status === 'unavailable') return fallback(checkpoint, input, providerResult.message)

  const parsed = validateGMProposal(providerResult.proposal)
  if (!parsed.valid) return fallback(checkpoint, input, `AI GM 제안을 처리하지 않았습니다: ${parsed.message}`)

  const queue = runActionQueue(checkpoint.public_state, parsed.proposal.actions)
  const logId = checkpoint.committed_turn.log.length
  const results = queue.results.map((result, index) => resultLog(result, logId + 1 + index))
  const accepted = queue.results.some((result) => result.outcome === 'success' || result.outcome === 'partial_success')
  const ambiguity = parsed.proposal.ambiguity ? ` ${parsed.proposal.ambiguity.message}` : ''

  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    public_state: queue.state,
    current_scene: sceneFromProposal(parsed.proposal),
    recent_visible_change: accepted ? parsed.proposal.narrative : '엔진이 상태 변경을 커밋하지 않았습니다.',
    committed_turn: {
      number: checkpoint.committed_turn.number + 1,
      log: [...checkpoint.committed_turn.log, inputLog(checkpoint, input, logId), ...results, ...(ambiguity ? [{ id: logId + 1 + results.length, kind: 'system' as const, text: ambiguity }] : [])],
    },
  })
}
