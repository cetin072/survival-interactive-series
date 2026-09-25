export type ChronicleChapter = {
  id: string
  season: 'S01' | 'S02'
  number: number
  title: string
  subtitle: string
  dateLabel: string
  status: 'CANON_NARRATIVE' | 'VERBATIM_PARTIAL' | 'ONGOING'
  sourceNote: string
  paragraphs: string[]
  relatedNodeIds: string[]
}

export const chronicleChapters: ChronicleChapter[] = [
  {
    id: 's01-01',
    season: 'S01',
    number: 1,
    title: '균열',
    subtitle: '서림대학교병원, 모든 것이 조금씩 어긋나기 시작한 날',
    dateLabel: '시즌 1 시작',
    status: 'VERBATIM_PARTIAL',
    sourceNote: '초기 공개 플레이 원문 일부는 회수 가능하지만 시즌 1 전체 RAW는 BACKFILL REQUIRED 상태다.',
    paragraphs: [
      '서진우는 서른두 살의 응급실 간호사였다. 재난이 시작되던 날에도 그는 응급실에 남았다. 정전과 통신장애, 교통사고 환자의 연쇄 유입이 동시에 벌어지면서 병원은 평소의 규칙을 유지한 채로 무너지는 중이었다.',
      '누군가는 전화가 되지 않았고, 누군가는 길에서 멈췄다. 응급실은 돌아가고 있었지만 모든 장비와 시스템이 정상이라는 전제는 빠르게 사라졌다. 진우는 눈앞의 환자를 살리는 일과, 병원 밖에서 무슨 일이 벌어지는지 알아야 한다는 필요 사이에 놓였다.',
      '그는 처음부터 영웅이 되려고 하지 않았다. 그날의 판단은 단순했다. 지금 할 수 있는 일을 하고, 버틸 수 없는 순간이 오기 전에 빠져나올 길을 남겨두는 것. 이후 생존일기의 많은 선택은 이 기준에서 출발했다.',
    ],
    relatedNodeIds: ['char-jinwoo', 'char-seojin'],
  },
  {
    id: 's01-02',
    season: 'S01',
    number: 2,
    title: '병원 밖으로',
    subtitle: '공공시스템이 얇아질수록 개인의 판단이 커졌다',
    dateLabel: '시즌 1 초반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE와 Supabase 사건 기록을 바탕으로 서사화한 정본 요약이다.',
    paragraphs: [
      '병원은 곧바로 사라지지 않았다. 사람도, 조직도, 규칙도 남아 있었다. 문제는 그 모든 것이 조금씩 느려지고, 끊기고, 범위를 줄여가고 있다는 점이었다.',
      '진우는 물과 식량, 이동수단, 귀가와 이탈의 기준을 따로 생각하기 시작했다. 자전거는 자동차보다 느렸지만 도로가 멈춘 뒤에도 움직일 수 있었다. 병원은 중요한 정보원이고 의료 거점이었지만, 끝까지 남아 있어야 할 이유가 되지는 못했다.',
      '그는 공공시스템이 존재한다는 사실과 자신을 끝까지 책임져줄 수 있다는 기대를 분리했다. 이 판단은 이후 거점과 사람을 선택할 때도 그대로 이어졌다.',
    ],
    relatedNodeIds: ['char-jinwoo'],
  },
  {
    id: 's01-03',
    season: 'S01',
    number: 3,
    title: '숨겨진 후방거점',
    subtitle: '서림대학교 북서 실습센터',
    dateLabel: '시즌 1 중반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE 및 Persistent Canon 기반.',
    paragraphs: [
      '서림대학교 북서 실습센터는 화려한 요새가 아니었다. 오히려 눈에 띄지 않는다는 점이 장점이었다. 의료에 쓸 공간이 있고, 비축을 숨길 수 있고, 최소한의 발전과 급수를 유지할 여지가 있었다.',
      '진우에게 중요한 것은 모든 것을 생산하는 거점이 아니라 버틸 수 있는 후방이었다. 빛과 연기, 쓰레기, 출입 흔적을 줄이고, 외부인을 들이는 기준을 만들었다. 생활과 은닉, 의료와 철수 준비가 한 장소 안에서 동시에 굴러가기 시작했다.',
      '실습센터는 시간이 지날수록 단순한 건물이 아니라 관계의 기준점이 됐다. 누가 안으로 들어올 수 있는지, 무엇을 공유하는지, 어떤 정보까지 공개하는지가 곧 신뢰의 깊이를 뜻했다.',
    ],
    relatedNodeIds: ['loc-nw-center', 'char-taehoon', 'char-jinwoo'],
  },
  {
    id: 's01-04',
    season: 'S01',
    number: 4,
    title: '네 사람',
    subtitle: '지휘관이 없는 핵심 4인',
    dateLabel: '시즌 1 중반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Character Bible, Persistent Canon 기반.',
    paragraphs: [
      '윤서진은 의료 판단을 맡았다. 최은채는 물류와 기록, 규칙과 접근권을 정리했다. 장태훈은 발전기와 급수, 부품과 설비를 책임졌다. 그리고 진우는 외부정찰과 응급의료, 정보와 현장 연결을 맡았다.',
      '네 사람은 서진우를 자동으로 지휘관으로 세우지 않았다. 전문영역은 담당자가 판단하고, 모두에게 영향을 주는 큰 결정만 함께 논의했다. 이 구조는 느릴 때도 있었지만 한 사람의 오판이 전부를 끌고 가는 위험을 줄였다.',
      '핵심 4인은 생존일기의 중심 집단이 됐지만, 폐쇄된 가족이나 군대 같은 조직은 아니었다. 서로 가까웠고 서로에게 기대면서도, 각자의 판단과 경계를 유지했다.',
    ],
    relatedNodeIds: ['char-jinwoo', 'char-seojin', 'char-eunchae', 'char-taehoon'],
  },
  {
    id: 's01-05',
    season: 'S01',
    number: 5,
    title: '생산 거점',
    subtitle: '한미라와 북유성 농업기술 실증단지',
    dateLabel: '시즌 1 후반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE 및 Persistent Canon 기반.',
    paragraphs: [
      '북유성 농업기술 실증단지는 실습센터와 전혀 다른 장소였다. 숨기기 어려웠고 넓었으며, 대신 물과 관정, 온실과 종자, 장기생산의 가능성을 가지고 있었다.',
      '한미라는 협력을 받아들였지만 자기 거점의 결정권을 넘기지 않았다. 진우 쪽도 실증단지를 공동재산처럼 다루지 않았다. 처음의 관계는 경제적이고 제한적이었다. 필요한 것을 교환하고, 기술을 빌리고, 서로의 경계를 건드리지 않는 방식이었다.',
      '생산가치가 커질수록 위험도 커졌다. 위치와 관정의 존재가 알려지기 시작했고, 실증단지는 요새가 아니라 지켜야 할 생산기반이 됐다.',
    ],
    relatedNodeIds: ['loc-agri', 'char-mira', 'char-sehoon', 'char-doyoon'],
  },
  {
    id: 's01-06',
    season: 'S01',
    number: 6,
    title: '합병하지 않는 연합',
    subtitle: '두 거점이 서로를 살리는 방식',
    dateLabel: '시즌 1 후반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE 및 Persistent Canon 기반.',
    paragraphs: [
      '실습센터 네 사람과 실증단지 세 사람은 실제로 서로의 거점에 머물며 운영 가능성을 시험했다. 인원이 늘자 방어와 의료, 시설 대응은 좋아졌지만 숙박과 위생, 사생활은 빠르게 한계에 닿았다.',
      '두 거점 사이의 이동에는 약 오십 분이 걸렸다. 문제가 생기면 즉시 달려와 해결해주는 구조는 불가능했다. 각 거점은 첫 삼십 분에서 한 시간을 스스로 버텨야 했다.',
      '결론은 합병이 아니었다. 실증단지는 물과 농업, 생산의 거점으로 남고 실습센터는 은닉과 의료, 비축과 후방복원의 거점으로 남았다. 공동방위와 대량이동, 거점 포기 같은 큰 사안만 함께 판단했다.',
    ],
    relatedNodeIds: ['loc-nw-center', 'loc-agri', 'char-mira', 'char-jinwoo'],
  },
  {
    id: 's01-07',
    season: 'S01',
    number: 7,
    title: '사람은 자원',
    subtitle: '상주하지 않아도 연결은 힘이 된다',
    dateLabel: '시즌 1 후반',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE 및 Persistent Canon 기반.',
    paragraphs: [
      '진우는 사람을 더 많이 데려오는 것과 관계망을 넓히는 것을 같은 일로 보지 않았다. 박민호는 이동형 응급·정보축이었고, 강혜린은 북쪽 의원의 의료 접점이었다. 문하진은 공공 급수와 시설, 최경희는 산림교육원, 배철수와 박재민은 폐시설과 물류를 연결했다.',
      '정민규는 기술을 제공했지만 거점 출입권을 얻지는 않았다. 동천교의 한지수와 서쪽길의 김성호는 지역 통행질서가 어떻게 바뀌는지를 보여주는 접점이 됐다.',
      '관계는 모두 같은 깊이가 아니었다. 연락만 하는 사람, 거래하는 사람, 응급 때 도움을 청할 사람, 위치를 알려줄 사람은 서로 달랐다. 이 구분이 생존의 선택지를 늘렸다.',
    ],
    relatedNodeIds: ['char-minho', 'char-hyerin', 'char-hajin', 'char-mingyu', 'char-kyunghee', 'char-jisu', 'char-seongho'],
  },
  {
    id: 's01-08',
    season: 'S01',
    number: 8,
    title: '겨울 전 갈무리',
    subtitle: '더 넓히지 않고 오래 버티는 쪽으로',
    dateLabel: '2026-11-20',
    status: 'CANON_NARRATIVE',
    sourceNote: 'S01 ARC_ARCHIVE의 시즌 종료 정본.',
    paragraphs: [
      '시즌 1의 끝에서 진우와 핵심 4인은 더 많은 사람과 거점을 무작정 늘리지 않기로 했다. 두 거점과 연락망은 이미 충분히 복잡했다.',
      '다음 목표는 확장이 아니라 지속가능성이었다. 반복되는 재고 관리와 정기접촉은 압축하고, 새로운 관계는 정말 필요한 이유가 있을 때만 깊게 연결하기로 했다.',
      '11월 20일 밤, 겨울 직전의 세계는 아직 완전히 무너지지 않았다. 하지만 이전과 같은 세계도 아니었다. 살아남는 방식이 달라졌고, 그 방식 자체가 다음 계절의 자산이 됐다.',
    ],
    relatedNodeIds: ['char-jinwoo', 'loc-nw-center', 'loc-agri', 'ref-s01-archive'],
  },
  {
    id: 's02-01',
    season: 'S02',
    number: 1,
    title: '붉은 새벽',
    subtitle: '시즌 2는 이미 달라진 세계에서 시작됐다',
    dateLabel: '2026-11-21 06:17',
    status: 'VERBATIM_PARTIAL',
    sourceNote: '시즌 2 오프닝 공개 대화 원문은 일부 회수 가능하다. 현재 Chronicle에는 정본 서사만 먼저 수록했다.',
    paragraphs: [
      '겨울을 준비하기 시작한 바로 다음 날, 다시 이상이 나타났다. 전력과 통신은 안정됐다고 믿기 어려웠고, 붉은 하늘과 비정상적인 무선환경은 단순한 지역 장애로 보기 힘든 징후를 만들었다.',
      '진우는 먼저 실습센터 내부를 확인하고, 옥상과 외부 관측을 거쳐 실증단지와 외부 연락축을 차례로 확인했다. 시즌 1에서 만들어둔 관계망은 이번에는 단순한 인맥이 아니라 서로 다른 지역의 이상을 비교하는 관측망이 됐다.',
      '시즌 2의 시작점은 준비가 무의미해지는 순간이 아니었다. 오히려 준비가 있었기 때문에 더 멀리 보고, 더 늦게 무너질 수 있는 순간이었다.',
    ],
    relatedNodeIds: ['char-jinwoo', 'loc-nw-center', 'char-minho', 'char-hyerin'],
  },
  {
    id: 's02-02',
    season: 'S02',
    number: 2,
    title: '불은 막았지만',
    subtitle: '준비는 사건을 없애지 않고 피해의 모양을 바꿨다',
    dateLabel: '2026-11-22 ~ 11-23',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Supabase scene S02_FIRELINE_HOLD 정본 기반.',
    paragraphs: [
      '서쪽에서 대형화재가 번졌다. 잔존 소방과 행정, 민간망이 함께 움직였고 진우 쪽도 후방에서 대응했다.',
      '불길은 제한됐다. 핵심 거점은 살아남았다. 그러나 실증단지 외곽 온실 한 구간과 관수라인 일부는 실제로 잃었다.',
      '좋은 대응은 사건을 취소하지 않았다. 대신 잃을 것의 크기를 줄였다. 이 경험은 이후 겨울 대응의 기준이 됐다.',
    ],
    relatedNodeIds: ['event-fireline', 'loc-agri', 'char-mira', 'char-taehoon'],
  },
  {
    id: 's02-03',
    season: 'S02',
    number: 3,
    title: '열린 장소, 닫힌 거점',
    subtitle: '두 번째 공공대피시설과 신하영·최유진',
    dateLabel: '2026-11-23',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Supabase scene S02_SECOND_SHELTER 및 현재 캐릭터 정본 기반.',
    paragraphs: [
      '공개 대피시설은 단순히 빈 공간이 있다고 작동하지 않았다. 전기와 급수, 화장실, 식사, 침구와 세탁이 모두 돌아가야 사람이 실제로 머물 수 있었다.',
      '신하영은 조리와 위생, 단체생활의 문제를 봤다. 최유진은 침구와 세탁, 수면공간과 생활물자의 흐름을 봤다. 두 사람은 연합에 들어오지 않았고, 실습센터에 상주하지도 않았다.',
      '그 선택 때문에 오히려 두 사람은 외부 생활세계와 연결된 채 남았다. 진우의 거점이 볼 수 없는 문제를 볼 수 있는 사람들이 된 것이다.',
    ],
    relatedNodeIds: ['event-shelter', 'loc-shelter', 'char-hayoung', 'char-yujin'],
  },
  {
    id: 's02-04',
    season: 'S02',
    number: 4,
    title: '멀리서도 같은 이상',
    subtitle: '광역 관측망이 지역의 경계를 넘어섰다',
    dateLabel: '2026-11-23 ~ 11-24',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Supabase scene S02_WIDE_AREA_LISTENING 정본 기반.',
    paragraphs: [
      '무전 잡음과 적색 발광, 위성항법 이상은 한 지역만의 문제가 아니었다. 여러 외부 접점을 통해 대전 밖 복수 권역에서도 비슷한 전력·통신 이상이 확인됐다.',
      '박민호, 문하진, 한지수, 최경희, 강혜린처럼 서로 다른 생활권에 있는 사람들의 정보가 한 점에서 겹치기 시작했다.',
      '단기 완전복구를 전제로 움직이는 것이 더 위험해졌다. 이제 문제는 언제 정상으로 돌아오느냐가 아니라, 정상이라는 기준 자체가 얼마나 남아 있느냐였다.',
    ],
    relatedNodeIds: ['event-wide-area', 'char-minho', 'char-hajin', 'char-jisu', 'char-kyunghee', 'char-hyerin'],
  },
  {
    id: 's02-05',
    season: 'S02',
    number: 5,
    title: '겨울 비상협의',
    subtitle: '두 거점은 합치지 않고 더 깊게 연결됐다',
    dateLabel: '2026-12-05',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Supabase scene S02_WINTER_EMERGENCY_COUNCIL 정본 기반.',
    paragraphs: [
      '겨울이 깊어지면서 두 거점은 다시 모였다. 선택은 합병이 아니었다. 실습센터와 실증단지는 각자의 재산과 생활, 운영권을 유지했다.',
      '대신 인명과 핵심물자, 설비기술, 비상수용을 서로 백업하기로 했다. 재고는 한곳에 몰지 않았고, 철수기준과 정보망을 미리 나눴다.',
      '연합은 가까워졌지만 경계가 사라진 것은 아니었다. 오래 가기 위해서는 무엇을 함께하고 무엇을 각자 책임질지 더 명확해져야 했다.',
    ],
    relatedNodeIds: ['event-winter-council', 'loc-nw-center', 'loc-agri'],
  },
  {
    id: 's02-06',
    season: 'S02',
    number: 6,
    title: '고립은 한 번에 오지 않는다',
    subtitle: '외부 생활망의 이동·교환·정보·회복이 동시에 약해졌다',
    dateLabel: '2026-12-10',
    status: 'CANON_NARRATIVE',
    sourceNote: 'Supabase scene S02_LIVING_NETWORK_PATTERN_RECOGNITION 정본 기반.',
    paragraphs: [
      '두 거점은 주변보다 안정적이었다. 선제대응의 보상을 받고 있었다. 문제는 거점 바깥이었다.',
      '이동은 느려지고, 교환은 줄고, 정보는 오래되지도 않아 쓸모를 잃었다. 작은 생활시설은 난방과 급수, 세탁과 화장실 같은 기본기능부터 흔들렸다.',
      '추위보다 먼저 모습을 드러낸 것은 고립이었다. 한 장소가 살아남아도 주변의 길과 사람, 거래와 연락이 끊기면 그 거점 역시 선택지를 잃는다.',
    ],
    relatedNodeIds: ['event-network-decay', 'loc-nw-center', 'char-eunchae', 'char-mira'],
  },
  {
    id: 's02-07',
    season: 'S02',
    number: 7,
    title: '생활세계의 수축',
    subtitle: '2027년 1월, 살아 있는 기능을 다시 세어야 하는 시점',
    dateLabel: '2027-01-03',
    status: 'ONGOING',
    sourceNote: 'CURRENT_CHECKPOINT_2027-01-03 및 공개 Runtime 변화 기반. 시즌 진행 중.',
    paragraphs: [
      '1월이 되자 변화는 더 선명해졌다. 일부 공공생활시설은 난방을 유지하지 못해 문을 닫았고, 구급 이송능력은 줄었다. 결빙과 제설자재 부족은 도로를 느리게 만들었다.',
      '산림교육원 아래 교환지는 열리는 횟수가 줄었다. 배철수와 박재민처럼 움직이는 사람들은 더 많은 위험을 감수해야 같은 거리를 이동할 수 있었다. 비상발전기는 상시운전에 가까워지며 소모품과 부품을 먹기 시작했다.',
      '두 번째 공공대피시설은 신규 숙박을 제한했다. 바닥에 자리가 남아 있어도 식사와 물, 세탁과 화장실, 난방과 관리 인력이 부족하면 더 받을 수 없었다.',
      '다음 판단은 단순한 구조가 아니다. 아직 기능이 남은 장소가 무엇인지, 유지할 가치가 있는 연결이 무엇인지, 살릴 수 없다면 사람과 정보와 퇴로 중 무엇을 회수할지 판단해야 한다. 시즌 2는 아직 끝나지 않았다.',
    ],
    relatedNodeIds: ['loc-shelter', 'char-hayoung', 'char-yujin', 'char-minho', 'loc-forest'],
  },
]

