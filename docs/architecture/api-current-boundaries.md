# API 현재 폴더 경계

> 현재 기준일: 2026-09-27

## 목표

`apps/api/src`는 HTTP 진입점과 도메인 모듈, 런타임 플랫폼을 분리한다.

```text
apps/api/src/
├── app.ts / app.module.ts / main.ts
├── modules/                 # 도메인·기능별 Nest 모듈
├── platform/
│   ├── http/                # 예외 필터, validation, 요청 경계
│   ├── adapters/            # 외부 서비스·스토리지·큐·capability adapter
│   ├── database/            # Drizzle schema, migration, DB connection
│   └── federated-data-plane/
├── runtime/                 # 프로세스 런타임 조립
├── realtime/                # realtime transport
└── server/                  # 아직 도메인별 모듈 전환이 필요한 legacy service
```

## 금지되는 신규 루트

- `src/common`
- `src/infrastructure`
- `src/db`

새 공통 HTTP/플랫폼 코드는 `platform` 아래에 둔다. DB migration과 schema는 `platform/database`가 단일 소유권이다.

## 남은 server 전환

`src/server`의 65개 파일은 인증·creator·community·catalog 등 여러 도메인의 서비스가 혼합되어 있어 일괄 이동하지 않는다. 각 도메인 모듈이 해당 서비스의 유일한 소비자가 된 뒤 파일 단위로 `modules/<domain>`으로 이전한다.

## Core 경계

`packages/core/src/server`는 서버 전용 계층이 아니라 브라우저/API가 공유하는 catalog read-model이었다. 현재 `packages/core/src/catalog`으로 통합했으며 소비자는 `@toonspectrum/core/catalog`을 사용한다.

## 검증

```bash
node scripts/validate-source-layout.mjs
node scripts/validate-app-boundaries.mjs
./node_modules/.bin/tsc -p apps/api/tsconfig.json --pretty false
```
