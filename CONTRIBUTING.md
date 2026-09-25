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

```text
<type>(<scope>): <한글 요약>
```

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
- `pre-push`: 하네스 테스트, 아키텍처, 문서, typecheck, 변경 파일 lint·Secretlint 검사

추적되는 hook을 editor 전용 검사로 대체하거나 `--no-verify`로 상시 우회하지 않는다.

## 하네스 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm harness:doctor` | Node/pnpm/Git hook과 저장소 상태 진단 |
| `pnpm harness:check` | 기준 문서·어댑터·hook·CI 연결 무결성 검사 |
| `pnpm harness:verify` | 변경 범위별 빠른 품질 게이트 실행 |
| `pnpm test:agent-harness` | 하네스 정책 단위 테스트 |
| `pnpm verify:push` | 저장소 전체 push 수준 검증 |

## 구조 변경 원칙

- 애플리케이션은 다른 애플리케이션 소스를 import하지 않는다.
- 기능 구현은 먼저 해당 앱의 `domains/<domain>/<capability>`에 둔다.
- 실제 두 번째 소비자가 없는 코드를 공유 패키지로 올리지 않는다.
- 교차 앱 테스트는 `tests/integration`에 둔다.
- 앱 전용 설정은 해당 앱 디렉터리가 소유한다.
- 안정된 마이그레이션 조각이 완료되면 ratchet을 실제 수치로 낮춘다.
- Studio는 문서·명령·history·저장·렌더링 권위를 우선하며 범용 폴더로 평탄화하지 않는다.

자세한 경계는 `ARCHITECTURE.md`와 `docs/README.md`를 따른다.

## 코드·문서 품질 명령

| 명령 | 용도 |
| --- | --- |
| `pnpm run validate:documentation` | 현재 문서, 내부 링크와 폐기 경로 검사 |
| `pnpm run validate:architecture` | 저장소·source·dependency·문서 경계 검사 |
| `pnpm lint:strict` | import·JSX 접근성을 포함한 전체 ESLint |
| `pnpm typecheck` | 애플리케이션과 API TypeScript 검사 |
| `pnpm quality:imports` | Knip 미해결 import·미선언 의존성 검사 |
| `pnpm quality:secrets` | 추적 텍스트 전체 Secretlint 검사 |
| `pnpm quality:secrets:changed` | 현재 변경 텍스트 Secretlint 검사 |
| `pnpm quality:deadcode` | 전체 dead code·dependency inventory |
| `pnpm quality:cycles` | 순환 dependency inventory |
| `pnpm test:a11y` | 주요 공개 경로 axe-core 브라우저 smoke |

`quality:imports`는 CI 차단용이다. 기존 dead code와 cycle은 명시적 목록으로 관리하며 점진적으로 줄인다.
Secretlint 예외는 넓은 폴더 무시 대신 규칙별·파일별로 최소화한다.

## 접근성

정적 JSX 접근성은 ESLint로 검사한다. 실행 시점 접근성은 `@axe-core/playwright`를 사용한다.
자동 검사는 키보드, screen reader, 확대, 대비, 실제 사용성 검토를 대신하지 않는다.

## 의존성 위생

직접 import한 package는 해당 workspace의 manifest에 선언한다. transitive dependency에 기대지 않는다.
브라우저 제공 virtual module이나 절대 import는 `knip.json`에 좁은 예외와 이유를 기록한다.

manifest를 바꾸면 `pnpm-lock.yaml`도 함께 커밋하고 다음을 실행한다.

```sh
pnpm quality:imports
pnpm typecheck
pnpm lint:strict
```

## 문서 변경

- 현재 구조 문서는 구현과 같은 변경에서 갱신한다.
- `구현`, `로컬 검증`, `병합`, `운영 배포`를 구분한다.
- 생성 문서는 직접 수정하지 않는다.
- 일회성 프롬프트, 임시 연구 메모, 백업 복사본을 커밋하지 않는다.
- 상대 링크와 저장소 경로는 실제 존재 여부를 검사한다.
- 기본 언어는 한국어다. 코드 식별자와 외부 원문은 필요한 범위에서 유지한다.

## Pull Request

PR은 한 가지 목적에 집중하고 템플릿의 변경 목적, 검증 결과, 위험·복구, 배포 여부를 채운다.
실행하지 않은 테스트를 체크하지 않는다. UI 변경은 필요 시 스크린샷과 접근성 확인을 첨부한다.
병합은 운영 배포 승인이 아니며 배포는 `DEPLOY.md`와 별도 승인 절차를 따른다.
