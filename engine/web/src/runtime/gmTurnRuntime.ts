import { runActionQueue } from '../controller/actionQueue'
import { choiceLog, freeActionLog } from '../input/action'
import type { LogEntry } from '../types'
import type { ActionExecutionResult, QueuedAction } from '../validator/types'
import { type GMProposal, validateGMProposal } from './gmProposal'
import type { GMPlayerInput, GMProvider } from './gmProvider'
import { createPublicRuntimeCheckpoint, type PublicRuntimeCheckpoint } from './publicRuntimeCheckpoint'

function resultLog(result: ActionExecutionResult, id: number): LogEntry {
  const summary = result.validation.issues.map((issue) => issue.message).join(' · ')
  return { id, kind: 'result', text: summary || `엔진 커밋 완료: ${result.outcome}` }
}

function inputLog(checkpoint: PublicRuntimeCheckpoint, input: GMPlayerInput, id: number): LogEntry {
  if (input.kind === 'free-action') return freeActionLog(input.text, id)
  if (input.kind === 'ordered-choices') {
    const labels = input.choice_ids.map((choiceId) => {
      const choice = checkpoint.current_scene.choices.find((item) => item.id === choiceId)
      return choice?.label ?? `알 수 없는 선택 ${choiceId}`
    })
    return { id, kind: 'choice', text: `복수 선택: ${labels.map((label, index) => `${index + 1}. ${label}`).join(' → ')}` }
  }
  const choice = checkpoint.current_scene.choices.find((item) => item.id === input.choice_id)
  return choice ? choiceLog(choice, id) : { id, kind: 'system', text: `알 수 없는 선택: ${input.choice_id}` }
}

function withCurrentScenePreserved(checkpoint: PublicRuntimeCheckpoint): LogEntry[] {
  const log = checkpoint.committed_turn.log
  const alreadyLogged = log.some((entry) => entry.kind === 'scene' && entry.text === checkpoint.current_scene.narrative)
  if (alreadyLogged) return log

  if (checkpoint.committed_turn.number === 0 && log.length === 1 && log[0]?.kind === 'scene') {
    return [{ ...log[0], text: checkpoint.current_scene.narrative }]
  }

  return [
    ...log,
    { id: log.length, kind: 'scene', text: checkpoint.current_scene.narrative },
  ]
}

function fallback(checkpoint: PublicRuntimeCheckpoint, input: GMPlayerInput, message: string): PublicRuntimeCheckpoint {
  const preservedLog = withCurrentScenePreserved(checkpoint)
  const logId = preservedLog.length
  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    current_scene: checkpoint.current_scene,
    committed_turn: {
      ...checkpoint.committed_turn,
      log: [...preservedLog, inputLog(checkpoint, input, logId), { id: logId + 1, kind: 'system', text: message }],
    },
  })
}

function placeholderChoiceAction(turnNumber: number, choiceId: number, label: string): QueuedAction {
  return {
    id: `story-choice-t${turnNumber}-${choiceId}`,
    label,
    actors: ['player'],
    exclusive_resources: [],
    proposal: { time_delta_min: 0, moves: [], resource_changes: [], base_capability_changes: [], world_changes: [] },
  }
}

function sceneFromProposal(proposal: GMProposal, turnNumber: number) {
  const familyBlocks = proposal.family_reactions?.map((reaction) => ({
    type: 'EVENT' as const,
    message: `${reaction.member} · ${reaction.disposition}: ${reaction.message}`,
  })) ?? []
  return {
    id: `gm_turn_${turnNumber}`,
    narrative: proposal.narrative,
    choices: proposal.next_choices.map((choice) => ({
      ...choice,
      action: choice.action ?? placeholderChoiceAction(turnNumber, choice.id, choice.label),
    })),
    presentation_blocks: [
      ...proposal.presentation_blocks,
      ...(proposal.visible_reaction ? [{ type: 'EVENT' as const, message: proposal.visible_reaction }] : []),
      ...familyBlocks,
    ],
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
  const preservedLog = withCurrentScenePreserved(checkpoint)
  const logId = preservedLog.length
  const results = queue.results.map((result, index) => resultLog(result, logId + 1 + index))
  const accepted = queue.results.some((result) => result.outcome === 'success' || result.outcome === 'partial_success')
  const ambiguity = parsed.proposal.ambiguity ? ` ${parsed.proposal.ambiguity.message}` : ''
  const nextTurn = checkpoint.committed_turn.number + 1
  const scene = sceneFromProposal(parsed.proposal, nextTurn)
  const storyAdvancedWithoutMutation = parsed.proposal.actions.length === 0
  const ambiguityOffset = ambiguity ? 1 : 0
  const sceneLogId = logId + 1 + results.length + ambiguityOffset

  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    public_state: queue.state,
    current_scene: scene,
    recent_visible_change: accepted || storyAdvancedWithoutMutation
      ? parsed.proposal.narrative
      : '일부 상태 변경은 엔진 검증에서 거부됐지만 장면은 계속 진행되었습니다.',
    committed_turn: {
      number: nextTurn,
      log: [
        ...preservedLog,
        inputLog(checkpoint, input, logId),
        ...results,
        ...(ambiguity ? [{ id: logId + 1 + results.length, kind: 'system' as const, text: ambiguity }] : []),
        { id: sceneLogId, kind: 'scene' as const, text: parsed.proposal.narrative },
      ],
    },
  })
}
