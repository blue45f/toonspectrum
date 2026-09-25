<!-- agent-harness:canonical -->
# ToonSpectrum 에이전트 하네스 및 작업 정책

이 파일은 저장소 전역의 **공통 작업 계약이자 단일 기준 문서**다. Claude, Codex, Copilot,
Cursor, Gemini, OpenCode용 어댑터는 이 문서를 다시 복제하지 않고 반드시 이 문서를 참조한다.
하위 디렉터리에 `AGENTS.md`가 있으면 루트 규칙에 해당 영역의 규칙을 추가 적용한다.

## 1. 지시 우선순위

1. 현재 대화에서 사용자가 명시한 요구와 제한
2. 수정 대상에 가장 가까운 `AGENTS.md`
3. 이 루트 `AGENTS.md`
4. accepted ADR, `ARCHITECTURE.md`, 운영 정책
5. 기타 설명 문서와 OpenWiki

서로 충돌하면 상위 지시를 따르고, 추측으로 충돌을 숨기지 않는다. 코드와 테스트가 문서와 다르면
**source/tests → accepted ADR → architecture docs → OpenWiki** 순서로 현재 사실을 판정한다.

## 2. 언어 및 기록 정책

- 커밋 제목·본문, PR/이슈 제목·본문, 신규·수정 문서, 코드 주석, 작업 결과 보고는 **한글을 기본값**으로 한다.
- Conventional Commits의 `type`과 `scope`, 코드 식별자, API 이름, 파일명, 명령어, 오류 원문,
  외부 제품명과 표준 용어는 원문을 유지한다.
- 외부 자동화, 라이선스, 생성 산출물 등 영어가 필수인 경우만 예외로 하고 이유를 PR에 남긴다.
- 문서는 현재 상태, 목표 상태, 마이그레이션 중 상태, 레거시 예외를 섞지 않고 명시적으로 구분한다.
- 날짜가 필요한 기록은 `오늘`, `최근` 대신 `YYYY-MM-DD` 절대 날짜를 사용한다.

## 3. 기본 작업 순서

1. `git status --short --branch`, 현재 브랜치와 worktree를 확인한다.
2. 이 파일과 수정 대상에 가장 가까운 `AGENTS.md`, 관련 source/tests/ADR을 읽는다.
3. 완료 조건과 검증 명령을 먼저 정하고, 사용자 요청 밖의 리팩터링은 분리한다.
4. 기존 패턴을 우선 재사용하고 가장 작은 응집도 높은 변경으로 구현한다.
5. 동작 변경에는 같은 변경 안에서 테스트 또는 검증 근거를 추가한다.
6. `pnpm harness:verify`와 영역별 검증을 실행하고 실제 결과를 기록한다.
7. 관련 없는 변경, 임시 파일, 생성물, 자격증명이 없는지 마지막으로 diff를 검토한다.

시작 진단은 `pnpm harness:doctor`, 하네스 구조 검증은 `pnpm harness:check`를 사용한다.

## 4. Git 및 커밋 정책

- 기본 형식은 `<type>(<scope>): <한글 요약>`이다. 예: `fix(studio): 레이어 선택 상태 복구`.
- 허용 type은 `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`,
  `style`, `test`다. type과 scope는 소문자 영문으로 유지한다.
- 하나의 커밋에는 하나의 논리적 변경만 담고, 제목은 결과를 명령형으로 설명한다.
- 공유 브랜치에서 임의 amend, rebase, reset, force push를 하지 않는다.
- `--no-verify`, CI 우회, 테스트 삭제·완화로 실패를 숨기지 않는다.
- `main` 직접 작업보다 목적이 드러나는 브랜치와 PR을 사용한다.
- PR 병합은 배포 승인이 아니다. 운영 배포는 별도 정책과 사용자의 명시적 승인이 필요하다.

## 5. 검증 기준

| 변경 종류 | 최소 검증 |
| --- | --- |
| 문서·정책만 변경 | `pnpm harness:check`, 변경 파일 Secretlint |
| JS/TS·설정·스크립트 | `pnpm harness:verify`와 관련 단위 테스트 |
| 앱 경계·패키지 구조 | 위 검증 + `pnpm validate:architecture` |
| 의존성·lockfile | 위 검증 + `pnpm audit:security`, `pnpm audit:licenses` |
| UI·접근성 | 관련 테스트 + 필요 시 `pnpm test:a11y`와 화면 증거 |
| API·DB·인증 | 관련 통합 테스트, migration/rollback 및 권한 경계 확인 |
| 운영 배포 | `DEPLOY.md`의 승인·SHA·롤백 절차 |

