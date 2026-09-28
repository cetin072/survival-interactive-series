# Illustration B 운영 Runbook (매일 작업)

## 사전 확인

- main SHA와 VISUALS.json의 content_sha256를 기록합니다.
- 현재 identity 파일과 SITE_ASSETS.json을 읽고 이미 처리된 대상은 재실행하지 않습니다.
- archive-draft-release-image-handoff.yml이 main에 존재하는지 확인합니다.
- 작업 대상 한 건의 point/generation, 상태, visibility, style, brief를 기록합니다.

## 생성과 수용

1. READY 후보 하나를 선택하고 정확한 brief만 사용합니다.
2. 기본 이미지 생성 도구로 생성합니다. 유료 공급자, API key, 새 provider는 사용하지 않습니다.
3. 이미지마다 금지 요소, 스타일, 비율, 텍스트/로고, brief 밖의 설정 추가 여부를 점검합니다. 최대 3회입니다.
4. 통과한 PNG 한 장만 수용합니다. 모두 부적합하면 HOLD와 사유를 남기고 해당 대상에서 중단합니다.
5. identity의 대상 ID, generation key, source SHA-256, bytes, 치수, 도구 결과 ID, 시도·검토 기록을 원본과 대조합니다.

## Trusted handoff

1. identity 변경을 feature branch PR로 제출합니다. 이 commit이 main history에 들어가기 전에는 handoff workflow를 실행하지 않습니다.
2. main에 merge된 exact SHA를 source_commit으로 기록합니다.
3. 그 SHA에 대응하는 release tag로 Draft Release를 만들고, 원본 PNG 하나만 예상 asset 이름으로 업로드합니다. Draft Release가 비공개 상태이고 익명 다운로드가 차단되는지 trusted workflow가 검증해야 합니다.
4. Actions > Private Archive illustration Draft Release handoff > Run workflow에서 release ID, exact source SHA, identity path를 입력합니다. 브랜치는 main을 선택합니다.
5. 처리 결과에서 아래 모두를 확인합니다.
   - source identity가 workflow history에 포함되고 현재 identity와 동일
   - Draft asset 수 1, private 확인, PNG decode 성공
   - bytes, dimensions, SHA-256 일치
   - Supabase private original upload와 정확한 readback 통과
   - registry reconcile 후 동일 row readback 통과
   - 임시 Draft Release 및 tag cleanup 통과
6. 어느 단계든 실패하면 재실행 전에 로그의 실패 코드를 확인합니다. 기존 원본 object 또는 registry row가 있으면 중복 생성하지 말고 정확히 일치하는지 조사합니다. Privacy·SHA·registry 불일치를 우회하지 않습니다.

## Batch publication과 배포

- 각 대상의 E2E가 모두 통과한 뒤 파생 PNG, SITE_ASSETS.json, 최소한의 검증 변경만 publication PR 한 개에 포함합니다.
- PR CI와 Deploy Preview에서 모든 asset 경로, 원본 4개 이미지 보존, 신규 수량 증가를 확인합니다.
- archive/web 또는 archive/content가 바뀌는 PR에는 [skip netlify]를 붙이지 않습니다. Browser CI가 같은 PR의 Deploy Preview asset fingerprint와 동작을 확인합니다.
- 승인된 batch PR만 병합합니다. 기존 이미지 경로가 깨지거나 대상/해시가 다르면 공개하지 않습니다.
- Production 배포는 #217의 2일 batch release만 사용합니다. 개별 수동 배포를 반복하지 않습니다.

## 실패 상태

| 상태 | 조치 |
|---|---|
| READY 후보 없음 / 중복 | 변경 없이 종료 |
| 3회 생성 모두 실패 | 대상 HOLD; 다음 콘텐츠 대상으로 넘기지 않고 보고 |
| identity가 exact source commit과 다름 | Draft Release를 workflow에 넘기지 말고 identity PR을 수정 |
| Draft asset 공개 또는 이름·개수 불일치 | E2E 중단; 임시 asset을 비공개로 만들거나 삭제한 후 재검토 |
| PNG/bytes/SHA 불일치 | 해당 원본 폐기, 원인 조사, 검증 우회 금지 |
| Supabase upload/readback 실패 | registry/publication을 진행하지 않음 |
| registry mismatch 또는 duplicate | 재조정과 exact readback 전까지 publication 금지 |
| workflow 실패 후 Draft cleanup 미확인 | 임시 release 상태를 확인·정리한 뒤 완료 처리 |
| publication CI/Preview 실패 | merge 및 Production 대기 |
| 객관적 기준을 넘었으나 미해결 미술 판단 | 사람 검토 요청; 성공으로 기록하지 않음 |

## 자동화와 수동 경계

자동 처리되는 것은 main의 trusted GitHub workflow가 시작된 다음부터의 검증·private upload·readback·registry·cleanup입니다. ChatGPT 예약 실행, 사람의 이미지 품질 판단, GitHub PR 병합, Draft Release asset 업로드 및 workflow dispatch는 현재 준비 문서만으로 자동화되지 않습니다. 이 저장소 변경에서는 ChatGPT 예약 작업을 실제로 생성하지 않았습니다.
