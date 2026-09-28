# 커뮤니티 안정화와 관리자 전용 테스트 계정 구분

상태: `current`(구현 및 로컬 검증), `migration`(운영 반영 전)
검증일: 2026-09-28

## 구현한 변경

팬카페 대댓글을 정확한 부모 가지에 한 번만 삽입한다. 없는 부모를 다른 가지나 루트로 승격하지 않는다.
팬카페·리뷰 댓글은 전송 중 연속 클릭을 막고 통신 실패 시 입력을 보존한다.
응답을 기다리며 새로 쓴 내용은 지우지 않으며 계정·게시글 전환 시 이전 초안을 분리한다.
새로고침 실패 시 이미 읽던 댓글·게시글을 유지하고 오류와 재시도 경로를 표시한다.
검색 조건과 실제 빈 게시판을 구분하고 필터 초기화를 제공한다. 태그 검색 결과가 비어도 선택을 유지한다.
검색어가 바뀌지 않았는데 로딩 상태만 켜지는 경우와 늦은 목록 응답의 덮어쓰기를 방지한다.
중복되던 시작 안내 대신 작품·작가·펜카페·장르 카페 진입점을 제공한다.
비로그인 글쓰기의 데모 로그 버튼을 기존 로그인 모달로 연결한다.

`admin_member_test_accounts`는 공개 사용자 프로필과 분리된 내부 테이블이다.
일반 회원과 같은 인증 권한을 유지하며 회원 목록·상세의 관리자 화면에만 구분을 표시한다.
구분값을 조회할 수 없는 경우 일반 계정으로 단정하지 않고 확인 불가로 표시한다.
변경은 관리자만 가능하고 사유·확인·이전 값 일치를 요구한다. 운영자는 조회만 가능하다.
구분값 변경과 감사 기록은 같은 트랜잭션에 저장한다.
이 구분을 과금·한도·인증 우회나 가상의 인기 지표에 사용하지 않는다.

## 실제 실행한 검증과 한계

| 범위 | 결과 | 데이터 및 한계 |
| --- | --- | --- |
| 운영 비로그인 Chromium | 10경로 × 1440/390px = 20화면 점검 | 실제 운영 API 읽기, 로그인 후 쓰기 미포함 |
| 관련 Vitest | 12파일 74테스트 통과 | React 컴포넌트·API 서비스 테스트 더블 포함 |
| Chromium 회귀 테스트 | 36테스트 통과 | 로컬 앱 코드와 합성 API 응답, 운영 쓰기 아님 |
| 로컬 PostgreSQL | 15검사 통과 | 마이그레이션 재실행, RLS, 브라우저 역할 접근 차단, 제약·롤백·삭제 연쇄 |
| DB 검증 도구 보호장치 | 7테스트 | dry-run 및 원격·다른 포트·DB·쿼리 덮어쓰기 거부 |

운영 경로는 `/community`, `/community/title`, `/community/author`, `/community/pencafe`,
`/community/cafes`, `/community/events`, `/reviews`, `/feedback`, `/community/promote`,
`/community/post/qa-nonexistent-thread`이다.
관찰한 20화면에서 가로 넘침·브라우저 예외·탐색 오류는 없었다.
없는 글의 API 404와 안내 화면을 확인했으며 그 외 API 오류는 기록되지 않았다.
이 결과는 방문 시점의 관찰이며 모든 계정·게시글·권한 조합의 운영 보증이 아니다.

운영 회원가입 화면까지 진입했으나 계정 생성 실행이 도구 보안 검사에서 차단됐다.
운영 테스트 계정을 생성하지 않았고 운영 글·댓글 작성·정리도 수행하지 않았다.
로그인 후 운영 CRUD, 다른 계정의 수정·삭제 금지, 첨부·신고·알림과 실제 DB 저장은 추가 검증이 필요하다.
설치·베타 안내가 동시에 본문을 가리는 현상은 관찰했으나 공통 오버레이 변경은 이 범위에 포함하지 않았다.

브라우저·DB 자료는 작업 기기의 `.chatgpt-ops/toonstudio-community-qa-20260928`에 보관한다.
운영 관찰은 `production-guest-results.json`, 로컬 브라우저 결과는 `browser-results.json`이다.
새 테스트 진입점 `e2e/community-replies.html`은 운영 앱에서 참조하지 않으며 API를 fixture로 차단·대체한다.

