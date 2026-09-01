# Season Completion Pipeline — Canon v2 / v3

Status: ACTIVE  
Scope: 정식 《생존일기》 Canon v2 시즌 종료

## 목적

시즌 종료 때 사용자가 별도 문서노동을 하지 않아도:

- 실제 플레이 원문
- 실제 발생 Canon
- 다음 시즌 지속상태
- 현실 생존 복기
- 제작 복기
- IP 재사용 자산
- 다음 시즌 인수인계

가 서로 섞이지 않은 상태로 남게 한다.

핵심 원칙:

> **원문은 보존하고, Canon은 압축하고, 다음 시즌은 가볍게 시작한다.**

Legacy Prototype Timeline의 `seasons/Sxx`, `players/main/SAVE_STATE.json`, `players/main/GM_STATE` 등은 정식 Canon v2의 현재 종료 경로가 아니다. Legacy 자료는 역사·설계 참고용으로 유지한다.

---

# TIER 1 — 정식 시즌에서 반드시 하는 종료 처리

사용자가 `시즌 종료`, `시즌 종료 처리`, `복기 후 종료`처럼 종료 의사를 명확히 하면 가능한 한 **그 시즌 플레이 채팅을 떠나기 전에** 아래 절차를 한 번에 처리한다.

## 1. RAW TRANSCRIPT Cold Archive

가장 먼저 그 시즌 채팅에서 실제 확인 가능한 원문을 확보한다.

기본 경로:

`seasons_v2/Sxx/raw_transcript/`

권장 구조:
- `INDEX.md`
- `PART_001.md`
- `PART_002.md`
- ...

원문이 짧으면 `RAW_TRANSCRIPT.md` 단일 파일도 허용한다.

보존:
- 실제 USER 입력
- 실제 GM 출력
- 가족 대사
- 선택지
- AUTO 진행
- 시즌 제작에 의미 있는 실제 플레이 중 메타 피드백

금지:
- 시스템 프롬프트
- 개발자 지침
- 비공개 chain-of-thought / 내부 추론
- 당시 비공개 Hidden World Seed 내용
- Tool 내부 로그
- API key / password / token
- 게임과 무관한 개인정보·민감정보

접근할 수 없는 구간은 기억으로 복원하지 않고 `[원문 확인 불가 구간]`으로 표시한다.
공개 저장소에 부적절한 실제 개인식별정보가 섞이면 필요한 부분만 `[REDACTED]` 처리한다.

상세 정책:
`docs/RAW_TRANSCRIPT_ARCHIVE_POLICY.md`

중요:

> Raw는 Cold Archive이며 정상 시즌 부팅 입력이 아니다.

시즌 수십 개가 쌓여도 다음 시즌 GM은 Raw 전체를 읽지 않는다.

## 2. PLAYTHROUGH CANON

실제로 일어난 사건만 압축한다.

기본 경로:

`seasons_v2/Sxx/PLAYTHROUGH_CANON.md`

포함:
- 시작 상황
- 큰 선택
- 중요한 결과
- 가족/관계/거점 변화
- 장기 사건 흐름
- 엔딩/새 안정상태

원문을 매끈하게 다시 쓰는 문서가 아니라 다음 기록층의 사실 근거다.

## 3. END STATE + Persistent Canon

구조화 종료상태:

`seasons_v2/Sxx/END_STATE.json`

다음 시즌에도 지속되는 사실:

`canon_v2/PERSISTENT_CANON.md`

승격 대상 예:
- 가족 성장
- 거점 역할 변화
- 지속 장비/비축 방식
- 관계 변화
- 장기 손실·비용
- 사회·인프라의 지속 변화

일회성 장면이나 임시 수량을 모두 Persistent Canon으로 올리지 않는다.

기존 사실이 바뀌지 않았다는 이유로 실수로 삭제하지 않는다.

## 4. Post-Season Survival Debrief

기본 경로:

`seasons_v2/Sxx/SURVIVAL_DEBRIEF.md`

기준:
`docs/POST_SEASON_SURVIVAL_DEBRIEF_V1.md`

플레이어의 실제 선택을 바탕으로:
- 잘한 판단
- 위험하거나 혼합적이었던 판단
- 놓친 요소
- 운과 판단의 구분
- 현실에서 개선할 준비
- 시즌 핵심 생존지식

을 정리한다.

현실 생존 사실은 `knowledge/SOURCES.md`의 공식·검증된 Source를 우선한다.
종합 점수는 기본값으로 사용하지 않는다.

## 5. 제작/GM 복기

기본 경로:

`seasons_v2/Sxx/RETROSPECTIVE.md`

플레이어 생존교육과 분리한다.

검토:
- 재미·몰입
- 캐릭터성
- 긴박감
- 선택 비용
- 가족 자율성
- 정보 불확실성
- 반복성
- 세계 변화
- GM/State/Validator 오류
- 다음 시즌에서 유지하거나 고칠 점

반복 문제만 장기 규칙 승격 후보로 삼는다.

## 6. IP PACKAGE

정식 시즌에서 각색 가치가 있으면 생성한다.

기본 경로:

`seasons_v2/Sxx/IP_PACKAGE.md`

기준:
`docs/IP_ASSET_PIPELINE.md`

