# ToonSpectrum 아키텍처

- 상태: **현재 구조 + 진행 중인 마이그레이션**
- 최종 갱신: **2026-09-26**
- 적용 범위: 저장소 구조, 애플리케이션 경계, 공유 패키지, 테스트·도구·문서 소유권

## 1. 권위 순서

아키텍처 사실이 충돌할 때는 다음 순서로 판단한다.

1. 실제 소스, `package.json`, workspace 설정과 테스트
2. 기계 검사 원장과 ratchet 설정
   - `config/architecture-boundary-ratchet.json`
   - `config/architecture-source-ratchet.json`
   - `packages/studio-engine-registry/src/renderer-roles.ts`
3. 이 문서와 `docs/architecture/`의 현재 문서
4. 승인된 ADR
5. 역사적 보고서·감사·벤치마크 문서
6. OpenWiki 탐색 문서

과거 설계안이나 보고서에 현재 소스와 다른 경로가 있으면 소스와 기계 원장을 우선한다.

## 2. 현재 저장소 지도

```text
apps/
  web/                    사용자·창작자용 Vite/React 웹 애플리케이션
  admin-web/              독립 관리자 웹 애플리케이션
  api/                    NestJS API 애플리케이션
  mobile/                 Capacitor 기반 Android/iOS 래퍼
  desktop-sync/           로컬 폴더·클라우드 양방향 동기화 애플리케이션

services/
  creator-inference/      별도 배포하는 선택형 GPU 추론 서비스

packages/
  contracts/              실행 환경에 중립적인 교차 앱 계약
  core/                   기존 공용 순수 모델과 계약
  play-core/              플레이 기능 공용 코어
  product-tour-film/      제품 투어 영상 패키지
  studio-*/               Studio 문서·명령·엔진·포맷 경계

config/                   기계 판독 정책과 아키텍처 ratchet
data/                     검토된 카탈로그·에셋 릴리스 자료
deploy/                   Cloudflare·Coturn 등 배포 단위
scripts/                  저장소 횡단 생성·검증·운영 스크립트
tests/
  integration/            앱·패키지 사이 교차 경계 테스트
  benchmarks/             재현 가능한 성능·품질 비교
  corpus/                 테스트 코퍼스
  visual/                 시각·렌더링 검증

tools/                    제품 번들 밖의 제작·자동화·DCC 도구
docs/                     현재 문서, ADR, 역사 기록과 검증 증거
openwiki/                 코드 탐색용 보조 문서
```

루트에는 workspace 설정, 공통 TypeScript·ESLint·Vitest·Playwright 오케스트레이션,
저장소 횡단 검증과 운영 문서만 둔다. 특정 애플리케이션의 실행 설정은 해당 앱이 소유한다.

## 3. 애플리케이션 소유권

### 3.1 Web

`apps/web`은 사용자·독자·창작자 브라우저 애플리케이션이다. 루트 `package.json`이 아직 Web의
의존성과 일부 명령을 함께 소유하지만, Web 전용 진입점과 설정은 앱 안에 있다.

```text
apps/web/
  index.html
  vite.config.ts
  config/                  Vite chunk·compiler 정책
  public/                  URL로 직접 제공되는 정적 자산
  tests/browser-fixtures/  Web 전용 브라우저 fixture
  tools/browser-harnesses/ Web 전용 브라우저 harness
  src/
    app/                    부트스트랩, 라우팅, 앱 셸, 전역 스타일
    domains/                제품 도메인과 capability
    platform/               HTTP, 브라우저, 저장소, 외부 서비스 adapter
    shared/                 도메인을 모르는 공용 UI·hook·탐색·SEO·순수 helper
```

`@/*`는 `apps/web/src/*`를 가리킨다.

### 3.2 Admin Web

`apps/admin-web`은 `@toonspectrum/admin-web`이라는 독립 pnpm workspace package다. 자체 Vite,
TypeScript, Vitest, Playwright 설정과 `dist/` 출력을 소유한다.

```text
apps/admin-web/src/
  app/
  domains/
  platform/
  shared/
```

