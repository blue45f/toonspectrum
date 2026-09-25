# 사용자 웹 작업 규칙

이 디렉터리에서는 루트 `AGENTS.md`와 이 규칙을 함께 적용한다.

## 경계

- `apps/api`, `apps/admin-web`의 application source를 직접 import하지 않는다.
- 공유가 실제로 필요한 런타임 중립 계약만 `packages/contracts` 등 승인된 package를 사용한다.
- 기능은 `apps/web/src/domains/*`의 기존 도메인 경계를 우선하고 무관한 `shared` 확장을 피한다.
- Studio 변경은 기존 document/command/runtime authority와 package 경계를 먼저 확인한다.

## React 및 TypeScript

- strict TypeScript를 유지하고 `any`, non-null assertion, 광범위 type cast를 임시 해결책으로 쓰지 않는다.
- 상태는 가장 좁은 소유자에 두며 서버 상태와 UI 전역 상태를 구분한다.
- effect는 외부 시스템 동기화에만 사용하고 파생 상태를 effect로 복제하지 않는다.
- 기존 디자인 토큰, 컴포넌트, i18n 경로를 재사용한다.
- 사용자 문구를 새로 추가하면 번역 키, 기본값, 누락 동작을 함께 확인한다.

## UI 품질

- 키보드 탐색, focus, semantic HTML, label, 오류 안내, reduced motion을 기본 요구로 본다.
- 반응형 변경은 모바일·데스크톱과 light/dark/contrast 상태를 함께 확인한다.
- 비동기 화면에는 loading, empty, error, retry 상태를 명시한다.
- 시각 변경은 관련 테스트와 필요 시 스크린샷 또는 브라우저 검증 근거를 남긴다.

## 검증

- 관련 Vitest/Playwright 테스트를 우선 실행한다.
- 공통 최소 검증은 `pnpm harness:verify`다.
- 접근성 영향이 있으면 `pnpm test:a11y` 또는 동등한 범위 검증을 추가한다.
- Studio 변경은 해당 `verify:studio-*` 계약 중 실제 영향 범위를 실행한다.
