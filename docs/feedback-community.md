# ToonStudio 제보·제안 커뮤니티

## 기존 기능 검토와 선택

기존 `/feedback`에는 질문·아이디어·버그 게시글, 로그인 사용자 댓글, 운영자 답변과 공개 목록 API가 이미 있었다. 별도 게시판을 중복 생성하지 않고 같은 URL과 게시글 ID를 유지하며 확장한다. `/community`의 작품·장르 카페와 `/support`의 외부 공개 문의는 별도 서비스로 유지한다.

기존 UI는 서버의 검색·커서 페이지네이션을 연결하지 않았고, 댓글 조회/전송 실패를 숨겼다. 또한 `InquiryForm`을 “비공개 문의”로 표시했으나 실제 `lib/inquiry-api.ts`는 공개 문의 목록과 같은 외부 API에 본문을 전송한다. 새 화면에서는 이 경로를 비공개라고 부르지 않는다. 기존 공용 폼에서도 연락처를 공개 본문에 덧붙이던 동작을 제거하고 공개 안내를 표시한다.

## 제품·화면 설계

- 제보 유형: 버그 제보 / 아이디어 / 기능 요청 / 이용 질문. 대표 세 유형을 첫 화면 진입 카드로 제공한다.
- 목록: 제목·본문 검색, 유형·처리 상태·내 제보·태그 필터, 최신순 커서 더보기, 명시적인 빈 상태·오류·재시도.
- 작성: 관련 기능, 제목·본문, 태그, 선택적 재현 순서·기대 동작·실제 동작. 공개 확인 이후 제출하며 실패한 입력을 유지한다.
- 논의: 계정별 공감 1회와 취소, 댓글, 운영자 배지, 처리 안내 이력. 댓글 입력창의 Enter는 줄바꿈이며 등록 버튼으로만 전송한다.
- 운영: 서버가 검증한 admin/operator만 상태 변경. 공개 안내를 반드시 남기며 이전 상태를 비교해 동시 변경 충돌을 감지한다.

기존 warm-ink/persimmon 토큰을 재사용한다. 데스크톱은 목록과 작성/안내의 2열, 모바일은 1열로 전환한다. 텍스트가 있는 상태 배지, 명시적 라벨, 키보드 포커스, 처리 중 비활성화, 라이브 성공/실패 안내, 감소된 모션을 지원한다. 가상 통계나 공감 순 인기 순위를 표시하지 않는다.

## 데이터·권한 계약

`status: open | answered`는 기존 답변 여부다. `progress: received | reviewing | planned | in_progress | completed | not_planned`는 실제 개선 진행 상황이다. 운영자 답변을 작성하는 것만으로 `completed`가 되지 않는다. 기존 answered 글의 progress도 received로 시작하며, 운영자가 검토 후 실제 진행 상태를 정한다.

`feedback_post`에 progress와 허용 목록 기반 metadata를 추가한다. `feedback_vote`는 `(postId,userId)` 복합 기본 키로 중복 공감을 방지한다. 투표는 토글 요청이 아니라 원하는 boolean을 저장하므로 같은 요청을 반복해도 하나만 남는다. 기존 게시글·답글·작성자는 삭제하거나 재생성하지 않는다. 초기화는 advisory transaction lock을 사용한 additive runtime migration이며 실패 시 재시도한다.

모든 쓰기는 기존 sessionAuth와 CSRF 경계를 유지한다. 브라우저는 공용 API 클라이언트의 HttpOnly 쿠키·CSRF 처리를 사용하며 로컬 userId를 인증 헤더로 보내지 않는다. 운영자 권한은 데이터 계층에서도 다시 확인한다. 숨김 글은 ID를 알아도 상세 조회·댓글 조회/작성·투표·처리 상태 변경이 불가능하다. 개인화 목록은 private/no-store로 반환한다.

새 프런트엔드는 목록의 `contractVersion: 2`를 확인한 후 작성 기능을 활성화한다. 이는 구버전 API가 새로운 request 유형을 기존 question으로 잘못 저장할 수 있는 혼합 배포 상황을 막는다. API를 먼저 배포하고 웹을 배포하는 순서를 권장한다.

공개 제보에는 비밀번호, 연락처, 결제 정보와 미공개 작품을 입력하면 안 된다. 브라우저 식별 정보나 현재 URL을 자동 수집하지 않는다. 선택적으로 받아들이는 경로도 공개 제품 라우트만 허용하고 쿼리·해시·프로젝트 식별 경로를 제거한다. 검증은 알려진 키만 저장하고 임의 userId, role, progress, voteCount 입력을 무시한다.

## 검증 방법

```sh
pnpm exec vitest run packages/core/src/feedback.test.ts
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/feedback_community_test \
  TSX_TSCONFIG_PATH=apps/api/tsconfig.json pnpm exec tsx scripts/verify-feedback-community-db.mts
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test --config playwright.feedback.config.ts
pnpm run typecheck
```

DB 검증 스크립트는 정확히 loopback의 `feedback_community_test`만 허용한다. 해당 격리 DB에서만 기존 형식의 테이블을 생성해 마이그레이션, 페이지네이션, 권한, 중복 투표, 이력, 숨김 글과 답글 깊이를 검증한다. 운영 DB에는 테스트 글을 등록하지 않는다.

Playwright는 실제 React 화면을 테스트 전용 엔트리로 렌더하고 API 응답만 fixture로 교체한다. 게스트/로그인/운영자, 글 등록, 검색·페이지네이션, 공감·취소, 실패한 댓글의 재시도, 구버전 API 차단, 320/390/768/1440px 가로 넘침과 브라우저 예외를 검사한다. `e2e/feedback-community.html`과 해당 테스트 엔트리는 프로덕션 빌드에서 참조하지 않는다. 화면 증거에는 “UI 검증 · 테스트 데이터”를 명시한다.

GitHub의 기존 core/verify/SonarQube 흐름을 우회하지 않는다. SonarQube secrets가 없어서 스캔이 건너뛰어진 경우를 분석 통과로 간주하지 않는다. PR 병합과 운영 배포 완료도 구분한다.

## 범위 밖

첨부파일, 비공개 티켓, 이메일/앱 알림, 공감순 정렬, 자동 중복 병합, 공개 로드맵은 이번 변경에 포함하지 않는다. 공감 수가 구현 일정이나 채택을 보장하지 않는다. 요청 제한은 기존과 같은 인스턴스 단위 보조 방어이며 전역 분산 속도 제한을 대체하지 않는다.
