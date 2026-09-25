# ToonStudio 영상 자동화

`toonstudio-brand-film.json`을 승인된 n8n instance에 import한다. manual trigger로 비활성 상태이며
credential을 포함하지 않는다. Git에 export와 code contract가 있다는 사실은 live n8n import·실행이나
운영 승인을 의미하지 않는다.

## 설정

1. `creator-brand-film.yml` renderer workflow와 격리 media lockfile을 먼저 merge한다.
2. **Dispatch approved GitHub renderer**에 이 repository의 Actions write와 필수 metadata만 허용한
   fine-grained GitHub credential을 연결한다. credential은 n8n secret store에만 둔다.
3. **Select approved format**에서 `all`, `landscape`, `portrait`, `square`, `header` 중 하나만 선택한다.
4. 수동 실행한다. GitHub 204는 요청 수락일 뿐 완료가 아니다. 연결된 workflow run과 artifact를 확인한다.
5. release 전에 video, caption, manifest를 검토하고 정상 repository/deployment 절차로 publish한다.

inbound webhook, 사용자 URL, shell node, 임의 Git ref, social media 자동 게시가 없다. workflow dispatch는
idempotent하지 않으므로 HTTP retry를 자동으로 하지 않는다. 모호한 network failure가 있으면 기존 run을
확인한 뒤 재시도한다. n8n 실행 권한을 승인된 운영자로 제한하고 감사 log를 정책에 맞게 보존한다.

실제 자동화 완료를 주장하려면 n8n server, credential, import와 승인된 test execution이 필요하다.

## 로컬 계약 검사

```sh
node --test scripts/creator-film-automation.test.mjs
```

검사는 Code node body, edge, 고정 dispatch destination, credential 요구, webhook/shell/자동 publish 부재와
수락·완료 의미를 확인한다. 실제 n8n runtime 통합 검사를 대체하지 않는다.
