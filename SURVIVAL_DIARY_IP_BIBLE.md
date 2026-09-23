# 《생존일기》 IP Bible — Chronicle Registry

Status: AUTHORITATIVE IP-LEVEL IDENTITY REGISTRY

이 문서는 《생존일기》 IP 전체에서 주인공 연대기와 독립 worldline의 정체성을 관리한다.
개별 worldline의 현재 상태나 세부 캐논을 복제하지 않는다.

## 1. Chronicle order

Chronicle 번호는 작품/IP에서 주인공이 등장한 순서를 뜻한다.
인게임 연도순이나 동일 우주의 시간순을 뜻하지 않는다.

### Chronicle 01 — 한준호
- Protagonist: 한준호
- Runtime family: 서윤 / 민석 / 정호
- Runtime class: Legacy / default family chronicle
- Primary sources: core/*, players/main/*, canon_v2/*, seasons/*
- Identity: 가족 단위 생존과 장기 의사결정을 중심으로 한 최초 연대기

### Chronicle 02 — 박도현
- Protagonist: 박도현
- Worldline: STRONGHOLD
- Branch: worldline/stronghold-chronicle
- Root: worldlines/STRONGHOLD/
- Identity: 한준호 가족 연대기와 현재 상태를 공유하지 않는 독립 주인공 연대기

### Chronicle 03 — 서진우
- Protagonist: 서진우
- Worldline: AFTERFALL
- Branch: worldline/afterfall-rpg
- Root: worldlines/AFTERFALL/
- Runtime source of truth: Supabase survival_rpg.saves / worldline_id=AFTERFALL
- Identity: 문명이 무너지는 과정에서 시작해 무정부와 포스트아포칼립스의 새 지역질서까지 통과하는 독립 주인공 연대기

## 2. Worldline isolation

각 Chronicle은 별도 현재상태를 가진다.

- 다른 Chronicle의 인물·가족·재고·거점·관계를 current-state fallback으로 섞지 않는다.
- 비슷한 재난 이미지나 주제가 있어도 동일 사건·동일 원인으로 자동 연결하지 않는다.
- crossover는 명시적인 별도 기획 결정 전까지 비활성이다.
- 정확한 runtime routing은 WORLDLINE_ROUTER.md가 담당한다.

## 3. Source responsibility

### 이 문서
IP 전체의 주인공 순서와 worldline 정체성.

### WORLDLINE_ROUTER.md
어떤 branch / directory / boot를 읽어야 하는지 결정.

### 각 worldline BOOT / START_ROOM
해당 게임의 부팅 규칙.

### 각 worldline Canon / Bible
지속 설정과 세계·캐릭터의 불변 규칙.

### Supabase
AFTERFALL처럼 연결된 worldline의 살아 움직이는 현재 상태와 사건 이력.

### Season Archive
이미 끝난 시즌의 역사와 제작/IP 재사용 자료.

## 4. New Chronicle rule

새 주인공 연대기가 생기면 이 문서에 먼저 다음만 등록한다.

- Chronicle number
- protagonist
- worldline
- branch
- root directory
- current runtime source
- 한 문장의 정체성

세부 설정은 여기에 중복해서 넣지 않는다.

## 5. Current IP identity

현재 확인된 주인공 계보:

1. 한준호
2. 박도현
3. 서진우

서진우는 AFTERFALL worldline의 주인공이며 《생존일기》 IP의 세 번째 주인공이다.
