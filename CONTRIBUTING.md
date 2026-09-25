# ToonSpectrum 기여 가이드

모든 사람과 코딩 에이전트는 먼저 루트 `AGENTS.md`를 읽는다. 수정 대상 경로에 더 가까운
`AGENTS.md`가 있으면 해당 규칙도 함께 적용한다.

## 작업 시작

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm harness:doctor
```

`pnpm install`은 추적되는 Husky hook을 활성화하고 `core.hooksPath=.husky`를 설정한다.
기존 worktree와 사용자 변경을 확인한 뒤 목적이 드러나는 브랜치에서 작업한다.

## 언어 정책

커밋 제목·본문, PR/이슈, 신규·수정 문서, 코드 주석은 한글을 기본으로 한다. Conventional
Commits의 type/scope, 코드 식별자, 명령어, 외부 제품명과 오류 원문은 원문을 유지한다.
외부 자동화·라이선스·생성물 때문에 영어가 필요한 경우 PR에 이유를 남긴다.

## 커밋 규칙

형식은 다음과 같다.

```text
<type>(<scope>): <한글 요약>
```

주요 type은 다음과 같다.

| Type | 용도 |
| --- | --- |
| `feat` | 사용자에게 보이는 기능 |
| `fix` | 버그 수정 |
| `refactor` | 동작을 유지하는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 전용 변경 |
| `docs` | 문서 변경 |
| `style` | 포맷·스타일 전용 변경 |
| `build` | 빌드·의존성 도구 |
| `ci` | CI/CD 설정 |
| `chore` | 기타 유지보수 |
| `revert` | 이전 커밋 되돌리기 |

scope는 `studio`, `market`, `auth`, `api`, `i18n`, `deps`, `quality`, `harness`처럼 짧은
제품·플랫폼 영역을 사용한다. 폐쇄 enum은 아니지만 의미 없는 범용 scope를 남발하지 않는다.

```text
feat(studio): 레이어 그룹 기능 추가
fix(auth): 만료된 소셜 세션 복구
refactor(market): 에셋 미리보기 상태 분리
chore(quality): 의존성 무결성 검사 추가
```

breaking change는 헤더의 `!` 또는 `BREAKING CHANGE:` footer로 표시한다.
`commit-msg` hook과 CI가 형식 및 한글 제목 정책을 검증한다.

## 로컬 Git 게이트

- `prepare-commit-msg`: 한글 Conventional Commit 작성 템플릿 제공
- `pre-commit`: 하네스 무결성, lockfile, staged ESLint, Secretlint 검사
- `commit-msg`: commitlint 검사
- `pre-push`: 하네스 테스트, 아키텍처, typecheck, 변경 파일 lint·Secretlint 검사

추적되는 hook을 editor 전용 검사로 대체하거나 `--no-verify`로 상시 우회하지 않는다.

## 하네스 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm harness:doctor` | Node/pnpm/Git hook과 저장소 상태 진단 |
| `pnpm harness:check` | 기준 문서·어댑터·hook·CI 연결 무결성 검사 |
| `pnpm harness:verify` | 변경 범위별 빠른 품질 게이트 실행 |
| `pnpm test:agent-harness` | 하네스 정책 단위 테스트 |
| `pnpm verify:push` | 저장소 전체 push 수준 검증 |

## 코드 품질 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm lint:strict` | import·JSX 접근성을 포함한 전체 ESLint |
| `pnpm typecheck` | 애플리케이션과 API TypeScript 검사 |
| `pnpm quality:imports` | Knip 미해결 import·미선언 의존성 검사 |
| `pnpm quality:secrets` | 추적 텍스트 전체 Secretlint 검사 |
| `pnpm quality:deadcode` | 전체 dead code·dependency inventory |
| `pnpm quality:cycles` | 순환 의존성 inventory |
| `pnpm test:a11y` | 주요 공개 경로 axe-core 브라우저 smoke |

코드가 직접 import하는 패키지는 소유 workspace에 선언한다. transitive dependency에 기대지 않는다.
의존성 manifest를 바꾸면 `pnpm-lock.yaml`을 함께 갱신하고 보안·라이선스 검사를 실행한다.

## Pull Request

PR은 한 가지 목적에 집중하고 템플릿의 변경 목적, 검증 결과, 위험·복구, 배포 여부를 채운다.
실행하지 않은 테스트를 체크하지 않는다. UI 변경은 필요 시 스크린샷과 접근성 확인을 첨부한다.
병합은 운영 배포 승인이 아니며 배포는 `DEPLOY.md`와 별도 승인 절차를 따른다.
