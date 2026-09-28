# AFTERFALL Illustration B — 예약 작업 프롬프트

이 작업은 한 번 실행될 때 AFTERFALL 시각 후보 중 한 건만 처리한다.

## 수행 순서

1. 저장소의 archive/content/visuals/C03-AFTERFALL/VISUALS.json과 현재 B identity 파일을 확인한다. main의 최신 상태를 기준으로 하며, 사용자 변경을 덮어쓰지 않는다.
2. 이미 identity, 비공개 보관 성공, registry READY 또는 공개 자산이 있는 point/generation은 다시 처리하지 않는다. READY 후보가 없으면 변경 없이 종료한다.
3. 해당 후보의 brief, AFTERFALL_ARCHIVE_V1 규칙, 기존 공개 이미지 기준을 읽는다. brief에 없는 인물 외모, 구조·층수, 날씨·계절, 경로·보안 배치, Canon 사실을 추가하지 않는다.
4. Codex 기본 이미지 생성 도구만 사용한다. 유료 API나 새 공급자를 사용하지 않는다. 한 후보당 최대 3회 생성한다. 금지 요소가 보이면 그 이미지는 거절한다. 최대 횟수 내 적합 이미지가 없으면 상태를 HOLD로 기록하고 다음 후보로 넘어가지 않는다.
5. 원본 PNG 한 장만 수용한다. SHA-256, bytes, 가로·세로, 결과 ID, 전체 시도 수, 검토 요약과 거절 사유를 identity에 남긴다. 받아들이기 어려운 주관적 품질 문제는 임의로 통과시키지 말고 사람 검토 대상으로 둔다.
6. identity 변경은 feature branch에서 PR로 제안한다. main에 identity가 합쳐진 뒤에만 그 exact merge commit을 source commit으로 사용한다.
7. 승인된 PNG를 GitHub Draft Release 하나에 임시 asset으로 첨부한다. tag와 asset 이름은 docs/architecture/ILLUSTRATION_ORIGINAL_STORAGE_PROVIDER_V1.md 및 trusted workflow 구현을 그대로 따른다. release에는 정확히 그 PNG 하나만 올린다.
8. main에서 .github/workflows/archive-draft-release-image-handoff.yml을 실행한다. source commit과 identity 경로를 입력한다. service-role secret은 Actions 내부 전용이며 값을 읽거나 전달하거나 출력하지 않는다.
9. 성공 조건은 trusted workflow의 exact source match, 비공개 asset 확인, PNG/bytes/SHA 검증, Supabase 원본 readback, registry readback, 파생 이미지 성공, Draft Release/tag cleanup 완료다. 로그에서 각 단계의 성공 결과를 확인한다.
10. 다른 대상도 같은 방식으로 개별 E2E를 통과한 후에만 동일 publication batch로 묶는다. 공개 manifest를 바꾸는 PR은 batch당 하나다. Production은 #217 2일 release 모델을 따른다.

## 절대 금지

- PRIVATE KEY, service-role key, token, 암호화 비밀값을 요청하거나 대화·파일·이미지에 기록하지 않는다.
- 오래된 encrypted signed-upload routine을 기본 경로로 되살리지 않는다.
- SHA/readback/registry 검증, privacy 확인 또는 cleanup을 생략하지 않는다.
- 비공개 원본을 공개 저장소·사이트·manifest에 넣지 않는다.
- 백운과 장태훈처럼 별도 대상의 brief/Canon 사실을 섞지 않는다.
- 기존 READY backlog를 묶음 처리하지 않는다.
