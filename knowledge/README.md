# Knowledge 콘텐츠 계약

`content/briefs/*.json`은 공개 BRIEF의 의미 단위 본문입니다. `content/candidates/*.json`은 미래 Worker가 기록할 질문과 처리 결과입니다. `content/evidence/*.json`은 비공개 편집 근거이며 웹 공개 디렉터리로 복사하지 않습니다. `content/topics.json`은 BRIEF와 향후 GUIDE·TOOL·STORY 관계를 보관합니다. 기존 `SOURCES.md`는 자료 선택 및 편집 원칙 문서로 유지하며 개별 글의 source/evidence JSON을 대체하지 않습니다.

현재 K-002와 K-003은 기존 공개 글에서 이전한 기준 샘플입니다. `HUMAN_APPROVED`는 그 공개 과정의 편집 승인을 나타내며 새 자동 작성물에 붙일 수 없습니다. `ai_assisted`는 제작 방식의 투명성을 위한 별도 필드입니다.

각 section은 `heading`과 `blocks`로 구성합니다. 지원 block은 `prose`, `table`, `ordered_list`, `unordered_list`, `note`, `download/tool`입니다. 출처·관련 글·GUIDE·STORY 링크는 자유 HTML 대신 별도 관계 필드로 관리합니다. `guides.json`에는 실제 GUIDE가 있을 때만 항목을 넣고, 게시된 GUIDE만 링크합니다. `stories.json`의 Story는 원문 manifest 확인 정보가 있어야 링크할 수 있습니다. 현재 두 registry는 비어 있으며 출력되는 GUIDE/STORY 링크는 없습니다.

생성: `cd archive/web && npm run knowledge:build`. 검사: `npm run knowledge:check && npm run knowledge:test`. 생성된 HTML과 sitemap은 저장소에 함께 커밋하고 CI에서 최신 상태를 확인합니다.