## 재검증

저장소 루트에서 의존성을 설치한 후 실행한다. 브라우저 테스트는 사용 중인 다른 작업의 서버를 재사용하지 않도록 포트를 분리한다.

```sh
pnpm harness:verify
pnpm exec vitest run apps/web/src/domains/community packages/core/src/community-governance.test.ts apps/api/src/modules/admin/admin-members.authorization.test.ts apps/api/src/modules/admin/admin-member-policy.test.ts apps/api/src/modules/admin/admin-member-test-accounts.test.ts apps/api/src/modules/admin/admin.controller.test.ts apps/api/src/modules/admin/admin.service.test.ts --maxWorkers=1
pnpm exec playwright test --config playwright.feedback.config.ts
node --test scripts/verify-community-test-accounts-db.test.mjs
node scripts/verify-community-test-accounts-db.mjs --dry-run
```

DB 프로브는 운영 연결을 허용하지 않는다. 별도 임시 클러스터의
`127.0.0.1:61983/community_qa_verification`만 허용하며 서버 데이터 디렉터리도
`/tmp/toonstudio-community-pg-*`인지 검사한다. 새 DB에 합성 테이블과 역할을 생성하므로 일반 개발 DB에 실행하지 않는다.
첫 실행 후 같은 DB에서 재실행하면 빈 DB 요구사항으로 거부한다. 검증 후 해당 임시 클러스터만 종료한다.

## 운영 반영 절차 — 아직 실행하지 않음

승인 주체는 서비스 소유자이며 PR 병합과 운영 배포·DB 변경 승인은 분리한다.
입력은 승인된 main SHA, 관리자가 소유한 테스트 계정 ID, 검증 사유, 롤백 대상 SHA이다.

1. 기존 운영 DB 백업·연결 역할을 확인하고 `0097_admin_member_test_accounts.sql`을 관리된 마이그레이션 경로로 적용한다.
2. API 런타임 역할이 `toonspectrum_runtime`인지 확인한다. 다른 역할은 별도 최소 권한 검토가 필요하며 PUBLIC 권한으로 해결하지 않는다.
3. 동일 승인 SHA의 API와 웹을 반영한 뒤 관리자 회원 목록·상세에서 구분과 변경 이력을 확인한다.
4. 일반 회원·비로그인 요청의 조회/변경 차단과 공개 프로필 응답의 내부 필드 비노출을 실제 운영 세션으로 검증한다.
5. 소유자가 승인한 별도 계정으로 최소한의 검증 글·댓글을 작성하고 결과·ID를 기록한 다음 삭제한다. 기존 사용자 글을 테스트 대상으로 변경하지 않는다.

성공 기준은 관리자 분류·감사 기록의 일치, 일반 권한 유지, 공개 응답 비노출,
운영 CRUD 결과와 정리 확인이다. 로컬 테스트 통과만으로 이 기준을 완료 처리하지 않는다.

문제가 생기면 해당 쓰기를 중단하고 승인된 이전 API·웹 SHA로 롤백한다.
기존 앱은 내부 구분 테이블을 참조하지 않으므로 테이블을 남겨 감사 자료를 보존한다.
테이블 영구 제거는 별도 승인·백업 후 수행한다. 마이그레이션 미적용 환경에서는 분류가 확인 불가로 표시되고 구분 변경은 실패해야 한다.

## 구조 검사에서 기록한 변경

최초 구조 검사에서는 신규 관리자 컴포넌트와 DB 마이그레이션 때문에 파일 수 기준을 초과했다.
관리자 UI는 기존 `AdminMembersPage.tsx`에 통합해 `webAdminFiles=69` 기준을 유지한다.
`apiDatabaseFiles`는 144에서 145로 정확히 한 파일만 증가시킨다. 증가분은 새 관리형 SQL 마이그레이션이며,
이전에 적용된 SQL을 덮어쓰거나 런타임 DDL을 추가하는 대신 독립된 변경·재실행·복구 이력을 보존하기 위한 것이다.
다른 source-layout 기준과 앱 경계 기준은 늘리지 않는다. 추가 기능의 일반적인 레거시 파일 증가를 허용하는 예외가 아니다.
