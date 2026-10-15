# 생존가방 지식 자동 집필 V2 — 검수와 분리한 1시간 주기

- 확정일: 2026-10-15 KST
- 현재 원본 저장소: `cetin072/survival-interactive-series`
- 집필용 브랜치/PR: `feat/bag-side-item-knowledge-template-v1` / #525 (OPEN Draft 유지)
- 운영자 글감함: `/operator/knowledge/#bag-knowledge-draft-inbox` (구현 Draft PR #566; 별도 승인·배포 필요)

## 집필 계약

1. **1시간마다 물품 한 편**을 신규 집필하여 `docs/bunker_os/bag_knowledge/GUIDE_XX_DRAFT_V01.md`에 기록한다. 총 49편을 채울 때까지 사용자 검수/승인 지연과 검수 대기 수량은 중단 조건이 아니다. 예약 task는 기존 `6acd68c6544c8191a28d0681b8249c9e` 한 개를 재사용한다.
2. **원고의 기준은 사용자가 읽고 확정한 8편(guide-01~07/43)과 `ITEM_ARTICLE_TEMPLATE_V1.md`**. 제목 질문에 첫 문장 직접 답 → 구체적 생활 상황 → 실용적 선택·사용·관리 → 30초 점검 → 이어 읽기 → 공식 근거. 상투적 경고를 줄이되 실제 위험을 바꾸는 중요한 주의는 보존한다.
3. `DRAFT_QUEUE_V1.json`은 **집필 브랜치가 작성 현황·다음 ID의 단일 권위**이다. `maxPendingIndependentReview=49`는 실제 대기 제한을 뜻하지 않으며 `writingPolicy.reviewBacklogBlocksWriting=false`를 권위로 적용한다. 새 품목 등록에는 id, file, catalogName, status PENDING_INDEPENDENT_REVIEW와 nextCandidate를 저장한다.
4. 새 원고 저장은 GitHub file create → readback → 최신 queue SHA update → queue readback 순서다. 기존 파일이 이미 있으면 새로 쓰지 말고 queue만 복구한다. GitHub 차단/권한 오류는 WRITE_BLOCKED로 기록하고 다른 계정·권한 경계 우회를 시도하지 않는다. 예약 실행 시 실제 GitHub 쓰기 성공은 별도 확인해야 한다.
5. **자동 집필은 자동 공개가 아니다.** 미검수 원고는 계속 GitHub Draft에서 누적하며, Operator 화면은 읽기 전용 보관함이다. 사용자 검수 후 별도 정확한 원고 ID·SHA·근거 검증을 거쳐 **main 승인 목록**을 수정·게시할 수 있다. 집필 예약은 main/프론트엔드 산출물/검색색인/시스템 앱/Automation C를 절대 수정하지 않는다.
6. 보존/검수/출판 상태는 다를 수 있다. 과거 8편은 [#540](https://github.com/cetin072/survival-interactive-series/pull/540)로 사용자 승인 후 게시 절차 완료, 새 원고는 최초 DRAFT. 집필용 브랜치가 이미 병합된 8편을 재작성하지 않는다.
7. **공개 GitHub 한계:** 원고는 아직 홈페이지 독자용으로 게시되지 않지만 공개 저장소의 파일 자체를 암호화된 비공개 보관함이라고 표현하지 않는다. 고유 개인정보·비밀값은 원고에 저장 금지. 완전 비공개 원고가 필요하면 별도의 권한·스토리지 설계를 사전 검증한다.

## 현재 체크포인트

- 2026-10-15: guide-01~08, guide-43 원고 총 **9편**. 8편은 프론트 공개 승인 기록, guide-08은 검수 대기.
- **다음은 guide-09 여벌 양말**. 남은 40편.
- 차기 집필 예약: 2026-10-15 18:00 KST부터 매 1시간. 첫 예약 성공 여부는 실제 GitHub 커밋/readback으로만 판정한다.
- Operator 백엔드 목록은 main 승인 manifest와 PR #525의 Draft queue를 **읽기 전용으로 교차 표시**하고, 새 원고를 매번 코드를 배포하지 않아도 목록/상세에서 볼 수 있도록 개발 중이다. PR #566은 Preview와 CI 확인 후 별도 병합/정식 배포.
