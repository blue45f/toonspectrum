# 협업 세션·검수 저장·테스트 계정 관리 검증

상태: **current (소스·격리 환경 검증), 운영 인증 쓰기 미검증**
기준일: **2026-09-28**

## 범위와 실행 결과의 구분

운영 사이트의 제작 관리와 로그인 화면은 실제 브라우저에서 확인했다.
하지만 재사용할 테스트 계정 로그인 정보를 로컬 env에 생성하는 도구 실행이 안전 검사에 의해 차단되었다.
실제 신규 계정·이메일 인증·운영 로그인·운영 초대·운영 게시물은 생성하거나 완료하지 않았다.
따라서 실제 테스트 계정 로그인 정보가 저장된 env 파일도 생성하지 않았다.
아래의 합성 HTTP 및 로컬 PostgreSQL 검증을 운영 계정의 E2E 성공으로 해석하면 안 된다.

## 수정한 문제

기존 제작 프로젝트 hook은 화면 전환 이후에도 이전 요청 결과와 대기 명령을 반영할 수 있었다.
프로젝트 ID·사용자 ID·인증 세대를 기준으로 조회·저장 수명을 분리하고 늦은 응답을 무시한다.
로그아웃·인증 세대 변경 시 캐시와 권한을 즉시 분리하며, 401/403/404 또는 접근 거부 응답은 비공개 캐시를 폐기한다.
다른 프로젝트 응답을 현재 프로젝트에 적용하지 않고 오래된 조회가 최신 저장 버전을 덮어쓰지 못하게 한다.

검수 화면에 오류를 삼키는 명령 함수를 전달하던 연결을 strict 저장 함수로 바꿨다.
이제 저장 실패는 검수 입력까지 전달되어 질문 초안이 유지되고, 성공했을 때만 초안을 지운다.
409 충돌 후 최신 상태를 불러오되 이전 명령을 자동 재실행하지 않는다.
실패 전에 대기하던 후속 변경도 중지하고 명시적인 재시도만 허용한다.

다른 탭의 저장 알림은 BroadcastChannel에 프로젝트 ID·revision만 전달한다.
데이터 자체는 다시 인증된 API로 조회하며, 채널을 사용할 수 없는 환경에서는 포커스·재접속·30초 주기 조회로 복구한다.
화면을 보고 있고 온라인일 때만 주기 조회하며, 저장 중에는 재조회로 입력을 덮지 않는다.
저장 버전과 수동 새로고침 버튼을 실제 제작 화면에 추가했다.

## 테스트 계정 구분과 로그인 정보

별도 작업 PR #2178의 관리자 테스트 계정 구분 구현을 재사용했다. 커뮤니티 댓글 변경은 포함하지 않는다.
`admin_member_test_accounts`는 일반 사용자 테이블과 분리된 관리자 전용 표식이다.
공개 프로필·닉네임·일반 인증 권한을 바꾸지 않는다. 관리자만 사유와 이전 값을 확인하여 변경하고 감사 로그를 남긴다.
마이그레이션 미적용은 일반 계정으로 오인하지 않도록 `null`/확인 불가로 표시한다.
브라우저 DB 역할은 RLS 및 명시적 권한 회수로 이 표식에 접근할 수 없다.

계정 준비 도구 `scripts/collaboration-qa-accounts.mjs`는 실제 일반 회원가입 API만 사용하도록 작성했다.
기본 경로는 저장소 루트의 `.env.collaboration-qa.local`이며, Git 제외·파일 권한 600·기존 파일 덮어쓰기 방지를 검사한다.
로그인 정보는 `COLLAB_QA_OWNER_*`, `COLLAB_QA_EDITOR_*`, `COLLAB_QA_VIEWER_*`로 분리한다.
공개 번들용 `VITE_` 변수나 커밋·테스트 로그·관리자 API 응답에 비밀번호를 넣지 않는다.
준비 상태와 이메일 인증 대기 상태를 구분하며, 이메일 인증은 실제 소유한 메일함에서 완료해야 한다.
가입 payload에는 이메일·비밀번호·닉네임만 보낸다. 관리자 역할·이메일 인증 완료·테스트 표식을 가입 요청으로 주입하지 않는다.
이 도구의 실제 운영 계정 준비·가입 실행은 이번 작업에서 완료되지 않았다.

```sh
# 저장소 루트, 읽기 전용 절차 확인
node scripts/collaboration-qa-accounts.mjs --dry-run
# 기존 파일 보호·일반 가입 payload·실패 중단을 모의 요청으로 검증
node --test scripts/collaboration-qa-accounts.test.mjs
```

운영 실행에는 도구의 `--prepare`, 본인이 소유한 `--inbox`, 고유한 `--run`을 사용한다.
`--register`는 명시적 `--allow-live-writes`를 요구하며 재시도를 자동 반복하지 않는다.
인증 후 관리자 회원관리에서 해당 계정만 테스트로 지정한다. 관리자 표식은 접근 권한을 부여하지 않는다.

## 시나리오 검증 범위

