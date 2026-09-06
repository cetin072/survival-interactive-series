# STRONGHOLD — RAW Archive Manifest

Status: **ACTIVE / IP PRESERVATION TRACKER**

목적: 장기 세계선의 모든 플레이 채팅 원문이 실제 GitHub Cold Archive로 보존됐는지 추적한다.

이 파일은 정상 플레이 부팅 입력이 아니다. 시즌/분기 종료 후 아카이빙 검수와 향후 IP 확장 때 사용한다.

## 장기 원칙

- 사용자와 GM이 실제 주고받은 공개 원문은 장기 IP 자산이다.
- 요약/Canon/상태 파일은 원문 대체물이 아니다.
- 원문은 소설·웹툰·게임·드라마/영상 등으로 확장할 때 장면, 말투, 선택의 맥락, 당시 감정선, 우연한 디테일을 복원하기 위해 보존한다.
- 정상 플레이 때는 RAW를 읽지 않는다.
- 기억으로 RAW를 재구성하지 않는다.

## 보존 상태

| 범위 | RAW 상태 | 운영/사실 기록 | 조치 |
|---|---|---|---|
| Canon v2 S01 (별도 가족 세계선) | COMPLETE | `seasons_v2/S01/*` | 참고용 성공 사례. `raw_transcript/PART_001~009` 보존 완료 |
| STRONGHOLD 초기~2031-02 | NOT AUDITED / BACKFILL REQUIRED | `CANON.md`, `LEDGER.md`, 과거 체크포인트 | 정확한 원 채팅 접근 시 방 단위 RAW 추출 필요 |
| STRONGHOLD 2031-02~03 정전·침입 | PARTIAL / BACKFILL REQUIRED | `ROOM_ARCHIVE_2031_02_TO_2031_03.md` | 원문 확보 후 PART 생성 |
| STRONGHOLD 2031-03~2032-01 산불/후일담 | PARTIAL / BACKFILL REQUIRED | `ROOM_ARCHIVE_2031_03_TO_2032_01.md`, `FEEDBACK_2031_WILDFIRE_ARC.md` | 원문 확보 후 PART 생성 |
| STRONGHOLD 다음 분기부터 | MANDATORY AT CLOSE | `ARC_CLOSE_PROTOCOL_V1.md` | 종료 응답에서 RAW 처리 자동 실행 |

## 완료 판정

한 분기/방을 `RAW COMPLETE`로 바꾸려면:

1. 시작부터 종료까지 USER/GM 공개 대화 순서가 확인됨
2. 짧은 선택/자유행동/메타 피드백까지 포함됨
3. 확인 불가 구간을 임의 재구성하지 않음
4. 비공개 시스템/개발자/내부추론/tool 로그가 없음
5. 게임 외 개인정보/민감정보 검수 완료
6. `raw_transcript/INDEX.md`에서 읽기 순서가 연결됨

하나라도 충족하지 못하면 COMPLETE로 표시하지 않는다.

## Backfill 원칙

과거 원문이 현재 컨텍스트에 없을 경우:

- 사용자에게 기억으로 다시 선택을 재현시키지 않는다.
- 요약 파일을 원문으로 변환하지 않는다.
- 원 ChatGPT 대화 또는 공식 export 등 정확한 텍스트 소스가 확보되면 자동 추출한다.
- 확보 전에는 원 대화방 자체를 1차 원본으로 취급하고 GitHub 상태를 `BACKFILL REQUIRED`로 명시한다.

## IP 확장 시 사용법

1. Canon/Current State로 사실관계를 먼저 확정
2. 필요한 사건 범위의 RAW PART만 읽음
3. 실제 대사·반응·선택·장면 리듬을 복원
4. IP_PACKAGE에서 각색 후보를 추출
5. 소설/웹툰/게임/영상 매체에 맞게 재구성

RAW는 `그때 실제 플레이가 어떻게 살아 있었는가`를 보존하는 원재료이며, Canon은 `무엇이 사실로 남았는가`를 보존한다.
