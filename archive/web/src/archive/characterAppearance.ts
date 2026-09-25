import type { ArchiveNode } from './archiveData'

export type AppearanceStatus = 'confirmed' | 'visual-backfill-needed'

/**
 * A public publication snapshot of `known_facts.appearance_anchor`.
 *
 * The short description is the only reader-facing form. The structured
 * fields deliberately stay here for future illustration and IP work; an
 * absent field means that fact has not been confirmed, not that it is false.
 */
export type CharacterAppearanceAnchor = {
  status: AppearanceStatus
  publicDescription?: string
  sourceRefs: string[]
  visual: {
    apparentAge?: string
    height?: string
    build?: string
    face?: string
    hair?: string
    style?: string
    distinctive?: string
    attractiveness?: string
    presence?: string
    voice?: string
  }
  auditNote?: string
}

const verifiedProfileSource = 'archive/content/transcripts/C03-AFTERFALL/S02/SESSION_001/PART_002.md'
const firstAppearanceSource = 'archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_004.md'

export const characterAppearanceByNodeId: Record<string, CharacterAppearanceAnchor> = {
  'char-jinwoo': {
    status: 'confirmed',
    publicDescription: '176cm의 마른 체형에 검은 머리와 차분한 눈빛을 지녔다. 낮고 안정적인 목소리가 현장에서도 두드러진다.',
    sourceRefs: [verifiedProfileSource],
    visual: { apparentAge: '32세', height: '176cm', build: '마른 체형', hair: '검은 머리', presence: '차분한 눈빛', voice: '낮고 안정적인 목소리' },
  },
  'char-seojin': {
    status: 'confirmed',
    publicDescription: '짙은 갈색 단발에 마른 체형, 평균보다 약간 큰 키다. 또렷하고 차분한 말투가 의료인다운 인상을 남긴다.',
    sourceRefs: [verifiedProfileSource],
    visual: { apparentAge: '30대 초반', height: '평균보다 약간 큰 키', build: '마른 체형', hair: '짙은 갈색 단발', voice: '또렷하고 차분한 말투' },
  },
  'char-eunchae': {
    status: 'confirmed',
    publicDescription: '검은 머리를 낮게 묶고 금속테 안경을 쓴 마른 체형이다. 사무적이고 명확한 목소리가 정돈된 인상과 이어진다.',
    sourceRefs: [verifiedProfileSource],
    visual: { apparentAge: '30대 중반', build: '마른 체형', hair: '낮게 묶은 검은 머리', distinctive: '금속테 안경', voice: '사무적이고 명확한 목소리' },
  },
  'char-taehoon': {
    status: 'confirmed',
    publicDescription: '단단한 체형에 작업복 계열의 차림을 한 실무자다. 말보다 행동이 빠른 인상이 외형의 생활감과 맞닿아 있다.',
    sourceRefs: [verifiedProfileSource],
    visual: { apparentAge: '40대', build: '단단한 체형', style: '작업복 계열', presence: '말보다 행동이 빠른 실무형' },
  },
  'char-hayoung': {
    status: 'confirmed',
    publicDescription: '160대 중반의 군살 없이 단단한 체형에 긴 검은 머리를 목 뒤에서 대충 묶는다. 선명한 눈매와 이목구비, 한쪽 볼의 옅은 보조개가 생활감 있는 단정한 인상으로 남는다.',
    sourceRefs: [firstAppearanceSource],
    visual: { height: '160대 중반', build: '군살 없이 단단한 체형', face: '선명한 눈매와 또렷한 이목구비', hair: '목 뒤에서 대충 묶은 긴 검은 머리', style: '소매를 걷어붙인 작업복', distinctive: '한쪽 볼의 옅은 보조개', attractiveness: '생활감 있는 모습에서도 단정한 인상', voice: '맑지만 피곤하면 낮아짐' },
  },
  'char-yujin': {
    status: 'confirmed',
    publicDescription: '160cm 안팎의 가늘고 마른 체형에 어깨 아래까지 오는 짙은 갈색 머리를 낮게 묶는다. 부드러운 타원형 얼굴과 차분한 눈, 작고 또렷한 목소리가 편안한 인상을 만든다.',
    sourceRefs: [firstAppearanceSource],
    visual: { apparentAge: '30대 중반', height: '160cm 안팎', build: '가늘고 마른 체형', face: '부드러운 타원형 얼굴과 크고 차분한 눈', hair: '낮게 묶은 짙은 갈색 머리', style: '밝은 셔츠·카디건·작업바지', attractiveness: '가까이 볼수록 편안하고 부드러운 인상', voice: '작고 조용하지만 또렷한 목소리' },
  },
  'char-sehoon': {
    status: 'confirmed',
    publicDescription: '40대 중반의 마른 근육질 체형으로, 회색 작업점퍼를 입는다. 눈가가 깊게 패인 모습과 신중한 태도가 현장 기술자의 인상으로 남는다.',
    sourceRefs: ['archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_001.md'],
    visual: { apparentAge: '40대 중반', build: '마른 근육질', face: '눈가가 깊게 패임', style: '회색 작업점퍼', presence: '말하기 전에 한 번 더 생각하는 태도' },
  },
  'char-doyoon': {
    status: 'confirmed',
    publicDescription: '30대 후반으로 어깨가 넓고 체격이 단단하다. 낡은 방수 작업바지와 접어 넣은 면장갑이 운반과 외부 작업에 익숙한 모습을 드러낸다.',
    sourceRefs: ['archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_001.md'],
    visual: { apparentAge: '30대 후반', build: '어깨가 넓고 단단한 체격', style: '낡은 방수 작업바지', distinctive: '주머니에 접어 넣은 면장갑', presence: '운반과 외부 작업에 익숙한 모습' },
  },
  'char-jisu': {
    status: 'confirmed',
    publicDescription: '168cm쯤의 길고 탄탄한 체형에 햇볕에 살짝 그을린 피부를 지녔다. 턱 아래 길이의 검은 머리를 귀 뒤로 넘기고, 작업복과 등산화 차림으로 현장을 지킨다.',
    sourceRefs: [firstAppearanceSource],
    visual: { apparentAge: '30대 중후반', height: '168cm쯤', build: '길고 탄탄한 체형', face: '길고 선명한 눈매', hair: '귀 뒤로 넘긴 턱 아래 길이의 검은 머리', style: '작업복 바지와 두꺼운 등산화', distinctive: '장갑과 작은 몽키스패너', attractiveness: '꾸민 흔적 없이도 선명한 이목구비', voice: '낮고 맑은 목소리' },
  },
  'char-hyerin': {
    status: 'confirmed',
    publicDescription: '40대 초반의 단정한 인상으로, 검은 머리를 짧게 묶고 짙은 남색 수술복 위에 회색 플리스를 걸친다. 피곤함이 짙어도 흐트러지지 않는 눈빛과 안정적인 목소리가 남는다.',
    sourceRefs: [firstAppearanceSource],
    visual: { apparentAge: '40대 초반', face: '피곤함이 짙어도 흐트러지지 않는 눈빛', hair: '짧게 묶은 검은 머리', style: '짙은 남색 수술복과 회색 플리스', attractiveness: '꾸미지 않은 얼굴에도 또렷한 선', voice: '안정적인 목소리' },
  },
  'char-mira': missingAppearance(),
  'char-minho': missingAppearance(),
  'char-hajin': missingAppearance(),
  'char-mingyu': missingAppearance(),
  'char-kyunghee': missingAppearance(),
  'char-seongho': missingAppearance(),
  'char-cheolsu': missingAppearance(),
  'char-jaemin': missingAppearance(),
}

function missingAppearance(): CharacterAppearanceAnchor {
  return {
    status: 'visual-backfill-needed',
    sourceRefs: [],
    visual: {},
    auditNote: '현재 공개된 verified RAW에서 안정적인 외형 앵커를 찾지 못했다. 다음 의미 있는 공개 장면에서 자연스럽게 확정한다.',
  }
}

export function confirmedAppearanceFor(node: ArchiveNode): CharacterAppearanceAnchor | undefined {
  if (node.type !== 'character') return undefined
  const appearance = characterAppearanceByNodeId[node.id]
  return appearance?.status === 'confirmed' ? appearance : undefined
}

export const characterAppearanceAudit = {
  confirmed: Object.entries(characterAppearanceByNodeId).filter(([, anchor]) => anchor.status === 'confirmed').map(([id]) => id),
  visualBackfillNeeded: Object.entries(characterAppearanceByNodeId).filter(([, anchor]) => anchor.status === 'visual-backfill-needed').map(([id]) => id),
}
