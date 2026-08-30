import type { SliceIntent } from './types'

export type ParsedFreeAction =
  | { matched: true; intent: SliceIntent; normalized: string }
  | { matched: false; suggestions: string[] }

const rules: { intent: SliceIntent; tokens: string[]; normalized: string }[] = [
  { intent: 'go_home', tokens: ['집', '아파트', '귀가'], normalized: '도심 아파트로 이동' },
  { intent: 'go_base', tokens: ['외곽', '거점', '아버지집'], normalized: '외곽거점으로 이동' },
  { intent: 'call_wife', tokens: ['아내', '서윤', '전화'], normalized: '서윤에게 연락' },
  { intent: 'call_father', tokens: ['아버지', '정호', '전화'], normalized: '정호에게 연락' },
  { intent: 'check_resources', tokens: ['물자', '식량', '자원', '확인'], normalized: '보유 자원 확인' },
  { intent: 'wait', tokens: ['기다', '대기', '잠시'], normalized: '잠시 대기' },
  { intent: 'observe', tokens: ['관찰', '상황', '주변', '확인'], normalized: '주변 상황 관찰' },
]

export function parseFreeAction(input: string): ParsedFreeAction {
  const compact = input.trim().replace(/\s+/g, '')
  if (!compact) return { matched: false, suggestions: ['상황을 확인한다', '집으로 간다', '아버지에게 전화한다'] }

  const scored = rules
    .map((rule) => ({ rule, score: rule.tokens.filter((token) => compact.includes(token)).length }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    return { matched: false, suggestions: ['상황을 확인한다', '15분 기다린다', '집으로 이동한다', '외곽거점으로 이동한다'] }
  }

  return { matched: true, intent: scored[0].rule.intent, normalized: scored[0].rule.normalized }
}
