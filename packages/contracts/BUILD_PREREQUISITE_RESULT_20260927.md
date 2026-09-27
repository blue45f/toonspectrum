# 공유 계약 빌드 선행 오류 복구 결과 — 2026-09-27

## 범위와 기준

- 작업 트리: `toonstudio-3d-authoring-qa-20260927`
- 브랜치: `codex/3d-authoring-qa-20260927`
- 기준 HEAD: `2ac94220c9b0115348a734d0b7f7769e800d42db`
- 소유 수정: 이 결과 문서를 포함한 `packages/contracts/**` 33개 파일과 `pnpm-lock.yaml` 1개.
- 다른 작업자의 character/scene/UI/e2e 및 기존 dirty 변경을 수정하지 않았다. 앱/API/DB/운영 설정을 수정하지 않았다.
- 커밋, push, PR 생성, 병합, CI/ratchet 수정, 배포, 서버 시작을 실행하지 않았다.

## 독립 적용한 출처와 필요성

PR2146 로컬 이력의 고정 SHA `3246e435fed65ae229c160587e9a93315ef28709`에서 계약 패키지 변경만 읽고 적용했다. 해당 계약 변경의 실제 도입 커밋은 `370b2eb25cb6776c3304205e0be5ec7edfc443fe`이다. 브랜치를 병합하거나 API/DB 변경을 가져오지 않았으며 PR2146의 병합 완료를 주장하지 않는다.

| 파일 또는 범위 | 필요성 |
| --- | --- |
| `src/types.ts`, `recommend.ts`, `search.ts`, `taxonomy.ts` | 옛 위치에 맞춘 core 상대 경로 복구. core 전체 barrel 대신 필요한 순수 타입·값 공개 |
| `src/creator-resource-workflow.ts`, `reference-assets.ts` | 존재하지 않는 creator-resources와 reference-query 경로를 기존 core 공개 subpath로 교체 |
| Studio 계약 20개 | 끊긴 domains 재-export 및 그 전이 계약을 기존 범용 구현으로 복구 |
| `src/rate-limit.ts` | 자기 재-export를 기존 45줄 구현으로 복구 |
| `src/studio-codec-provider-contract.ts`, `studio-product-codec-certification.ts` | 패키지가 소유한 sha256-portable 및 서명 계약으로 경로 복구 |
| `package.json` | 필요한 공개 subpath 5개와 직접 의존성 선언 |
| `tsconfig.json` | DOM lib 추가 없이 Node의 공통 Web API 타입 활성화 |
| `src/public-exports.test.ts` | 공개 경로 및 복구한 계약 동작의 회귀 검사 |

Studio 이동 파일은 adjustment-engine-ids, crdt-binary-envelope, crdt-raster-compaction, crdt-raster-document-contract, crdt-raster-ops, filter-mask-surface-contract, ink-input-contract, linked-3d-pass-asset-fence, live-auth-ticket, live-jam-scope, live-lock-resource, raster-asset-admission, raster-asset-contract, remote-reference-image-contract, team-comment-live-event, voice-ice-policy-contract, live-adjustment-contract, smart-filter-stack-contract, work-asset-contract, ink-envelope-webcrypto-attestation이다. 파일명 앞에는 모두 `studio-`가 붙는다.

기준 main의 기존 웹 구현과 대조한 결과 15개는 바이트가 같고, 4개는 import 정렬·빈 줄·마지막 개행만 다르다. WebCrypto 파일은 기존 서명/검증 동작을 유지하면서 앱 codec의 구조 동일 인터페이스를 계약이 소유하도록 조정했다. Crypto 타입은 Node/브라우저 공통 전역으로 표현하고 namedCurve는 DOM 전용 타입 단언 대신 속성 존재로 좁혔다. 독립 ES2022/Node 타입검사에 필요한 변경이다.

rate-limit 출처는 중앙화 전 `f176885e6ed78e714d18ab8135f3f9a97e7ab07d:apps/web/src/shared/lib/rate-limit.ts`와 바이트가 같다. 제한·헤더 해석 정책을 새로 설계하지 않았다.

