/** Deterministic Reader Edition transform: selection, never prose rewriting. */
export function removeTrailingChoiceGate(gm: string) {
  const lines = gm.split('\n')
  const cue = /^(?:#{1,4}\s*)?(?:선택|행동|다음 선택|다음 행동|어떻게 할까\??|무엇을 할까\??|결정)\s*$/
  let start = lines.findIndex((line, i) => i >= Math.floor(lines.length * .55) && cue.test(line.trim()))
  if (start < 0) {
    const optionPattern = /^(?:#{1,4}\s*)?(?:\*\*)?(?:\d+\.|[A-D][.)]|[①-⑳])\s+/
    const option = lines.findIndex((line, i) => i >= Math.floor(lines.length * .55) && optionPattern.test(line.trim()))
    if (option >= 0 && lines.slice(option).filter((line) => optionPattern.test(line.trim())).length >= 2) {
      start = option
      if (/(?:문제다|선택|어디|어떻게)/.test(lines[option - 1]?.trim() ?? '')) start--
    } else return gm.trim()
  }
  for (let i = start - 1; i >= Math.max(0, start - 24); i--) {
    const line = lines[i].trim()
    if (/^#{1,4}\s*(?:현재|현재 상태)\s*$/.test(line)) { start = i; break }
    if (/^(?:\d+\.|[A-D][.)]|[①-⑳])\s+/.test(line) || line === '') { start = i; continue }
    break
  }
  return lines.slice(0, start).join('\n').replace(/\s+$/, '')
}
export function extractReaderNarrativeFromGm(raw: string) {
  const speaker = /^(#{2,3})\s*(USER|GM|ASSISTANT(?:_PUBLIC_META)?)(?:\s*[—-].*)?\s*$/gmi
  const marks = [...raw.matchAll(speaker)]
  return marks.flatMap((mark, index) => {
    if (mark[2].toUpperCase() !== 'GM') return []
    const block = raw.slice(mark.index + mark[0].length, marks[index + 1]?.index ?? raw.length).replace(/^\s+|\s+$/g, '')
    return /(?:게임|버그|시스템 수정 모드|참고하되)/.test(block) ? [] : [removeTrailingChoiceGate(block)]
  }).filter(Boolean).join('\n\n')
}
