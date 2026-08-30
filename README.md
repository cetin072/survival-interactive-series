# Survival Interactive Series

가칭 **《생존기록》** — 현대 가족 중심의 현실형 생존 인터랙티브 드라마.

## 현재 상태
- S01~S05 첫 플레이 완료.
- S01~S05 중간점검 완료: `docs/MIDTERM_REVIEW_S01_S05.md`
- Runtime: **v4**
- Thin Engine 기본설계: `docs/THIN_ENGINE_SPEC_V0_1.md`
- Thin Engine 웹게임 구현설계: `docs/THIN_ENGINE_WEB_GAME_V0_1.md`
- 다음 단계: **Thin Engine Web v0.1 구현 → S01 회귀테스트 → S06 웹 플레이**
- S06 상태: `READY FOR HIDDEN WORLD SEED`, 단 엔진 회귀테스트 전까지 Seed 생성 보류

현재 프로젝트는 핵심 게임 시스템 탐색을 상당 부분 마쳤고, **AI GM의 기억·상태·표현 부담을 줄이는 얇은 웹엔진 구현 단계**로 진입한다.

## 목표
- 재미와 몰입이 0순위.
- 가족 4인을 실제 파티처럼 운영.
- 현실적인 재난·사회·거점·정보·경제 압력을 경험.
- 플레이 중 강의하지 않고 시즌 종료 후 원할 때만 복기.
- 시즌 길이와 전개는 고정 대본보다 실제 플레이 완성도를 따른다.
- 좋은 준비는 실제 보상하되, 모든 목표의 무손실 보존이 매번 기본값이 되지는 않게 한다.

## 핵심 재미
1. 가족 운영
2. 거점 성장
3. 이해관계 기반 협업
4. 플레이어와 독립적으로 움직이는 세계 압력
5. 무엇을 우선하고 무엇을 포기할지 결정하는 비싼 선택

## 현재 플레이 구조
- 장기 기록/설계: GitHub
- AI GM: ChatGPT/OpenAI 모델
- 플레이어: 숫자 선택 + 복수선택 + 자유행동
- 세계구상/기획: 사용자 + AI

Thin Engine Web v0.1부터는:
- **프로그램**: Live State + Action Queue + Validator + MUD Renderer + Cloud Save
- **AI GM**: 세계·인물·사건·선택·즉흥반응
- **플레이어**: 판단
- **GitHub**: 장기 Canon/시즌 종료 기록

핵심:
`AI proposes, engine commits.`

## Thin Engine Web v0.1
설치형 앱이 아니라 **인터넷 연결만 있으면 URL로 접속하는 개인용 웹게임**을 목표로 한다.

기본 목표:
- PC/모바일 브라우저
- 숫자 버튼/키보드 숫자
- 복수행동
- 자유 자연어 입력
- MUD 텍스트 UI 자동 렌더링
- 개인 접근코드
- PC↔모바일 Cloud Save
- AI GM의 State Proposal을 Validator가 검사한 뒤 Commit

권장 구현:
- React + TypeScript + Vite
- Netlify Hosting + Functions + Blobs
- OpenAI API는 서버 Function에서만 호출

v0.1에는 회원가입·멀티유저·결제·공개서비스·AI 삽화 자동생성·복잡한 게임서버를 넣지 않는다.

## 새 채팅 시작점 — 기존 ChatGPT 플레이
기존 ChatGPT GM 방식으로 플레이할 경우 **`START_HERE.md` 하나부터** 읽는다.

### 실제 플레이 기본 로드
1. `runtime/GM_KERNEL.md`
2. `core/CHARACTERS.json`
3. `core/PERSISTENT_CANON.md`
4. `players/main/SAVE_STATE.json`

진행 중인 시즌을 이어갈 때만 해당 `GM_STATE.json`을 추가한다.
나머지 문서는 `runtime/LOAD_MAP.md`에 따라 필요할 때만 읽는다.

## Source of Truth
이 저장소가 장기 설정·세이브·시나리오 기록의 원본이다.

우선권 핵심:
- 플레이 운영 핵심 → `runtime/GM_KERNEL.md`
- 캐릭터 최신값 → `core/CHARACTERS.json`
- 지속 세계/거점/관계 → `core/PERSISTENT_CANON.md`
- 현재 공개 장기 상태 → `players/main/SAVE_STATE.json`
- 현재 시즌 숨은 상태 → 해당 시즌 `GM_STATE.json`
- 웹게임 실행 중 순간 상태 → Thin Engine Cloud Live State

GitHub는 웹게임의 매턴 실시간 DB로 사용하지 않는다.

## 구조
- `runtime/` : 실제 플레이에 필요한 경량 GM 계층
- `core/` : 최신 캐릭터·Persistent Canon + 장기 설계 참조
- `players/` : 현재 SAVE, CHECKPOINT, 로그
- `seasons/` : 시즌별 상태, 실제 플레이 Canon, 회고
- `docs/` : 상세 규칙·모듈·중간점검·Thin Engine 설계
- `engine/` : Thin Engine Web 구현 예정 영역
- `schemas/` : JSON 형식 검증
- `tools/` : SAVE/현재 시즌 상태 검증
- `playtests/` : 과거 테스트 기록
- `idea_vault/` : 미래 아이디어
- `knowledge/` : 현실 검증 자료

## 확정 구현 순서
1. Web Shell
2. State Engine
3. Validator
4. Cloud Save + 개인 접근코드
5. MUD Renderer
6. AI GM Integration
7. S01 「불길」 일부 회귀테스트
8. S06 신규 웹 플레이

S01 회귀테스트가 끝나기 전에는 S06 Hidden World Seed를 만들지 않는다.

## 운영 원칙
- 규칙을 많이 읽는 것이 정확성이라고 보지 않는다.
- 새 문제가 생길 때마다 규칙을 추가하지 않는다.
- 먼저 GM_KERNEL의 기존 규칙으로 해결한다.
- GitHub는 매 턴 저장장치가 아니라 장기 기억용이다.
- 최근 시즌과 같은 재난 이름뿐 아니라 같은 **플레이 행동 루프**의 반복도 피한다.
- 개발 목적은 플레이를 편하게 하고 오류를 줄이는 것이다.
- 개발 자체가 플레이보다 커지면 기능 확대를 멈춘다.

## 주의
저장소는 Public이다. 실제 주소·전화번호·계정정보·API 키·비밀번호·토큰·개인 접근코드 등 민감정보를 저장하지 않는다.