실제 catalog 한정 타입검사에서 출처 패키지 수정만 적용하면 `deriveSavedTitleIds`가 빠지는 것을 추가 발견했다. 앱을 수정하지 않고 `types.ts`에 기존 `packages/core/src/library/store.ts`의 순수 집합 계산과 최소 CollectionLike 구조만 옮겼다. 원본 AST 노드와 일치하며 localStorage/브라우저 저장소 어댑터를 import하지 않는다. 현재 Web/Admin/API/packages/tests의 types 소비 import 103개, 이름 52개를 현재 공개 이름 88개와 대조해 누락 0개를 확인했다.

`reference-assets.ts`의 기존 제어문자 정규식은 strict ESLint에서 실제 실패하여 출처와 같은 문자 코드 검사로 교체했다. 검사 범위와 반환 동작은 동일하다. 출처의 `index.ts` 확장자 정리는 이 오류 복구에 필요하지 않아 제외했다. 기존 구현 주석은 출처 대조를 위해 원문을 유지했다.

## 의존성과 lockfile

직접 의존성은 `@toonstudio/core: workspace:*`, `yjs: ^13.6.31`, `zod: ^4.4.3`, 개발 타입 의존성은 `@types/node: ^24.13.2`이다.

lockfile은 pnpm 11.4.0의 정상 `install --offline --ignore-scripts --lockfile-only` 생성 결과다. 항목을 수동으로 수정하지 않았다. 원본 패키지 캐시의 쓰기 제한 때문에 해석에 필요한 캐시를 임시 경로에 복사했으며 pnpm 구현이나 전역 설정을 바꾸지 않았다. 중복 정리를 줄이는 일회성 옵션도 비교했으나 산출물은 같았다.

최종 lockfile diff는 38줄이다. 계약 importer 추가 외에 pnpm이 다음 기존 해석을 정리했다.

- `@types/pg`의 전이 `@types/node`: 22.19.19 → 이미 사용 중인 24.13.2. 사용되지 않게 된 Node 22와 undici-types 6 항목 제거.
- `babel-plugin-react-compiler`의 전이 Zod 및 zod-validation-error peer: 4.4.3 → 이미 사용 중인 4.5.4.
- 다른 workspace의 직접 의존성 importer와 package.json은 바꾸지 않았다. 새로운 외부 버전을 도입하지 않았다.

2026-09-27 21:54 KST 사용자 인계에 따라 주 작업자의 `CI=true pnpm install --offline --frozen-lockfile --ignore-scripts` 완료 후 재설치를 중단했다. 이후 lib.es2022.d.ts 존재, workspace 링크 26개, lockfile importer 18개를 직접 재확인했다.

## 실제 검증

증거 로그는 `/private/tmp/contracts-final-*-20260927.log`에 있다.

| 검증 | 결과 | 로그 접미사 |
| --- | --- | --- |
| `pnpm --filter @toonstudio/contracts typecheck` | 통과, exit 0 | package-types |
| 정상 앱 설정을 사용한 catalog 한정 타입검사 | 35개 진입 파일, 의존 소스 734개, 오류 0, exit 0 | catalog-types |
| 계약 Vitest `--maxWorkers=1` | 3개 파일, 51개 테스트 통과 | tests |
| 변경 TypeScript strict ESLint | 30개 파일, 경고 0 통과 | lint-secrets |
| 변경 파일 Secretlint | 코드·설정·lockfile 33개 통과, 결과 문서 1개 별도 통과 | lint-secrets 및 문서 별도 실행 |
| 정상 Vite 공개 import 및 빌드 | 63개 진입점, 205개 모듈, 66개 출력 통과 | vite-build |
| `pnpm validate:architecture` | 통과. contracts→apps, package→apps, 계약 금지 import 모두 0 | architecture |
| `pnpm audit:licenses` | 통과. 설치 production graph 및 기존 WASM 고지 검사 | licenses |
| `pnpm audit:security` | 미완료. 예외 없음 검사는 통과, npm 감사 서버 DNS ENOTFOUND로 exit 1 | security |
| workspace 링크 / lockfile importer | 26개 링크 / 18개 importer 통과 | 직접 실행 |
| 소유 코드·lockfile `git diff --check` | 통과 | 직접 실행 |