기존 `apps/web/src/domains/admin` 기능은 마이그레이션 부채다. 기능 단위로 route, API client,
번역, 테스트를 함께 옮긴다. Admin은 Web이나 API의 소스를 직접 import하지 않는다.

### 3.3 API

`apps/api`는 `@webtoon-nest/api` workspace package이며 NestJS HTTP/WebSocket, DB, 영속성,
외부 서비스 연동을 소유한다.

```text
apps/api/
  drizzle.config.ts
  src/
    modules/          기능 모듈과 HTTP/WebSocket 경계
    infrastructure/   외부 서비스·DB·object storage adapter
    platform/         신규 federation 연결 정책(현재 기본 비활성)
    db/               schema, migration, seed
    server/           modules/platform으로 이전 중인 레거시 유스케이스
    common/           축소 중인 레거시 공용 계층
    config/           서버 설정과 보안 정책
    runtime/          서버 실행 수명주기
```

운영 진입점은 `apps/api/src/main.ts`다. API가 Web 소스를 직접 import하는 기존 참조는
마이그레이션 부채이며 새로운 참조는 늘릴 수 없다.

### 3.4 Mobile

`apps/mobile`은 Capacitor wrapper와 native project를 한 workspace에서 소유한다.

```text
apps/mobile/
  android/
  ios/
  shell/
  resources/
  scripts/
  capacitor.config.ts
```

native wrapper는 검토된 Web origin을 로드한다. 서명, 스토어 제출, 운영 origin 변경과 권한 변경은
빌드·머지와 별도의 승인 작업이다.

### 3.5 Desktop Sync

`apps/desktop-sync`는 로컬 폴더와 Google Drive·Dropbox·OneDrive 사이의 충돌 안전 동기화를
소유한다. 과거 별도 workspace였던 local agent는 `src/local-agent`로 통합했다.

```text
apps/desktop-sync/src/
  local-agent/       폴더 스캔, polling, append journal, upload grant
  cloud/             클라우드 provider adapter
  agent.ts           검증된 동기화 계획 실행
  planner.ts         양방향 비교와 충돌 분류
  conflict-*.ts      명시적 충돌 검토와 해결
```

## 4. 공유 패키지 원칙

애플리케이션은 필요한 좁은 공용 패키지를 향해 의존한다.

```text
apps/web       ─┐
apps/admin-web ─┼──> packages/*
apps/api       ─┘
```

다음 규칙을 지킨다.

- 애플리케이션 소스는 다른 애플리케이션의 라이브러리가 아니다.
- `packages/*`는 `apps/*` 소스를 import하지 않는다.
- `packages/contracts`에는 React, DOM, NestJS, DB client, HTTP client, storage adapter를 넣지 않는다.
- 두 번째 실제 소비자가 없는 코드를 성급하게 패키지로 승격하지 않는다.
- `packages/domains/*`는 만들지 않는다. 도메인 구현은 해당 앱의 `domains`에 둔다.
- 공용 패키지를 앱 결합을 숨기는 우회 경로로 사용하지 않는다.

## 5. 앱 내부 의존성 방향

Web과 Admin의 기본 방향은 다음과 같다.

```text
app      -> domains, platform, shared
domains  -> 같은 domain, 명시적 public/integrations 경계, platform, shared
platform -> shared
shared   -> shared
```

금지 규칙:

- `shared -> domains`
- `platform -> domains`
- `shared -> app`
- 다른 domain의 내부 구현 deep import

도메인 간 호출이 필요하면 대상 domain의 `public` 또는 호출자 쪽 `integrations` 경계를 사용한다.
기존 Web deep import는 ratchet으로 측정하며 새 위반을 추가하지 않는다.

## 6. 교차 애플리케이션 테스트

한 앱이나 패키지의 테스트가 다른 앱 소스를 직접 검증해야 하면 구현 폴더에 두지 않는다.

```text
tests/integration/
  api-web/       API가 Web 계약·동작을 함께 검증하는 테스트
  web-api/       Web이 API 경계를 함께 검증하는 테스트
  package-web/   package와 Web의 실제 결합을 검증하는 테스트
```