export const seasonSummaries = {
  S01: {
    title: 'Season 1 · 균열에서 연합까지',
    description: '병원에서 시작한 서진우가 핵심 4인과 두 거점 연합, 외부 신뢰망을 만드는 과정.',
  },
  S02: {
    title: 'Season 2 · 겨울과 고립',
    description: '이미 준비된 사람들도 피할 수 없는 광역 이상과 겨울, 그리고 외부 생활세계의 수축.',
  },
} as const

/**
 * The publication layer deliberately lives apart from transcriptData.  Its
 * paragraphs are reader-facing prose; RAW records remain in the vault and are
 * never filtered in the DOM to make a chapter.
 */
export type ReaderSourceKind = 'VERIFIED_GM_NARRATIVE' | 'CANON_NARRATIVE' | 'MIXED_VERIFIED_EDITORIAL'

export type ReaderChapter = {
  id: string
  chronicleId: 'C01-HAN-JUNHO' | 'C02-STRONGHOLD' | 'C03-AFTERFALL'
  seasonId: string
  chapterNumber: number
  title: string
  subtitle: string
  dateLabel: string
  paragraphs: string[]
  relatedNodeIds: string[]
  sourceKind: ReaderSourceKind
  sourceRefs: string[]
}

export type ChronicleBook = {
  chronicleId: ReaderChapter['chronicleId']
  protagonist: string
  worldlineId: string
  active: boolean
  title: string
  subtitle: string
  description: string
}

