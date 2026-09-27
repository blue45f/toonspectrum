# 계약 이전 누락 복구 — 2026-09-27

- 상태: **current / migration**
- 구현 출처: 커밋 `2ac94220c9b0115348a734d0b7f7769e800d42db`
- 범위: 계약 이전 후 끊어진 import/export, 공용 구현의 단일 권위, 패키지 타입 정의와 의존성
- 관련 기록: [사이트 전수 검토](../design/sitewide-review-20260927.md), [모듈형 구조 목표](../architecture/modular-monorepo-target.md)

## 복구를 디자인 변경과 함께 검증하는 이유

사이트 UI 작업을 시작한 기준 커밋에서 전체 typecheck에 794개 오류가 있었다.
contracts 파일이 이전 웹 디렉터리 기준 상대 경로를 계속 참조하여 `pnpm dev`의
카탈로그 생성도 시작하지 못했다. core 재-export 5개를 먼저 복구해 서버를 연 뒤에도
479개 오류가 남았고, 공개 자료 화면에서는 `creator-resource-workflow`의 누락 import가
Vite 오류 화면을 만들었다. 이 상태로는 디자인 변경의 브라우저 결과와 전체 CI를
신뢰할 수 없어, 검증을 막는 기존 결함 복구를 디자인 변경과 구분한 커밋으로 준비한다.

이 복구는 이미 커밋된 구현과 동작을 유지한다. 새로운 Studio 기능이나 문서 권한을
추가하지 않으며 CI·보호 규칙·테스트를 우회하지 않는다. 다른 세션이 소유한 주 작업트리의
미커밋 16개 수정 파일과 신규 4개 파일은 복사하거나 수정하지 않았다. 구현 출처는
위 SHA에 저장된 파일이며 작업 대상은 현재 UI 변경용 작업트리다.

## current — Studio 공용 계약의 단일 권위

`packages/contracts/src`의 Studio shim 15개가 존재하지 않는
`../../domains/creator/contracts/...`를 참조했다. 해당 구현은 기준 커밋의
`apps/web/src/domains/creator/contracts`에 남아 있었다. 이 15개와 실제로 필요한
순수 의존성 4개를 contracts로 옮기고, 원래 웹 경로는 공용 계약을 재-export하도록 했다.

| 범위 | 파일명 | 수 |
| --- | --- | ---: |
| CRDT | `studio-crdt-binary-envelope`, `studio-crdt-raster-compaction`, `studio-crdt-raster-document-contract`, `studio-crdt-raster-ops` | 4 |
| 입력·마스크 | `studio-ink-input-contract`, `studio-filter-mask-surface-contract` | 2 |
| 에셋·참조 이미지 | `studio-work-asset-contract`, `studio-raster-asset-contract`, `studio-linked-3d-pass-asset-fence`, `studio-remote-reference-image-contract` | 4 |
| 협업·실시간 통신 | `studio-live-auth-ticket`, `studio-live-jam-scope`, `studio-live-lock-resource`, `studio-team-comment-live-event`, `studio-voice-ice-policy-contract` | 5 |
| 구현의 로컬 의존성 | `studio-adjustment-engine-ids`, `studio-live-adjustment-contract`, `studio-raster-asset-admission`, `studio-smart-filter-stack-contract` | 4 |

표의 파일 확장자는 모두 `.ts`다. 의존 방향은 웹·API → contracts이며 contracts에서
앱 소스로 돌아가는 import를 추가하지 않았다. core의 공개 순수 모델을 사용하는
의존성은 contracts → core이며, core 소스와 package manifest에는 contracts 참조가
없어 이 변경으로 순환을 만들지 않는다. 기존 Studio document/runtime authority,
저장·협업·undo 계약은 이 경로 복구로 바꾸지 않는다.

### 기준 소스와의 동일성 확인

19개 구현을 `git show <기준 SHA>:<원래 웹 경로>`와 비교했다.

- 16개 파일은 바이트 단위로 같다.
- 3개 파일은 ESLint에 필요한 import 순서·빈 줄만 다르다.
- import 순서를 정렬하고 TypeScript AST를 정규화한 결과 19개 모두 같다.

비교 결과는 작업용 `.qa/contracts-source-equivalence.json`에 기록했다. `.qa`는 로컬
검증 산출물이며 계약 소스의 새 권위가 아니다. 구현 원본과 변경 후 구현은 위 SHA와
현재 diff에서 다시 대조할 수 있다.

## current — codec와 주변 이전 누락

codec provider와 product certificate의 `./studio-sha256` 참조는 contracts의 기존
`sha256-portable` 구현을 사용하도록 고쳤다. product certificate에 필요한 WebCrypto
adapter는 기준 커밋의 `brush/studio-ink-envelope-webcrypto-attestation.ts`에서 가져왔고,
의존하던 signer/verifier 인터페이스 2개만 별도 순수 계약으로 추출했다.

adapter는 공용 인터페이스를 참조하고 기존 웹 경로는 이를 재-export한다. 전체 ink codec나
브러시 runtime을 contracts로 옮기지 않았다. 인터페이스는 원문과 같으며 codec provider,
product certificate, WebCrypto adapter의 구현 비교에서는 import 경로 조정 외의 동작
변경이 없음을 확인했다. 키 소유권·서명 알고리즘·검증 규칙도 유지한다.

함께 복구한 주변 누락은 다음과 같다.