`pnpm harness:verify`는 변경 범위에 맞춰 빠른 게이트를 실행한다. 저장소 전체 보증이 필요하면
`pnpm verify:push` 또는 CI를 사용하며, 실행하지 않은 검증은 실행한 것처럼 보고하지 않는다.

## 6. 구현 원칙

- 타입 오류, lint 오류, 테스트 실패를 `any`, 광범위 ignore, 빈 catch, 테스트 skip으로 덮지 않는다.
- 공개 API와 데이터 계약은 입력 검증, 오류 경로, 호환성 영향을 함께 검토한다.
- 직접 import하는 패키지는 해당 workspace에 선언하고 lockfile을 수동 편집하지 않는다.
- 네트워크·파일·DB·브라우저 작업은 실패와 재시도를 명시적으로 처리하고 가능한 경우 dry-run을 둔다.
- 생성 파일과 소스 파일의 권위를 구분하고, 재생성 가능한 임시 산출물을 커밋하지 않는다.
- 사용자 데이터, 토큰, 키, 쿠키, 로컬 `.env` 값을 로그·문서·테스트 fixture에 넣지 않는다.

## 7. 아키텍처 및 OpenWiki 규칙

1. `ARCHITECTURE.md`의 현재 구조
2. `docs/architecture/modular-monorepo-target.md`의 마이그레이션 목표
3. 관련 ADR과 OpenWiki
4. 실제 source와 tests

위 자료를 함께 확인하되 최종 사실 판정은 source/tests 우선순위를 따른다.

- 논리적 도메인은 각 앱 내부에 유지하고 `packages/domains/*`를 선제적으로 만들지 않는다.
- `apps/web`, `apps/admin-web`, `apps/api`는 서로의 application source를 직접 import하지 않는다.
- Admin은 독립 배포 가능한 surface로 점진적으로 이동하며 기능을 한 번에 옮기지 않는다.
- 공통 DTO/schema는 실제 두 번째 소비자가 생긴 범위만 focused contracts package 후보로 승격한다.
- Studio는 일반 page CRUD보다 runtime authority와 기존 Studio core package 경계를 우선한다.
- `shared -> domains`, cross-domain deep import 레거시는 ratchet 증가를 막고 점진적으로 줄인다.
- OpenWiki 문서는 `current`, `migration`, `target`, `legacy exception` 상태를 구분한다.

## 8. 운영 및 배포 정책

이 정책은 이전의 main 자동 배포와 `[deploy]` 예외 지침을 대체한다.
세부 절차는 `docs/operations/minimum-cost-deployment-policy.md`와 `DEPLOY.md`를 따른다.

- PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 운영 배포는 사용자의 별도 명시적 승인 후에만 한다.
- Vercel 런타임·설정·배포 워크플로는 퇴역 상태이며 다시 추가하지 않는다.
- 승인한 40자리 main SHA 하나만 변경된 Cloudflare/Render 배포 단위에 반영한다.
- PR CI, core/verify, 테스트·보안·브랜치 보호는 유지하며 비용을 이유로 우회하지 않는다.
- 정적 웹은 검증된 `dist/`를 Cloudflare Static Assets에 수동 배포하고 Core API는 Render 수동 release만 사용한다.
- 원격 자동 source build, dashboard 자동 재배포, `[deploy]` 예외, 동일 SHA 중복 배포·자동 재시도는 금지한다.
- Turbo/유료 동시 빌드/유료 러너/플랜 변경/자동 배포 재활성화는 별도 승인이 필요하다.
- 운영 도메인·데이터·환경변수·DB migration은 단순 병합이나 배포의 일부로 임의 변경하지 않는다.
- 실패하면 분석 후 중단하고 기존 정상 배포로의 롤백을 우선 검토한다.
- 결과에는 승인, SHA, 검증, 빌드 위치, 배포 ID/URL, 남은 비용을 구분해 기록한다.

## 9. 완료 보고 형식

완료 보고에는 최소한 다음을 포함한다.

- 무엇을 왜 바꿨는지
- 실제 실행한 검증과 결과
- 커밋·PR·병합 상태
- 남은 위험, 실행하지 못한 검증, 배포 여부

불확실한 항목은 사실처럼 단정하지 않는다.