앱 내부 테스트는 자기 앱의 경계만 검증한다. `scripts/validate-app-boundaries.mjs`는
`apps/*/src`와 `packages/*/src` 아래의 교차 앱 테스트를 허용하지 않는다.

## 7. Studio 경계

Studio는 일반 페이지 폴더보다 문서 권위와 수명주기를 우선한다.

- 현재 제품 경계: `docs/architecture/studio-current-boundaries.md`
- 렌더러 역할의 기계 원장: `packages/studio-engine-registry/src/renderer-roles.ts`
- 생성 문서: `docs/engines/renderer-roles.md`
- 관련 ADR: `docs/adr/0019-renderer-role-ledger-single-authority.md`

Studio를 단순히 `components/hooks/utils` 형태로 평탄화하거나 `packages/domains`로 옮기지 않는다.
문서, 명령, history, persistence, rendering, collaboration, durability, assets, tools 권위를 분리한다.

## 8. 설정 소유권

| 설정 | 소유자 |
| --- | --- |
| Web Vite | `apps/web/vite.config.ts` |
| Admin Vite/TS/Playwright | `apps/admin-web/` |
| API Drizzle | `apps/api/drizzle.config.ts` |
| Mobile Capacitor/native | `apps/mobile/` |
| 저장소 공통 TypeScript/ESLint/Vitest/Playwright | 루트 |
| HTTP 응답 헤더 원장 | `config/http-response-headers.json` |
| Cloudflare 정적 배포 | `deploy/cloudflare-static/` |

루트 `vite.config.ts`, `drizzle.config.ts`, `capacitor.config.ts`, `android/`, `ios/`는 금지한다.

## 9. 현재 마이그레이션 부채

수치는 2026-09-26의 ratchet 기준이며 설정 파일이 최종 권위다.

| 항목 | 현재 상한 |
| --- | ---: |
| API -> Web 직접 소스 참조 | 145 |
| Web `shared -> domains` | 44 |
| Web cross-domain deep import | 54 |
| Creator domain 최상위 직접 파일 | 3,440 |
| Web에 남은 Admin 파일 | 71 |
| API `server` 파일 | 64 |
| API `common` 파일 | 11 |
| API `infrastructure` 파일 | 78 |
| API `db` 파일 | 138 |
| `packages/core` 파일 | 124 |

다음 항목은 0으로 고정한다.

- Web -> Admin/API
- Admin -> Web/API
- packages -> apps
- Admin `shared -> domains`
- Admin cross-domain deep import
- 교차 앱 테스트의 앱·패키지 소스 내부 배치
- 제거한 루트 mobile/tool/config 경로의 재등장

예산을 맞추기 위해 ratchet을 올리지 않는다. 안정된 마이그레이션 조각이 완료될 때마다 실제 수치로
내린다.

## 10. 생성물과 임시 파일 정책

다음은 소스가 아니다.

- `dist/`, `coverage/`, `qa-results/`, `.qa/`, `artifacts/`
- Playwright screenshot·trace·브라우저 로그
- 일회성 진단 JSON, 임시 migration script, branch 복구 메모
- 생성 가능한 media output과 압축 백업

필요하면 CI artifact나 재현 가능한 명령으로 생성한다. 검토된 장기 에셋 릴리스 증거만
`data/asset-releases`에 둔다.

## 11. 문서 정책

문서는 `docs/README.md`의 분류를 따른다.

- 현재 문서에는 `현재`, `마이그레이션`, `목표`, `역사 자료` 상태를 명시한다.
- 과거 설계·감사 문서는 현재 구현을 덮어쓰지 않는다.
- 실행 지시용 프롬프트, 임시 연구 메모, 중복 복사본은 유지 문서로 커밋하지 않는다.
- 문서 경로와 내부 링크는 `pnpm run validate:documentation`으로 검사한다.
- 한국어가 저장소 문서의 기본 언어다. 외부 원문·법적 고지·생성 파일은 예외다.

## 12. 검증 명령

```sh
pnpm run validate:documentation
pnpm run validate:architecture
pnpm run verify:toolchain-coverage
pnpm run typecheck
```

아키텍처 변경은 문서만 고치지 말고 ratchet, 테스트, 경로 원장과 함께 반영한다.