| 대상 | 문제와 복구 |
| --- | --- |
| core 재-export | contracts의 `search`, `types`, `taxonomy`, `recommend`, `reference-assets`가 현재 위치에 맞는 `../../core/src/...`를 참조하도록 수정 |
| 창작 자료 계약 | `creator-resource-workflow`와 `reference-assets`의 누락 `creator-resources` 참조를 기존 core 권위에 연결 |
| API 인증 스키마 | `../@toonstudio/contracts/...`로 잘못 작성된 2개 import를 정상 package subpath로 수정 |
| rate limit | 자기 자신을 재-export하던 contracts 진입점에 기존 커밋의 구현을 복구하고 기존 웹 호환 진입점 유지 |
| 인증 암호화 테스트 | 삭제된 웹 구현을 찾던 테스트를 실제 구현이 있는 API auth 디렉터리로 이동하고 import 수정 |
| strict lint | 웹 `image-attach`의 import 위치·미사용 binding, starter catalog의 import 순서를 정리 |
| 공개 문구 정리 | 제어 문자 리터럴 regex를 동등한 Unicode `Cc` 판정으로 바꾸고 문자 코드 0~159 전체의 보존·제거 결과를 회귀 테스트로 확인 |

제어 문자 처리는 기존과 같이 C0 중 탭·줄바꿈·캐리지리턴을 보존하고 나머지 대상 문자와
DEL을 제거한다. 기존에 보존하던 C1 문자는 계속 보존한다. lint를 없애기 위해 검사 범위를
완화하거나 문자열 정리 정책을 확장하지 않았다.

## current — 패키지 정의와 lockfile

contracts가 직접 사용하는 `@toonstudio/core` workspace, `yjs` 13.6.31,
`zod` 4.4.3을 package manifest에 선언했다. 테스트 타입에는 루트와 같은
`@types/node` 24.13.2를 개발 의존성으로 선언했다. 패키지 경계 밖 앱 소스에 대한
직접 참조나 새 유료 서비스 의존성은 없다.

단독 contracts typecheck는 기존 `lib: ["ES2022"]`, `types: []` 설정 때문에
`URL`, `Request`, `TextEncoder`, WebCrypto 표준 타입과 테스트의 `Buffer`를 찾지 못했다.
`DOM`·`DOM.Iterable` 표준 정의와 Node 타입을 추가하고 avatar 테스트의 `Buffer` import를
명시했다. 이 변경은 컴파일러 타입 정의를 맞추며 운영 runtime을 추가하지 않는다.
`strict`와 전체 `src/**/*.ts` 검사를 유지하고 테스트 제외·skip을 추가하지 않았다.

lockfile은 pnpm으로 생성했으며 수동 편집하지 않았다. contracts importer 추가 외에
기존 `p5@2.3.1`의 zod 참조가 4.5.4에서 이미 저장소가 사용하는 4.4.3으로 합쳐지는
1줄 변화가 있다. 원본 lockfile에서 다시 생성해도 같은 결과여서 부수 변경으로 기록한다.
새 버전을 추가하는 변경은 아니며 frozen lockfile 설치, 관련 테스트, 보안·라이선스
검증을 함께 수행했다.

## 검증 결과와 남은 경계

2026-09-27 실행 결과를 다음과 같이 구분한다.

| 검증 | 결과 |
| --- | --- |
| 계약·WebCrypto·codec provider·product certificate·SHA·자료 workflow·reference assets·avatar 테스트 | 18개 파일, 179개 테스트 통과 |
| API auth-crypto 테스트 | 5개 통과 |
| rate-limit 테스트 | 5개 통과 |
| 기준 소스와 구현 비교 | 19개 동일성 확인, codec 관련 3개 import 경로만 조정, 인터페이스 2개 원문 추출 |
| contracts 단독 TypeScript 검사 | 통과 |
| 담당 계약 파일 ESLint `--max-warnings=0`·Secretlint | 통과 |
| `pnpm validate:architecture` | 통과. `packagesToApps`, `contractsToApps`, `contractsForbiddenImport` 모두 0 |
| `pnpm audit:security` | 예외 advisory 없음, 알려진 취약점 없음 |
| `pnpm audit:licenses` | 통과. pnpm 573개 항목, Vello CPU/GPU 85/137개 crate, WASM inventory 3개 검사 |
| `pnpm install --offline --ignore-scripts --frozen-lockfile` | 통과 |
| 루트 전체 TypeScript·웹 build·통합 harness | 이 문서 작성 시 진행 중. 해당 실행의 최종 종료 상태로 별도 판정 |
| PR CI·main 병합 | 이 문서 작성 시 완료 근거 없음 |

대표 재검증 명령은 저장소 루트에서 실행한다.

```sh
pnpm exec vitest run --maxWorkers=2 \
  apps/web/src/domains/creator/contracts \
  apps/web/src/domains/creator/brush/studio-ink-envelope-webcrypto-attestation.test.ts \
  apps/web/src/domains/creator/studio-codec-provider-contract.test.ts \
  apps/web/src/domains/creator/studio-product-codec-certification.test.ts \
  apps/web/src/domains/creator/studio-sha256.test.ts \
  tests/creator-resource-workflow.test.ts \
  tests/reference-assets.test.ts \
  packages/contracts/src/avatar.test.ts

pnpm exec tsc -p packages/contracts/tsconfig.json --noEmit
pnpm validate:architecture
pnpm audit:security
pnpm audit:licenses
```

구현 복구와 위 범위의 검증은 완료했다. 루트 typecheck·build·CI·전체 브라우저 관측이
통과했다고 이 문서만으로 판단하지 않는다. main 병합은 배포 승인이 아니며 운영 배포는
별도 명시적 승인과 지정 SHA 검증이 필요하다.