const c01Chapters: ReaderChapter[] = [
  {
    id: 'c01-s01-01', chronicleId: 'C01-HAN-JUNHO', seasonId: 'S01', chapterNumber: 1,
    title: '불길', subtitle: '가족이 흩어진 첫날', dateLabel: '시즌 1', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['seasons/S01/PLAYTHROUGH_CANON.md'], relatedNodeIds: [],
    paragraphs: ['아버지 집 쪽에서 산불이 시작됐을 때, 한준호의 가족은 한곳에 있지 않았다. 그는 각자 최소한의 짐과 물을 챙기게 하고, 라디오와 재난문자로 상황을 확인하며 중간 지점에서 만나기로 했다.', '불길 속으로 깊게 들어가는 대신, 가족이 서로 움직여 빠져나올 수 있는 길을 남겨두는 선택이었다. 그날의 생존은 한 번의 결단이 아니라 연락과 이동, 기다림을 계속 조정한 결과였다.'],
  },
  {
    id: 'c01-s01-02', chronicleId: 'C01-HAN-JUNHO', seasonId: 'S01', chapterNumber: 2,
    title: '다시 떠나는 길', subtitle: '대피는 한 번으로 끝나지 않았다', dateLabel: '시즌 1', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['seasons/S01/PLAYTHROUGH_CANON.md'], relatedNodeIds: [],
    paragraphs: ['도심 아파트에서 합류한 뒤에도 상황은 멈추지 않았다. 산불의 확산, 정전, 교통혼잡과 도로 폐쇄가 겹치자 가족은 친척집과 공식 대피소, 숙박시설 사이에서 다시 이동해야 했다.', '공식 대피소에 남으려던 준호는 아이의 피로와 환경을 우려한 아내의 판단을 받아들였다. 가족의 생존은 한 사람의 계획이 아니라 서로 다른 감각을 듣는 일에서 버텼다.'],
  },
  {
    id: 'c01-s01-03', chronicleId: 'C01-HAN-JUNHO', seasonId: 'S01', chapterNumber: 3,
    title: '남은 집', subtitle: '불이 지나간 뒤에도 끝나지 않는 위험', dateLabel: '시즌 1 끝', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['seasons/S01/PLAYTHROUGH_CANON.md'], relatedNodeIds: [],
    paragraphs: ['불길이 약해진 뒤에는 비가 시작됐다. 불탄 산지의 토사와 산사태 위험이 마을의 복귀를 다시 막았고, 재난의 끝은 복귀 권고보다 오래 남았다.', '도심 아파트는 유지됐고 가족은 모두 살아남았다. 외곽주택의 본채도 남았지만 창고와 주변 산림은 손상을 입었다. 가족의 거주 구조는 잠시 네 사람이 함께 사는 도시의 방으로 바뀌었다.'],
  },
  {
    id: 'c01-s02-01', chronicleId: 'C01-HAN-JUNHO', seasonId: 'S02', chapterNumber: 1,
    title: '단절', subtitle: '두 거점이 서로를 버티게 하는 계절', dateLabel: '시즌 2', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['seasons/S02/RETROSPECTIVE.md'], relatedNodeIds: [],
    paragraphs: ['전력과 통신이 흔들리는 장기재난 속에서 가족은 도심과 외곽의 두 거점을 차례로 다듬었다. 물과 전력, 조리와 공구, 차량과 비축은 한 번에 완성되는 것이 아니라 다음 위기를 기다리는 생활의 뼈대가 됐다.', '좋은 준비가 재난을 없애지는 않았다. 다만 피해를 줄이고, 시간을 벌고, 가족이 다음 선택을 할 여유를 남겼다.'],
  },
]

