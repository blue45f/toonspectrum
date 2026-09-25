# 아키텍처 개요

## 현재 저장소 운영 모델

- 루트 `package.json`은 아직 `apps/web` Vite·React 툴체인과 저장소 횡단 명령을 소유합니다.
  `apps/web`은 별도 workspace package로 완전히 분리되지 않은 현재 상태입니다.
- `apps/admin-web`은 `@toonspectrum/admin-web`이라는 독립 pnpm workspace package이며,
  자체 Vite·TypeScript·Playwright 설정과 `dist/` 출력을 소유합니다.
- `apps/api`는 독립 NestJS workspace package입니다. HTTP, WebSocket, DB, 영속성,
  외부 서비스 연동은 서버 전용으로 유지합니다.
- `packages`에는 두 개 이상의 실행 앱이 실제로 공유하는 런타임 중립 계약·순수 모델·
  Studio 엔진만 둡니다. 애플리케이션 내부 구현을 공유 패키지로 우회하지 않습니다.
- 루트에는 workspace 설정, 저장소 횡단 검증, 문서와 운영 자동화만 둡니다.

`@/*`는 `apps/web/src/*`, `@admin/*`는 `apps/admin-web/src/*`를 가리킵니다.
애플리케이션끼리 서로의 source를 import하는 것은 금지합니다. 현재 API→Web 직접 참조는
레거시 ratchet으로 측정되는 migration debt이며, 문서상 완료 상태로 간주하지 않습니다.

## 현재 디렉터리 책임

```text
apps/web/                         # 사용자·창작자 브라우저 애플리케이션
  config/                         # Web 전용 Vite 정책과 수동 청크 규칙
  index.html                      # Web 프로덕션 HTML 진입점
  public/                         # URL로 직접 제공되는 정적 자산
  src/
    app/                          # 부트스트랩, 라우팅, 서비스 워커, 앱 셸
    domains/                      # 제품 도메인별 UI·유스케이스·모델
    shared/                       # 도메인을 모르는 Web 공용 코드
    infrastructure/              # platform으로 이전 중인 레거시 adapter
    compat/, components/, hooks/ # 소유 영역으로 이전 중인 레거시 경계

apps/admin-web/                   # 독립 관리자 Frontend workspace package
  package.json
  vite.config.ts
  playwright.config.ts
  src/
    app/                          # bootstrap, shell, app-wide styles
    domains/                      # 관리자 capability
    platform/                     # HTTP·auth·telemetry adapter
    shared/                       # Admin 전용 공용 UI·순수 helper

apps/api/                         # 서버 전용 NestJS workspace package
  src/modules/                    # 기능 모듈과 HTTP 경계
  src/infrastructure/             # platform으로 이전 중인 adapter
  src/db/                         # schema·migration·seed
  src/server/                     # modules로 이전 중인 레거시 유스케이스

packages/                         # focused contracts, pure models, Studio engines
scripts/, tools/, e2e/, tests/    # 저장소 횡단 도구와 검증 코드
```

브라우저 fixture와 harness는 Vite root인 `apps/web` 아래의 `tests/browser-fixtures`와
`tools/browser-harnesses`가 정본입니다. 같은 파일을 루트에 복제하지 않습니다.

## 의존성 방향

```text
app      -> domains, platform, shared
domains  -> same domain, reviewed public integration, platform, shared
platform -> shared
shared   -> shared

web / admin-web / api -> focused packages
application source    -X-> another application source
```

- `shared -> domains`, `platform -> domains`, `shared -> app`은 금지합니다.
- 도메인 간 deep import는 `public` 또는 `integrations` 경계로 수렴시킵니다.
- Web과 API가 함께 써야 하는 DTO/schema/protocol은 Node·DOM·React·NestJS·DB 구현에서
  분리한 뒤 `packages/contracts`에서 공개합니다.
- Studio는 페이지 분류보다 document, commands, history, persistence, rendering,
  collaboration, durability, tools 같은 runtime authority와 lifecycle을 우선합니다.
- 기존 예외는 ratchet으로 증가를 막고 안정된 migration slice마다 예산을 낮춥니다.

## 검증과 생성물 정책

`pnpm run validate:architecture`는 canonical entry, workspace package, 문서·스크립트,
경로 재등장과 애플리케이션 경계를 검사합니다. `dist`, `coverage`, `qa-results`,
Playwright screenshot과 임시 진단 파일은 소스가 아니며 CI artifact 또는 재현 가능한
명령으로 생성합니다.

목표 구조와 단계별 이전 규칙은 `docs/architecture/modular-monorepo-target.md`를 따릅니다.
