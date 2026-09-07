# STRONGHOLD — RAW Archive Manifest

Status: **ACTIVE / IP PRESERVATION TRACKER**

목적: 장기 세계선의 실제 플레이 채팅 원문이 GitHub Cold Archive로 얼마나 보존됐는지 추적한다.
이 파일은 정상 플레이 부팅 입력이 아니다.

## 원칙
- USER와 GM이 실제 주고받은 공개 원문은 장기 IP 자산이다.
- 요약/Canon/상태 파일은 RAW 원문을 대체하지 않는다.
- 정상 플레이 때 RAW 전체를 읽지 않는다.
- 기억·요약으로 빠진 대사를 재구성하지 않는다.
- 과거 RAW 백필 완료를 플레이 재개 조건으로 만들지 않는다.
- 신규 플레이는 큰 장/방 종료 시 `STATE_PROTOCOL.md` 기준으로 가능한 범위에서 Cold Archive 처리한다.

## 보존 상태

| 범위 | RAW 상태 | 운영/사실 기록 | 조치 |
|---|---|---|---|
| Canon v2 S01 (별도 가족 세계선) | COMPLETE | `seasons_v2/S01/*` | 성공 사례로 참고. STRONGHOLD와 상태 혼합 금지 |
| STRONGHOLD 초기~2031-02 | NOT AUDITED / BACKFILL REQUIRED | `CANON.md`, `LEDGER.md`, 과거 체크포인트 | 정확한 원 채팅 접근 시 중요한 방부터 선택 백필 |
| STRONGHOLD 2031-02~03 정전·침입 | PARTIAL / BACKFILL REQUIRED | `ROOM_ARCHIVE_2031_02_TO_2031_03.md` | 정확한 원문 확보 시 PART 생성 |
| STRONGHOLD 2031-03~2032-01 산불/후일담 | PARTIAL / BACKFILL REQUIRED | `ROOM_ARCHIVE_2031_03_TO_2032_01.md` | 정확한 원문 확보 시 PART 생성 |
| STRONGHOLD 2032-03 ACTIVE 장면 이후 | MANDATORY AT CLOSE | `LIVE_SCENE_STATE.md`, 이후 상태/장부 | 방/큰 장 종료 시 정확히 접근 가능한 공개 원문을 Cold Archive 대상으로 처리 |

## RAW COMPLETE 판정
한 분기/방을 COMPLETE로 바꾸려면:
1. 시작부터 종료까지 USER/GM 공개 대화 순서 확인
2. 짧은 선택·자유행동·장기 가치가 있는 메타 피드백 포함
3. 확인 불가 구간 임의 재구성 없음
4. 시스템/개발자/비공개 내부추론/tool 로그 없음
5. 게임 외 개인정보·민감정보 검수
6. `raw_transcript/INDEX.md` 읽기 순서 연결

하나라도 충족하지 못하면 COMPLETE로 표시하지 않는다.

## Backfill 원칙
- 사용자에게 기억으로 과거 선택을 재현시키지 않는다.
- Archive/Canon을 RAW 문장으로 변환하지 않는다.
- 원 ChatGPT 대화 또는 정식 export 등 정확한 텍스트 소스가 확보됐을 때만 백필한다.
- 확보 전에는 원 대화방을 1차 원본으로 보고 GitHub는 `BACKFILL REQUIRED`로 유지한다.

## IP 확장 시
1. CURRENT_STATE/Canon으로 사실관계 확인
2. 필요한 사건 범위 RAW만 조회
3. 실제 대사·반응·선택·장면 리듬 복원
4. 매체별 각색 후보 추출

RAW는 `실제 플레이가 어떻게 살아 있었는가`, Canon/State는 `무엇이 사실로 남았는가`를 각각 보존한다.