const c02Chapters: ReaderChapter[] = [
  {
    id: 'c02-01', chronicleId: 'C02-STRONGHOLD', seasonId: '초기', chapterNumber: 1,
    title: '첫 외곽집', subtitle: '혼자 살던 도시의 바깥에서', dateLabel: '초기 기록', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['worldlines/STRONGHOLD/CANON.md'], relatedNodeIds: [],
    paragraphs: ['박도현은 특별한 생존 전문가가 아니었다. 도심의 회사원으로 살며 오래된 시골집과 작은 창고, 소규모 토지를 가진 사람이었다.', '첫 외곽집은 피난처에서 생활의 중심으로 변했다. 그 변화는 거대한 요새를 만드는 일이 아니라, 일상에 필요한 기능을 하나씩 오래 유지하는 일이었다.'],
  },
  {
    id: 'c02-02', chronicleId: 'C02-STRONGHOLD', seasonId: '거점', chapterNumber: 2,
    title: '두 개의 집', subtitle: '붙어 있으되 서로에게 기대지 않는 구조', dateLabel: '2030년 이전', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['worldlines/STRONGHOLD/CANON.md'], relatedNodeIds: [],
    paragraphs: ['도현은 가까운 두 번째 농가주택을 추가로 확보했다. 집중호우가 뒤 사면과 창고를 훑고 지나갔지만, 본채는 남았다.', '두 집은 하나의 생활구역이 되었지만 물과 전력, 저장의 핵심 기능은 각각 독립된 노드로 남았다. 가까이 있는 두 장소가 같은 방식으로 무너지지 않게 하는 선택이었다.'],
  },
  {
    id: 'c02-03', chronicleId: 'C02-STRONGHOLD', seasonId: '관계', chapterNumber: 3,
    title: '연결의 값', subtitle: '친분이 동원이 되지 않도록', dateLabel: '2030년', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['worldlines/STRONGHOLD/CANON.md'], relatedNodeIds: [],
    paragraphs: ['최영수와 강민석, 정우진과 최선희, 한지연은 도현의 세계를 넓혔지만 누구도 그의 조직에 흡수되지 않았다. 각자의 집과 일, 자산과 판단이 남은 상태에서 필요한 기능만 이어졌다.', '도현은 마을의 지도자가 아니라 기술과 거래, 정보와 생산을 잇는 하나의 노드로 남았다. 관계의 깊이는 소유와 통제가 아니라 동의와 정산으로 지켜졌다.'],
  },
  {
    id: 'c02-04', chronicleId: 'C02-STRONGHOLD', seasonId: '새 길', chapterNumber: 4,
    title: '작은 실행사업', subtitle: '불안정한 공급망 사이에서', dateLabel: '2030년 6월', sourceKind: 'CANON_NARRATIVE',
    sourceRefs: ['worldlines/STRONGHOLD/CANON.md'], relatedNodeIds: [],
    paragraphs: ['도현과 지연은 물품과 대체 공급처, 운송수단을 실제로 연결하는 작은 실행사업을 시작하기로 했다. 빠른 확장보다 거래 하나가 끝까지 성사되는지를 확인하는 일이 먼저였다.', '일반 생활은 대체로 정상처럼 보였지만 해운 우회와 예약 중단, 보험료와 운임의 상승은 산업 공급망에 쌓이고 있었다. 도현의 생존은 이제 버티는 기술과 함께, 무엇을 누구와 이어야 하는지를 묻는 일이 됐다.'],
  },
]

