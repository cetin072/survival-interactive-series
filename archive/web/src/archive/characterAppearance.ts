import type { ArchiveNode } from './archiveData'

export type AppearanceStatus = 'confirmed' | 'visual-backfill-needed'

/**
 * Static publication snapshot of AFTERFALL visual Canon.
 *
 * Confirmed Supabase entries preserve every public field from
 * `survival_rpg.characters.known_facts.appearance_anchor`; the only editorial
 * addition is `publicDescription`, a compact reader-facing rendering of those
 * same facts. `visual-backfill-needed` is internal publication state and is
 * deliberately never rendered for readers.
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
    distinctive?: string[]
    attractiveness?: string
    presence?: string
    voice?: string
  }
  auditNote?: string
}

const supabaseAppearanceSource = 'survival_rpg.characters.known_facts.appearance_anchor'
const firstAppearanceSource = 'archive/content/transcripts/C03-AFTERFALL/S01/PART_C03_004.md'

const supabase = (publicDescription: string, visual: CharacterAppearanceAnchor['visual']): CharacterAppearanceAnchor => ({
  status: 'confirmed',
  publicDescription,
  sourceRefs: [supabaseAppearanceSource],
  visual,
})

export const characterAppearanceByNodeId: Record<string, CharacterAppearanceAnchor> = {
  'char-jinwoo': supabase(
    '30대 초반. 176cm의 군살 없는 체형과 자연스럽게 내려오는 검은 앞머리, 피곤할 때 짙어지는 눈 밑 그림자가 인상에 남는다. 낮고 차분한 목소리는 위급한 순간 짧고 단호해진다.',
    { apparentAge: '30대 초반', height: '176cm', build: '군살 없는 체형, 반듯한 자세', face: '깨끗한 얼굴선과 피곤할 때 짙어지는 눈 밑 그림자', hair: '자연스럽게 내려오는 검은 앞머리', distinctive: ['침착한 시선', '정돈된 인상'], voice: '낮고 차분하며 위급한 순간에는 짧고 단호함' },
  ),
  'char-seojin': supabase(
    '30대 초반. 평균보다 약간 큰 마른 체형에 턱선 위로 정리한 짙은 갈색 단발을 하고 있다. 집중할 때 또렷해지는 눈매와 빠르지 않지만 명확한 목소리가 특징이다.',
    { apparentAge: '30대 초반', height: '평균보다 약간 큰 편', build: '마른 체형', face: '날카롭지 않지만 집중하면 눈매가 또렷해짐', hair: '턱선 위로 정리한 짙은 갈색 단발', distinctive: ['왼쪽 귀 뒤로 머리를 넘기는 버릇'], voice: '빠르지 않고 명확함' },
  ),
  'char-eunchae': supabase(
    '30대 중반. 검은 머리를 낮게 묶은 마른 체형으로, 금속테 안경과 목걸이형 출입카드가 단정한 인상에 남는다. 목소리는 또렷하고 사무적이다.',
    { apparentAge: '30대 중반', height: '보통', build: '마른 편', face: '단정한 인상과 얇은 입매', hair: '검은 머리를 낮게 묶음', distinctive: ['금속테 안경', '목걸이형 출입카드'], voice: '또렷하고 사무적' },
  ),
  'char-taehoon': supabase(
    '40대 초반. 175cm 안팎의 작고 단단한 체형에 각진 얼굴과 햇볕에 거칠어진 피부가 눈에 띈다. 짧게 친 검은 머리의 옆에는 새치가 있고, 낡은 남색 작업조끼와 거친 손이 현장 경험을 드러낸다.',
    { apparentAge: '40대 초반', height: '175cm 안팎', build: '작고 단단한 체형', face: '각진 얼굴과 햇볕에 거칠어진 피부', hair: '짧게 친 검은 머리에 옆머리 새치', distinctive: ['낡은 남색 작업조끼', '거친 손'], voice: '낮고 건조함' },
  ),
  'char-hayoung': supabase(
    '30대 초반. 160cm대 중반의 군살 없이 단단한 체형에 긴 검은 머리를 목 뒤에서 대충 묶는다. 선명한 눈매와 한쪽 볼의 얕은 보조개, 소매를 걷은 작업복이 건강하고 단정한 인상을 만든다.',
    { apparentAge: '30대 초반', height: '160cm대 중반', build: '군살 없이 단단한 체형', face: '선명한 눈매와 또렷한 이목구비, 웃을 때 한쪽 볼에 얕은 보조개', hair: '긴 검은 머리를 목 뒤에서 대충 묶음', style: '소매를 걷은 실용적인 작업복과 앞치마가 자연스러운 사람', attractiveness: '화려한 미인형보다는 단정하고 건강한 인상이 오래 남는 매력적인 외모', voice: '맑지만 피곤하면 낮아지는 목소리' },
  ),
  'char-yujin': supabase(
    '30대 중반. 160cm 안팎의 가늘고 마른 체형에 짙은 갈색 머리를 낮게 하나로 묶는다. 부드러운 타원형 얼굴과 크고 차분한 눈, 작고 또렷한 목소리가 가까이 볼수록 편안한 인상을 남긴다.',
    { apparentAge: '30대 중반', height: '160cm 안팎', build: '가늘고 마른 체형', face: '부드러운 타원형 얼굴, 크고 차분한 눈, 피곤할수록 창백해 보이는 피부', hair: '어깨 아래까지 오는 짙은 갈색 머리를 낮게 하나로 묶음', style: '밝은색 셔츠 위에 오래된 카디건과 작업바지를 겹쳐 입는 편', attractiveness: '눈에 확 띄는 화려함보다는 가까이 볼수록 부드럽고 편안한 인상을 주는 여성', voice: '작고 조용하지만 또렷한 목소리' },
  ),
  'char-sehoon': supabase(
    '40대 중반. 170cm대 초반의 마른 근육질 체형에 광대가 도드라지고 눈가가 깊게 패인 얼굴을 지녔다. 회색 작업점퍼와 왼손 검지의 오래된 흉터가 눈에 띈다.',
    { apparentAge: '40대 중반', height: '170cm대 초반', build: '마른 근육질', face: '광대가 도드라지고 눈가가 깊게 패인 얼굴', hair: '짧게 자른 검은 머리와 넓어진 이마', distinctive: ['회색 작업점퍼', '왼손 검지의 오래된 흉터'] },
  ),
  'char-doyoon': supabase(
    '30대 후반. 178cm 안팎의 어깨가 넓고 다부진 체형에 둥근 턱선과 피곤한 눈을 지녔다. 낡은 방수 작업바지와 항상 접어 넣은 면장갑이 외부 작업에 익숙한 모습을 드러낸다.',
    { apparentAge: '30대 후반', height: '178cm 안팎', build: '어깨가 넓고 다부진 체형', face: '둥근 턱선과 피곤한 눈', hair: '짧은 스포츠형 머리', distinctive: ['낡은 방수 작업바지', '항상 접어 넣은 면장갑'] },
  ),
  'char-hyerin': supabase(
    '40대 초반. 160cm대 중반의 마른 편 체형에 검은 머리를 짧게 묶는다. 짙은 남색 수술복과 왼쪽 손목의 오래된 아날로그 시계, 낮고 건조하지만 명확한 목소리가 인상에 남는다.',
    { apparentAge: '40대 초반', height: '160cm대 중반', build: '마른 편', hair: '검은 머리를 짧게 묶음', distinctive: ['짙은 남색 수술복', '왼쪽 손목의 오래된 아날로그 시계'], voice: '낮고 건조하지만 명확함' },
  ),
  'char-mira': supabase(
    '30대 중반. 평균보다 약간 큰 마르고 단단한 체형에, 햇볕에 살짝 그을린 피부와 선명한 눈매가 눈에 띈다. 검은 머리를 뒤로 단단히 묶고, 흙자국이 밴 작업셔츠와 낡은 스포츠시계를 착용한다.',
    { apparentAge: '30대 중반', height: '평균보다 약간 큰 편', build: '마르고 단단한 체형', face: '선명한 눈매와 햇볕에 살짝 그을린 피부', hair: '검은 머리를 뒤로 단단히 묶음', distinctive: ['연한 흙자국이 밴 작업셔츠', '손목의 낡은 스포츠시계'], voice: '낮고 빠르지 않음' },
  ),
  'char-minho': supabase(
    '30대 후반. 180cm 안팎의 단단한 체형에 햇볕에 그을린 피부와 각진 턱을 지녔다. 짧게 밀어 올린 검은 머리와 오른쪽 관자놀이의 오래된 흉터가 눈에 띄며, 목소리는 거칠지만 전달이 빠르다.',
    { apparentAge: '30대 후반', height: '180cm 안팎', build: '단단한 체형', face: '햇볕에 그을린 피부와 각진 턱', hair: '짧게 밀어 올린 검은 머리', distinctive: ['오른쪽 관자놀이의 오래된 흉터'], voice: '거칠지만 전달이 빠름' },
  ),
  'char-jisu': {
    status: 'confirmed',
    publicDescription: '30대 중후반. 168cm쯤의 길고 탄탄한 체형에 햇볕에 살짝 그을린 피부를 지녔다. 턱 아래 길이의 검은 머리를 귀 뒤로 넘기고, 작업복과 등산화 차림으로 현장을 지킨다.',
    sourceRefs: [firstAppearanceSource],
    visual: { apparentAge: '30대 중후반', height: '168cm쯤', build: '길고 탄탄한 체형', face: '길고 선명한 눈매', hair: '귀 뒤로 넘긴 턱 아래 길이의 검은 머리', style: '작업복 바지와 두꺼운 등산화', distinctive: ['장갑', '작은 몽키스패너'], attractiveness: '꾸민 흔적 없이도 선명한 이목구비', voice: '낮고 맑은 목소리' },
  },
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
    auditNote: '현재 공개된 verified RAW와 Canon에서 안정적인 외형 앵커를 찾지 못했다. 다음 의미 있는 공개 장면에서 자연스럽게 확정한다.',
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
