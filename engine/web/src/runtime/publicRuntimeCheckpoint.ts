import { runActionQueue } from '../controller/actionQueue'
import { choiceLog, freeActionLog } from '../input/action'
import type { Choice, LogEntry, PresentationBlock } from '../types'
import type { LiveState } from '../state/liveState'
import type { ActionExecutionResult, QueuedAction } from '../validator/types'

export const PUBLIC_RUNTIME_CHECKPOINT_VERSION = 1 as const

export type PublicRuntimeScene = {
  id: string
  narrative: string
  choices: Array<Choice & { action: QueuedAction }>
  presentation_blocks: PresentationBlock[]
}

export type PublicRuntimeCheckpoint = {
  contract_version: typeof PUBLIC_RUNTIME_CHECKPOINT_VERSION
  payload_visibility: 'public'
  source_kind: 'synthetic-fixture' | 'canon-v2'
  checkpoint_id: string
  season_id: string
  phase: string
  date: string | null
  time: string
  player_location: string
  family: Array<{ id: string; name: string; location: string; condition: string }>
  resources: Array<{ id: string; name: string; band: string }>
  base_capabilities: Array<{ id: string; name: string; capabilities: string[] }>
  active_visible_pressure: string
  recent_visible_change: string
  current_scene: PublicRuntimeScene
  committed_turn: { number: number; log: LogEntry[] }
  public_state: LiveState
}

type CheckpointInput = Omit<PublicRuntimeCheckpoint,
  'contract_version' | 'date' | 'time' | 'player_location' | 'family' | 'resources' | 'base_capabilities'>

function projectVisibleState(state: LiveState) {
  return {
    date: state.clock.date,
    time: state.clock.time,
    player_location: state.party.player.location,
    family: Object.entries(state.party).map(([id, member]) => ({
      id,
      name: member.name,
      location: member.location,
      condition: member.status,
    })),
    resources: Object.entries(state.resources).map(([id, resource]) => ({
      id,
      name: resource.name,
      band: resource.band,
    })),
    base_capabilities: Object.entries(state.bases).map(([id, base]) => ({
      id,
      name: base.name,
      capabilities: [...base.capabilities],
    })),
  }
}

export function createPublicRuntimeCheckpoint(input: CheckpointInput): PublicRuntimeCheckpoint {
  return {
    contract_version: PUBLIC_RUNTIME_CHECKPOINT_VERSION,
    ...input,
    ...projectVisibleState(input.public_state),
  }
}

function resultLog(result: ActionExecutionResult, id: number): LogEntry {
  const summary = result.validation.issues.map((issue) => issue.message).join(' · ')
  return {
    id,
    kind: 'result',
    text: summary || `엔진 커밋 완료: ${result.outcome}`,
  }
}

export function commitPublicRuntimeChoice(
  checkpoint: PublicRuntimeCheckpoint,
  choice: Choice & { action: QueuedAction },
  nextScene: (state: LiveState, result: ActionExecutionResult) => PublicRuntimeScene,
): PublicRuntimeCheckpoint {
  const queue = runActionQueue(checkpoint.public_state, [choice.action])
  const result = queue.results[0]
  const logId = checkpoint.committed_turn.log.length
  const log = [
    ...checkpoint.committed_turn.log,
    choiceLog(choice, logId),
    resultLog(result, logId + 1),
  ]

  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    public_state: queue.state,
    current_scene: nextScene(queue.state, result),
    recent_visible_change: result.outcome === 'success' || result.outcome === 'partial_success'
      ? choice.label
      : `처리되지 않음: ${choice.label}`,
    committed_turn: { number: checkpoint.committed_turn.number + 1, log },
  })
}

/** No provider is called in Phase 2. Free text remains visible, but cannot mutate state without an interpreted proposal. */
export function keepPublicRuntimeSafeAfterFreeAction(
  checkpoint: PublicRuntimeCheckpoint,
  action: string,
): PublicRuntimeCheckpoint {
  const logId = checkpoint.committed_turn.log.length
  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    current_scene: {
      ...checkpoint.current_scene,
      narrative: '자유행동 해석 연결 전입니다. 상태를 바꾸지 않았고, 아래 공개 선택지로 이번 턴을 계속할 수 있습니다.',
    },
    committed_turn: {
      ...checkpoint.committed_turn,
      log: [
        ...checkpoint.committed_turn.log,
        freeActionLog(action, logId),
        { id: logId + 1, kind: 'system', text: '안전한 fallback: 엔진 상태 변경 없음' },
      ],
    },
  })
}