const c03ReaderChapters: ReaderChapter[] = chronicleChapters.map((chapter) => ({
  id: 'c03-' + chapter.id,
  chronicleId: 'C03-AFTERFALL',
  seasonId: chapter.season,
  chapterNumber: chapter.number,
  title: chapter.title,
  subtitle: chapter.subtitle,
  dateLabel: chapter.dateLabel,
  paragraphs: chapter.paragraphs,
  relatedNodeIds: chapter.relatedNodeIds,
  sourceKind: chapter.status === 'VERBATIM_PARTIAL' ? 'MIXED_VERIFIED_EDITORIAL' : 'CANON_NARRATIVE',
  sourceRefs: [chapter.sourceNote],
}))

export const readerChapters: ReaderChapter[] = [...c01Chapters, ...c02Chapters, ...c03ReaderChapters]

export const chronicleBooks: ChronicleBook[] = [
  { chronicleId: 'C01-HAN-JUNHO', protagonist: '한준호', worldlineId: 'CANON-V2', active: false, title: '한준호의 생존기', subtitle: '불길과 단절 사이, 가족이 길을 만드는 기록', description: '흩어진 가족이 재난의 길 위에서 다시 만나는 이야기.' },
  { chronicleId: 'C02-STRONGHOLD', protagonist: '박도현', worldlineId: 'STRONGHOLD', active: false, title: '박도현의 생존기', subtitle: '두 집과 독립된 연결의 세월', description: '거점을 키우되 사람을 소유하지 않는 한 남자의 긴 생존기.' },
  { chronicleId: 'C03-AFTERFALL', protagonist: '서진우', worldlineId: 'AFTERFALL', active: true, title: '서진우의 생존기', subtitle: '겨울이 오기 전, 사람과 거점을 잇는 법', description: '무너지는 생활세계에서 서로 다른 기능을 이어 붙이는 현재의 기록.' },
]

export function chaptersForChronicle(chronicleId: ReaderChapter['chronicleId']) {
  return readerChapters.filter((chapter) => chapter.chronicleId === chronicleId)
}

export function chapterForNode(nodeId: string) {
  return c03ReaderChapters.find((chapter) => chapter.relatedNodeIds.includes(nodeId))
}

export function cleanReaderProse(text: string) {
  return text.split('\n').filter((line) => {
    const trimmed = line.trim()
    return trimmed.length > 0
      && !/^(?:\d+[.)]|[ㄱ-ㅎ][.)])\s/.test(trimmed)
      && !/(?:선택해|어떻게 할까\?|다음 행동)/.test(trimmed)
  }).join(' ')
}
