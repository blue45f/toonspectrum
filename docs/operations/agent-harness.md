# 에이전트 작업 하네스

상태: **current**

적용일: **2026-09-26**

권위 문서: 루트 `AGENTS.md`

## 목적

ToonSpectrum은 사람과 여러 코딩 에이전트가 많은 worktree에서 동시에 작업한다. 이 하네스는 도구별
프롬프트를 늘리는 대신 하나의 정책, 범위별 규칙, 자동 검증을 연결해 작업 편차와 검증 누락을 줄인다.

## 구성

| 구성 | 역할 |
| --- | --- |
| `AGENTS.md` | 전역 단일 기준, 언어·Git·검증·배포 정책 |
| 하위 `AGENTS.md` | Web/API/Admin/Mobile/Docs/Scripts/Rust 범위별 추가 규칙 |
| 도구 어댑터 | Claude, Gemini, Copilot, Cursor, OpenCode가 기준 문서를 읽도록 연결 |
| `.gitmessage.ko` | 한글 Conventional Commit 작성 안내 |
| Husky hooks | 템플릿 제공, commitlint, staged 검사, push 전 검증 |
| `scripts/agent-harness.mjs` | doctor/check/verify 명령과 변경 범위 분류 |
| `scripts/agent-harness.test.mjs` | 하네스 파일·분류·CI 연결의 회귀 방지 |
| PR 템플릿 | 목적·검증·위험·배포 분리 기록 |

## 단일 기준 원칙

도구 어댑터에는 세부 정책을 복사하지 않는다. 복사된 규칙은 시간이 지나면 서로 달라지기 때문이다.
공통 정책은 루트 `AGENTS.md`, 영역 특화 정책은 가장 가까운 하위 `AGENTS.md`에서만 관리한다.
어댑터는 이 두 파일을 읽도록 연결하는 최소 지침만 가진다.

## 언어 정책

사람이 읽는 저장소 기록은 한글을 기본으로 한다. Conventional Commits의 type/scope, 코드 식별자,
명령어, 오류 원문, 외부 고유명사는 검색 가능성과 표준 호환성을 위해 원문을 유지한다.
commitlint는 사람 작성 커밋 제목에 한글이 없으면 실패한다. `deps`, `release`, `generated`,
`automation` 같은 외부 자동화 scope와 revert는 제한적으로 예외 처리한다.

## 명령

```bash
pnpm harness:doctor
pnpm harness:check
pnpm harness:verify
pnpm harness:verify -- --base=origin/main
pnpm harness:verify -- --staged
pnpm harness:verify -- --full
```

`doctor`는 도구와 hook 상태를 진단한다. `check`는 기준 파일과 연결이 빠지지 않았는지 검사한다.
`verify`는 base와 현재 변경을 모아 lint, Secretlint, lockfile, 하네스 테스트를 실행하고 파일 종류에 따라
아키텍처와 typecheck를 추가한다. `--full`은 root 테스트와 의존성 변경 시 보안·라이선스 검사를 더한다.

## 변경 범위 분류

- 문서만 바뀌면 하네스·보안 검사를 유지하고 불필요한 전체 typecheck는 생략한다.
- TS/TSX 또는 manifest가 바뀌면 typecheck를 실행한다.
- 앱·패키지·아키텍처 설정이 바뀌면 architecture ratchet을 실행한다.
- UI나 API 변경은 자동 게이트 외에도 관련 브라우저·통합 테스트가 필요하다고 결과에 표시한다.
- 전체 저장소 보증과 운영 배포는 각각 `pnpm verify:push`, `DEPLOY.md`의 별도 절차다.

## 확장 방법

새 도구를 지원할 때는 정책을 복사하지 말고 `AGENTS.md`를 읽도록 하는 얇은 어댑터만 추가한다.
새 영역 규칙은 실제로 다른 품질·보안 경계가 있을 때만 하위 `AGENTS.md`로 추가한다.
하네스 파일을 변경하면 `scripts/agent-harness.mjs`의 필수 파일 목록과 테스트를 함께 갱신한다.

## 실패 처리

하네스 실패를 hook 우회나 ignore로 해결하지 않는다. 누락 파일, 어댑터 drift, 잘못된 package script,
실행 권한, CI sparse checkout 중 무엇이 원인인지 오류 메시지로 확인한 뒤 기준과 구현을 함께 고친다.
