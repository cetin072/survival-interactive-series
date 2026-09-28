# 생존일기 AI-native IP Platform v2.0 — 차기 목표 계획

Status: NEXT_AFTER_ABC
Recorded: 2026-09-28
Notion planning source: https://app.notion.com/p/3e9bd4185ef0814f9b0fe152dc8c165f?pvs=204

## 1. 착수 조건

v2.0은 Automation A/B/C의 실제 E2E 반복 운영이 안정화된 뒤 시작한다.

- A 반복운영 안정화
- B generic real E2E 완료
- C fresh Knowledge E2E 반복 검증
- NOOP / retry / failure recovery
- Production SHA verification
- 기본 privilege/security audit

## 2. 핵심 모델

《생존일기》 전체 Archive는 큰 건물이고, 각 독립 작품/세계관/주인공은 하나의 Chronicle 방으로 관리한다.

- Chronicle 01 — 첫 번째 주인공/세계
- Chronicle 02 — 두 번째 주인공/세계
- Chronicle 03 — AFTERFALL / 서진우
- Chronicle 04+ — 신규 원고, 신규 RPG, 과거 기록 등

AFTERFALL은 플랫폼 자체가 아니라 가장 발전된 세 번째 Chronicle이다.

## 3. 입력 일반화

새 입력은 게임에 한정하지 않는다.

- LIVE_RPG
- LEGACY_RPG
- MANUSCRIPT_IMPORT
- CHAT_IMPORT
- NOTE_IMPORT
- AUDIO_TRANSCRIPT
- 향후 EXTERNAL_CONTRIBUTION

각 입력은 Source Intake Layer를 거쳐 표준 Source 계약으로 변환되고 새 Chronicle이 될 수 있다.

## 4. Source Intake Layer

필수 메타데이터 예:

- source_id
- chronicle_id
- source_class
- title
- creator
- original_ref
- content_hash
- rights
- visibility
- canon_scope
- provenance_mode
- parser_version

Source Intake는 입력 방식을 표준화할 뿐, MANUSCRIPT_IMPORT를 강제로 게임 runtime으로 만들지 않는다.

## 5. 각 Chronicle의 공통 공개 구조

- Reader / 책 읽기
- RAW / 원본 기록
- 세계관
- 인물
- 장소
- 사건
- 타임라인
- 관계 Graph
- 지도
- Visual Archive
- 관련 Knowledge

## 6. 공개 사이트 상위 구조

- Stories / Chronicles
- Knowledge
- Visual Archive
- Maps / Graph
- Tools: XLSX / PDF / Checklist
- Media: 영상 / 웹툰 / 교육자료

Knowledge와 Tools는 여러 Chronicle을 가로질러 재사용 가능한 공용 자산으로 본다.

## 7. Operator Console

공개 Archive와 별도로 운영자 전용 백오피스를 둔다.

- Overview
- Review Inbox
- Chronicles
- Automation A/B/C
- Publications
- Assets
- Costs
- System

핵심 UX는 대시보드 자체보다 Review Inbox다.

## 8. Human Review Queue

자동화 결과는 세 레인으로 나눈다.

- AUTO — 자동 처리/발행
- HUMAN_REVIEW — 운영자 Inbox
- HOLD / REJECT — 발행 안 함

사용자는 정상 처리 로그를 관리하지 않고, 사람 판단이 필요한 예외만 본다.

Review 우선순위:

- P0 즉시 확인 — 잘못된 발행 가능성 / 보안 / Production 불일치
- P1 중요 판단 — 고위험 Knowledge / Canon 충돌
- P2 편집 판단 — Visual Canon / 표현 / 출처 충돌
- P3 참고 — 분류 / 제목 / 경미한 개선

## 9. Automation C 운영 원칙

LOW RISK + verified evidence + Semantic QA + source/copyright gate는 AUTO 후보로 둔다.

의료/응급/약물/물 정화/발전기/CO/전기/구조/법률/근거 충돌/불확실성은 HUMAN_REVIEW로 보낸다.

## 10. Automation B 운영 원칙

안전한 Visual은 자동 생성/게시할 수 있다. 기존 캐릭터 외형 충돌, Canon 불확실, 스포일러, 대표 이미지 교체, 품질/스타일 충돌은 HUMAN_REVIEW로 보낸다.

## 11. 최종 사용자 경험

평소에는 사용자가 게임을 하거나 새 이야기를 입력한다.

가끔 Operator Console에 들어가 검토 필요, 자동화 오류, 보안 알림, 비용 알림만 확인하고 승인/수정/보류/반려한다.

## 12. v2.0 정의

v1.0: 게임 플레이를 IP 자산으로 컴파일하는 시스템.

v2.0: 여러 생존 이야기를 Chronicle로 받아 세계관·소설·비주얼·현실 지식·도구·미디어로 파생시키는 AI-native IP 플랫폼.

## 13. 재개 트리거

사용자가 이후 **“2.0 진행해보자”** 또는 **“생존일기 v2.0 만들자”**라고 말하면 이 문서를 차기 기준으로 사용한다.

그 시점에 A/B/C 최신 상태를 재검수하고 실제 구현 로드맵으로 세분화한다.