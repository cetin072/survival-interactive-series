(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('benchmark-tools') !== '1') return

  const STORAGE_KEY = 'survival-story-benchmark-s01-v1'

  function buildTranscript() {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return '비교할 플레이 기록이 없습니다.'

    let checkpoint
    try {
      checkpoint = JSON.parse(raw)
    } catch {
      return '플레이 기록을 읽지 못했습니다.'
    }

    const lines = []
    lines.push('# 《생존일기》 웹 Story Benchmark 대본')
    lines.push(`turn: ${checkpoint?.committed_turn?.number ?? '?'}`)
    lines.push(`time: ${checkpoint?.public_state?.clock?.date ?? ''} ${checkpoint?.public_state?.clock?.time ?? ''}`.trim())
    lines.push(`player_location: ${checkpoint?.public_state?.party?.player?.location ?? '?'}`)
    lines.push('')

    const log = Array.isArray(checkpoint?.committed_turn?.log) ? checkpoint.committed_turn.log : []
    let sceneNumber = 0
    let lastSceneText = ''

    for (const entry of log) {
      if (!entry || typeof entry.text !== 'string') continue
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

    const currentNarrative = checkpoint?.current_scene?.narrative
    if (typeof currentNarrative === 'string' && currentNarrative.trim() && currentNarrative !== lastSceneText) {
      lines.push(`\n## SCENE ${sceneNumber}`)
      lines.push(currentNarrative)
    }

    const choices = Array.isArray(checkpoint?.current_scene?.choices) ? checkpoint.current_scene.choices : []
    if (choices.length) {
      lines.push('\n## CURRENT CHOICES')
      for (const choice of choices.slice(0, 4)) {
        lines.push(`${choice.id}. ${choice.label}`)
      }
    }

    return lines.join('\n')
  }

  async function copyTranscript(button) {
    const text = buildTranscript()
    try {
      await navigator.clipboard.writeText(text)
      button.textContent = '대본 복사됨 ✓'
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.focus()
      area.select()
      document.execCommand('copy')
      area.remove()
      button.textContent = '대본 복사됨 ✓'
    }
    window.setTimeout(() => { button.textContent = '대본 복사' }, 1800)
  }

  window.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '대본 복사'
    button.setAttribute('aria-label', '현재 Story Benchmark 대본 복사')
    Object.assign(button.style, {
      position: 'fixed',
      right: '12px',
      bottom: '14px',
      zIndex: '99999',
      border: '1px solid rgba(255,255,255,.22)',
      borderRadius: '999px',
      padding: '10px 14px',
      background: '#18211d',
      color: '#f5f7f6',
      fontSize: '14px',
      fontWeight: '700',
      boxShadow: '0 6px 20px rgba(0,0,0,.28)'
    })
    button.addEventListener('click', () => copyTranscript(button))
    document.body.appendChild(button)
  })
})()
