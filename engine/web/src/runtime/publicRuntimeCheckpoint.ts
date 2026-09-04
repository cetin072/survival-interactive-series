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

export function commitPublicRuntimeAction(
  checkpoint: PublicRuntimeCheckpoint,
  input: LogEntry,
  action: QueuedAction,
  nextScene: (state: LiveState, result: ActionExecutionResult) => PublicRuntimeScene,
): PublicRuntimeCheckpoint {
  const queue = runActionQueue(checkpoint.public_state, [action])
  const result = queue.results[0]
  const scene = nextScene(queue.state, result)
  const state = { ...queue.state, scene_id: scene.id }
  const logId = checkpoint.committed_turn.log.length
  const log = [...checkpoint.committed_turn.log, { ...input, id: logId }, resultLog(result, logId + 1)]

  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    public_state: state,
    current_scene: scene,
    recent_visible_change: result.outcome === 'success' || result.outcome === 'partial_success'
      ? action.label
      : `처리되지 않음: ${action.label}`,
    committed_turn: {
      number: result.outcome === 'success' || result.outcome === 'partial_success'
        ? checkpoint.committed_turn.number + 1
        : checkpoint.committed_turn.number,
      log,
    },
  })
}

export function commitPublicRuntimeChoice(
  checkpoint: PublicRuntimeCheckpoint,
  choice: Choice & { action: QueuedAction },
  nextScene: (state: LiveState, result: ActionExecutionResult) => PublicRuntimeScene,
): PublicRuntimeCheckpoint {
  return commitPublicRuntimeAction(checkpoint, choiceLog(choice, 0), choice.action, nextScene)
}

/** Free text stays visible, but this fallback never mutates authoritative state. */
export function keepPublicRuntimeSafeAfterFreeAction(
  checkpoint: PublicRuntimeCheckpoint,
  action: string,
): PublicRuntimeCheckpoint {
  const logId = checkpoint.committed_turn.log.length
  return createPublicRuntimeCheckpoint({
    ...checkpoint,
    current_scene: {
      ...checkpoint.current_scene,
      narrative: 'AI GM 응답을 커밋하지 못했습니다. 상태를 바꾸지 않았고, 같은 행동을 다시 시도할 수 있습니다.',
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