| 시나리오 | 검증 방법 | 운영 검증 여부 |
| --- | --- | --- |
| 비로그인 제작 관리·로그인 진입 | 운영 Chromium | 읽기만 확인 |
| 실제 가입·이메일 인증·일반 계정 로그인 | 실행 차단 | 미완료 |
| 초대 이메일·미인증 수락 거절, 재발행·회수 | 격리 PostgreSQL 저장소 통합 테스트 | 운영 아님 |
| 역할 제한·마지막 소유자 보호·소유권 이전 | 격리 PostgreSQL 13개 협업 시나리오에 포함 | 운영 아님 |
| 동시 이름 변경·정원 경쟁·재전송 멱등성 | 실제 트랜잭션·DB 제약 | 운영 아님 |
| 계정·프로젝트 변경 및 오래된 응답 | hook 및 실제 라우트 컴포넌트 회귀 | 모의 API |
| 검수 저장 실패·다른 탭 반영·403 회수 | 실제 HTTP client + Chromium 두 탭 | 합성 HTTP 응답 |
| 관리자 표식·일반 DB 역할 차단·감사 실패 롤백 | 격리 PostgreSQL 15검사 + API 단위 테스트 | 운영 아님 |
| 마우스·키보드·터치 이동 및 홍보 표지 변환 | 기존 브라우저 회귀 하네스 | 합성 프로젝트 |

```sh
# 아래 URL은 이 작업에서 만든 폐기 가능한 로컬 검증 DB 예시다.
TEST_DATABASE_URL=postgresql://hjunkim@127.0.0.1:62053/collaboration_qa_local \
  pnpm exec vitest run apps/web/src/domains/creator/production-hub \
  apps/api/src/modules/production-collaboration \
  apps/api/src/modules/admin/admin-member-test-accounts.test.ts \
  packages/contracts/src/production-workflow.test.ts apps/web/src/domains/promotion --maxWorkers=2
pnpm harness:verify
```

DB 테스트는 무관한 데이터베이스나 운영 연결을 사용하면 안 된다. 별도 로컬 클러스터가 필요하다.
관리자 표식 SQL 검증 도구는 빈 DB·포트·DB 이름·임시 데이터 디렉터리까지 제한한다.

브라우저 검증은 별도 개발 서버에서 실행한다.

```sh
pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5198 --strictPort
pnpm exec tsx scripts/verify-collaboration-session-browser.mts
WORKFLOW_QA_URL=http://127.0.0.1:5198 \
  WORKFLOW_QA_OUTPUT=/tmp/toonstudio-collaboration-regression-qa \
  node apps/web/tools/browser-harnesses/review-collaboration-promotion.browser.mjs
```

첫 브라우저 검사는 `/tmp/toonstudio-collaboration-session-qa`에 JSON 결과와 화면을 저장한다.
다른 사용자의 원고·댓글·권한을 변경하지 않으며, 기존 브라우저 회귀도 합성 프로젝트에서 실행한다.

## 운영 반영과 복구

소스 병합은 운영 배포 승인이나 운영 DB 변경 승인이 아니다.
운영에 관리자 표식을 사용하려면 `0097_admin_member_test_accounts.sql`과 API/Web 배포를 별도 승인 절차로 반영해야 한다.
운영 DB 연결·환경변수·마이그레이션 실행·운영 배포는 이 작업에서 수행하지 않는다.
신규 SQL 추가로 기존 `apiDatabaseFiles` 기준을 144에서 145로 조정하는 변경은 PR #2178의 동일 변경만 재사용했다.
다른 아키텍처 허용량이나 검사 강도는 늘리지 않는다.

문제 시 코드 커밋을 revert하고 새 계정 구분 기능을 비활성 상태로 유지한다.
관리자 표식 테이블의 보존 데이터는 코드 롤백으로 자동 삭제하지 않는다.
별도 데이터 정리는 대상 계정과 감사 기록을 확인하고 승인 후 수행한다.

## 최종 실행 기록

- 관련 회귀 검사: **58개 파일, 364개 테스트 통과**. 이 수치에 실제 로컬 PostgreSQL 협업 13개 시나리오가 포함된다.
- 계정 준비 도구·DB 연결 보호: **Node 테스트 11개 통과**. 가입 요청은 모의 fetch이며 실제 이메일을 발송하지 않았다.
- 관리자 표식 DB: **실제 격리 PostgreSQL 검사 15개 통과**. 운영 DB와 분리된 임시 클러스터다.
- 두 탭·HTTP 오류·권한 회수: **브라우저 8검사 통과**, 미처리 오류 0개. 실제 HTTP client에 합성 API 응답을 제공했다.
- 기존 작업 보드·검수·홍보: **브라우저 18검사 통과**, 미처리 오류 0개. 합성 프로젝트에서 마우스·키보드·터치 이벤트를 사용했다.
- `pnpm harness:verify`: 타입·린트·Secretlint·아키텍처 경계 검사 통과.

위 숫자는 운영 인증·실계정 생성·실사용자 협업 시나리오의 완료 수치가 아니다.
실계정·로그인 정보 env 저장은 미완료이고, 운영 배포·운영 마이그레이션도 수행하지 않았다.
