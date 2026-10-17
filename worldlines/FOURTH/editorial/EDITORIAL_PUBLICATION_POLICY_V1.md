# C04 편집·출판 및 게시 후 개정 규칙 V1

상태: EDITORIAL_DRAFT_NOT_APPROVED — 비공개 원고, 자동 발행 불가.

**RAW는 실제 플레이 증거이고 이미 저장됐으므로 수정·삭제하지 않는다.** 사용자가 요청한 과거 장면 교정은 출판 전 **편집 소설 본문**에서 수행한다. 다음의 층위를 혼동하지 않는다.

- RAW: `survival_rpg.transcript_messages`의 정확한 USER/GM 기록.
- 독자용 소설: `S01_ATTEMPT02_CH01_DRAFT_V1.md` 및 `S01_ATTEMPT02_EDITS_V1.json`. `EDITED_NARRATIVE`로 명시하며 편집 전후와 출처 메시지 ID·SHA를 보존한다.
- 생존지식: 독립적인 현실 정보 문서. 작품은 소재·사례일 뿐 과학·안전의 근거가 아니다. 기존 `knowledge/content/briefs/K-xxx.json`의 출처·위험·사람 검수 절차를 유지한다.

## 소스와 범위

활성 게임의 두 번째 시도 세션: `557a7f18-b172-4f72-b1c5-98799d7bacf6`.
이번 편집본에는 GM turn **0, 1, 3**을 사용한다. turn 2는 캐릭터 기획 협의로 제외하되 RAW에는 남긴다.
첫 번째 시도 `5a0b633d-dc06-4db2-bab2-ff4fbf392b04`는 초고로 보존하고 현재 이야기와 섞지 않는다.
플레이어 선택·시간·재고·인물 관계·Canon은 편집본으로 변경하지 않는다.

## C04 Reader에 나중에 연결할 때

기존 Reader 정책 `docs/READER_EDITION_PUBLICATION_POLICY.md`는 `VERIFIED_GM_NARRATIVE` 본문 재작성 금지다.
따라서 이 편집 소설을 **`VERIFIED_GM_NARRATIVE`라고 허위 표시하지 않는다.**
출판 연결 시 `EDITED_NARRATIVE`라는 **별도 명시적 타입**, 출처 대조, 변경 내역, 사람 승인, Preview/CI를 적용해야 한다. 기존 C01~C03 공개·자동화를 변경하지 않는다.

## 게시 후 재편집

고정 콘텐츠 ID·URL을 유지하며 rev1 → rev2처럼 **승인된 새 버전**만 게시한다.
이전 게시본, 소스 SHA, 변경 이유, 승인/배포 기록은 보존한다. 표현/오탈자 교정은 서사 Canon이나 RAW를 바꾸지 않는다.
현실 생존지식 글은 동일 Brief ID/slug의 개정안을 기존 Operator 편집·QA·근거 검증 경로에서 재승인해 배포한다.
기존 `KnowledgeDraftEditor`를 활용할 수 있으나 **C04 공개 연결, 실제 사이트 내 편집 UI, 자동 재배포는 현재 미구현**이다.
공개 시점 전에 실제 편집/재발행 회귀 테스트를 해야 한다.

## 발행 게이트

`DRAFT → HUMAN_REVIEWED → APPROVED → PUBLISHED` 순서. 현 단계는 **DRAFT**.
편집본을 BOOK/Reader/지식 자동화 입력으로 연결하거나 `main` 병합·배포하지 않는다.
