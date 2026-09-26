import type { PublicRuntimeCheckpoint } from './publicRuntimeCheckpoint'

export function buildStoryBenchmarkTranscript(checkpoint: PublicRuntimeCheckpoint): string {
  const lines: string[] = []
  lines.push('# 《생존일기》 웹 Story Benchmark 대본')
  lines.push(`turn: ${checkpoint.committed_turn.number}`)
  lines.push(`time: ${checkpoint.public_state.clock.date} ${checkpoint.public_state.clock.time}`.trim())
  lines.push(`player_location: ${checkpoint.public_state.party.player?.location ?? '?'}`)
  lines.push('')

  let sceneNumber = 0
  let lastSceneText = ''
  for (const entry of checkpoint.committed_turn.log) {
    if (typeof entry.text !== 'string') continue
    if (entry.kind === 'scene') {
      if (entry.text.startsWith('STORYTELLING BENCHMARK S01 시작')) continue
      lines.push(`\n## SCENE ${sceneNumber}`)
      lines.push(entry.text)
      lastSceneText = entry.text
      sceneNumber += 1
      continue
    }
    if (entry.kind === 'choice') {
      lines.push(`\n[PLAYER CHOICE] ${entry.text}`)
      continue
    }
    if (entry.kind === 'free-action') {
      lines.push(`\n[PLAYER FREE ACTION] ${entry.text}`)
    }
  }

  const currentNarrative = checkpoint.current_scene.narrative
  if (currentNarrative.trim() && currentNarrative !== lastSceneText) {
    lines.push(`\n## SCENE ${sceneNumber}`)
    lines.push(currentNarrative)
  }

  if (checkpoint.current_scene.choices.length > 0) {
    lines.push('\n## CURRENT CHOICES')
    for (const choice of checkpoint.current_scene.choices.slice(0, 4)) {
      lines.push(`${choice.id}. ${choice.label}`)
    }
  }

  return lines.join('\n')
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined') throw new Error('clipboard unavailable')
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  document.execCommand('copy')
  area.remove()
}