역할:
- 한 줄 로그라인
- 강한 장면
- 캐릭터 아크
- 주요 결정과 결과
- 재사용 가능한 사건 원형
- 매체별 각색 가치

전체 대화 원문을 중복 복사하지 않는다. 전체 원문은 Raw Archive가 담당한다.

자산 흐름:

> **RAW TRANSCRIPT → CANON → IP PACKAGE → 반복 검증 시 LIBRARY**

## 7. 다음 시즌 START HANDOFF + START STATE

다음 시즌은 과거 전체 로그를 읽지 않고 시작할 수 있어야 한다.

기본:
- `seasons_v2/S(next)/START_HANDOFF.md`
- `seasons_v2/S(next)/START_STATE.json`

Handoff에는 최소:
- 직전 시즌 종료 세계상태
- 가족의 지속 성장·현재 역할
- 거점/차량/자원 핵심 상태
- 지속 관계
- 다음 시즌이 반드시 기억할 사실
- 반복하면 안 되는 최근 핵심 행동루프
- `presentation_profile: MUD_TEXT_V1` 또는 동등한 명시

를 압축한다.

미래 재난의 정체, 정답 루트, 확정 엔딩은 Handoff에 미리 쓰지 않는다.
새 시즌 Hidden World Seed는 실제 플레이 시작 직전에 비공개로 생성한다.

---

# TIER 1 완료 Gate

정식 시즌은 다음이 확인되면 완전히 종료된 것으로 본다.

- Raw Transcript가 실제 확인 범위 기준으로 보존됨
- 누락 구간이 있으면 명시됨
- 공개 저장소 개인정보/비공개 내부정보 검사 완료
- PLAYTHROUGH_CANON 정리 완료
- END_STATE 생성 완료
- Persistent Canon의 지속사실 반영 완료
- 생존 복기 완료 또는 명시적 보류
- 제작 복기 완료 또는 명시적 보류
- 필요한 IP Package 생성 또는 보류 결정
- 다음 시즌 START_HANDOFF / START_STATE 준비
- Raw가 정상 부팅 입력에 포함되지 않음
- 변경에 대한 저장소 검증/CI가 존재하면 성공

사용자는 이 파일들을 직접 복사·작성할 필요가 없다.

---

# Raw Archive 병합 운영

Raw Transcript 보관 작업은 `docs/RAW_TRANSCRIPT_ARCHIVE_POLICY.md`의 안전 Gate를 따른다.

실제 대화만 보존되고, 개인정보·비공개 내부정보 문제가 없고, 기존 Canon을 임의 수정하지 않았고, CI와 mergeability가 정상이라면 AI가 독립 검수 후 Raw Archive PR을 `main`까지 마무리할 수 있다.

다음 경우에는 자동 병합하지 않는다.
- 개인정보 판단이 불명확함
- Raw와 승인 Canon 사이 중대한 모순
- 비공개 내부정보 포함 가능성
- 예상하지 않은 코드/엔진/UI 변경
- CI 실패 또는 merge conflict
- 원문 접근 범위를 신뢰할 수 없음

Canon 내용 자체의 변경은 Raw 자동병합 규칙으로 우회하지 않는다.

---

# TIER 2 — 필요할 때만 하는 시나리오 정제

다음 중 하나일 때만 실행한다.
- 해당 시즌을 다시 플레이하고 싶다.
- 다른 사람에게 플레이시키고 싶다.
- 첫 플레이 구조가 특히 좋았다.
- 작품화 대상으로 실제 선정됐다.

가능한 작업:
- 느린 구간 압축
- 선택비용 재설계
- 가족/주변인물 변수 보강
- 정보 불확실성 수정
- Fail-Forward 보강
- 주요 전환점 정리
- Branch Map
- Scenario 문서화

첫 플레이 Canon을 유일한 정답 루트로 만들지 않는다.

---

# TIER 3 — 실제 미디어 제작 시에만

소설·웹툰·게임·영상 등 실제 제작을 시작할 때:

1. `IP_PACKAGE.md`로 시즌 전체 구조 파악
2. `PLAYTHROUGH_CANON.md`로 사실선 확인
3. 필요한 장면만 `raw_transcript/INDEX.md`에서 찾아 해당 PART 로드
4. 원문 대사·판단·장면 질감을 각색 재료로 사용
5. 필요 시 Visual Bible / Branch Map / 각색용 원고를 별도 생성

Raw 전체를 무조건 한 번에 컨텍스트에 넣지 않는다.

---

# 다음 시즌으로 넘어가는 사용자 경험

사용자는 시즌 종료 때 원칙적으로:

> **시즌 종료 처리**

정도만 말하면 된다.

AI가 그 시즌 채팅에서 TIER 1을 처리하고, 저장·검수까지 마친 뒤 다음 시즌 Handoff를 준비한다.

새 채팅에서는:

> **정식 시즌 N 시작**

으로 이어간다.

## 장기 원칙

- 플레이와 재미가 1순위다.
- 원문은 최대한 보존한다.
- Canon은 현재 사실을 압축한다.
- IP Package는 재사용 가치가 있는 요소를 추출한다.
- 정상 플레이는 Raw를 읽지 않는다.
- 문서 자산화가 플레이보다 더 큰 관리 프로젝트가 되지 않게 한다.