Vite 검증은 저장소의 `apps/web/vite.config.ts`와 기존 resolver로 공개 package subpath가 현재 작업 트리의 contracts를 가리키는지 확인한 뒤 그 진입점의 의존 그래프를 실제 빌드했다. contracts alias를 추가하지 않았다. 비밀 파일 접근 방지를 위해 dotenv 로딩만 끄고, 출력은 메모리에 유지했으며 앱 dist와 실행 중 서버를 건드리지 않았다. 전체 앱 production 빌드·실브라우저 검증을 대체하지 않는다.

테스트는 공개 경로 30개와 자기 재-export 회귀, CSRF, rate-limit 만료/키 분리, IP 헤더 순서, jam 범위, binary envelope 소유 바이트·손상·분할 복원, CRDT 큰 시계, 필터 마스크, 저장된 작품 집합을 검증한다. `.env.local` 자동 읽기를 막는 loopback 테스트 URL을 명시했으며 애플리케이션 DB에는 접속하지 않았다.

## 최종 타입검사 및 하네스

정상 의존성에서 패키지 타입검사와 catalog 한정 타입검사를 모두 다시 통과했다. Catalog 검사는 저장소 tsconfig의 옵션과 실제 vite-env 선언을 사용하고, catalog 도메인·공유 catalog의 제품 소스 34개와 vite-env 1개를 진입점으로 삼았다. 의존 소스 734개에서 진단 0개다. 의존성 재생성 중 발생한 이전 10,700개 진단은 정상 소스의 오류나 성공 근거로 사용하지 않는다.

전체 작업 트리 검사 두 건은 보고서 작성 시점에 아직 실행 중이므로 완료·통과를 주장하지 않는다. 별도 작업자들의 진행 중 변경도 포함하는 검사이며, 이 담당 작업의 계약/catalog 정상 타입검사와 구분한다.

- 전체 웹: `NODE_OPTIONS=--max-old-space-size=12288 pnpm exec tsc -p tsconfig.json --incremental false`. 로그 `/private/tmp/contracts-final-web-types-20260927.log`, 실행 세션 34108. 아직 진단 출력·종료 코드가 없다.
- 전체 하네스: `pnpm harness:verify`. 로그 `/private/tmp/contracts-final-harness-20260927.log`, 실행 세션 46278. 하네스 구조·자체 테스트 5개·lockfile 검사 후 전체 dirty 파일 165개의 lint 단계까지 확인했으며 종료 결과는 아직 없다.

다른 작업자가 수정 중인 3D 코드의 오류를 아직 최종 진단으로 얻지 못했으므로, 해당 경로의 정상 여부나 오류 수를 추정하지 않았다. 주 작업자가 위 로그와 실행 결과를 이어서 확인해야 한다.

## 인계와 명확한 미완료

- 주 작업자는 임시 contracts alias가 없는 정상 설정으로 기존 Vite 서버를 최종 재시작하고 진행 중인 3D 기능의 실제 화면을 확인해야 한다. 이 담당 작업에서는 새 서버를 시작하지 않았다.
- 전체 앱 production build, 브라우저·모바일·실기기, 원격 CI, 보안 감사 서버 결과는 이 패키지 검증만으로 통과를 주장하지 않는다.
- 패키지 전체 strict ESLint의 초기 확장 검사에서는 이번에 수정하지 않은 `creator-marketplace-starter-catalog.ts:9,10`의 import 순서 경고 2개와 `creator-publication-contract.ts:97`의 기존 제어문자 정규식 오류가 있었다. 요청 범위를 넓혀 수정하지 않았다. 최종 통과한 strict ESLint는 실제 변경 TypeScript 30개 파일이다.
- 모든 소유 변경은 미스테이징·미커밋 상태로 인계한다. PR2146 및 main을 병합하지 않았고 배포하지 않았다.
