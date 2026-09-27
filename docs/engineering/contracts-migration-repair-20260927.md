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
신뢰할 수 없어, 검증을 막는 기존 결함 복구를 디자인 변경과 구분한 커밋으로 반영했다.
계약 복구는 `e114fe179`, CI 원본 자산·검증 연결 복구는 `9f3115538`이다.

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
직접 참조나 새 유료 서비스 의존성은 없다. 아바타 테스트의 바이너리 fixture도 동일한
바이트를 표준 `btoa`로 인코딩하여 contracts에 Node 내장 import를 남기지 않는다.

단독 contracts typecheck는 기존 `lib: ["ES2022"]`, `types: []` 설정 때문에
`URL`, `Request`, `TextEncoder`, WebCrypto 표준 타입과 테스트의 `Buffer`를 찾지 못했다.
`DOM`·`DOM.Iterable` 표준 정의와 Node 타입을 추가했다. avatar 테스트는 최종적으로
표준 `btoa`를 사용하여 Node 내장 import를 요구하지 않는다. 이 변경은 컴파일러 타입
정의를 맞추며 운영 runtime을 추가하지 않는다.
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
| 루트 전체 TypeScript | 웹·API·work-session 검사 통과 |
| 웹 build 및 통합 harness | 성공. 라이선스 고지·정적 CSP 검사와 `pnpm harness:verify` 통과 |
| PR CI·main 병합 | PR #2145에서 CI 검증 중. 병합 완료로 간주하지 않음 |

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

구현 복구와 위 범위의 로컬 검증은 완료했다. CI·로그인된 실데이터 기능 검증을
로컬 타입·빌드 검사 결과와 혼동하지 않는다. main 병합은 배포 승인이 아니며 운영 배포는
별도 명시적 승인과 지정 SHA 검증이 필요하다.

## CI의 남은 검증 복구

기준 main의 `36307510760` CI 로그를 별도로 분류했다. 계약 import 연쇄 외에
Studio 소스 크기 상한 두 개와 sparse checkout에서 원본 이미지 두 계열이 빠지는 실패가 있었다.

- CI가 기존 `daily`, `school`과 함께 `fantasy`, `urban` 원본을 복구하도록 수정했다.
  임시 Git 저장소에서 실제 sparse checkout을 실행하는 21개 검사와 원본 WebP 6개 검사가 통과했다.
  배포 워크플로·필수 검사 조건은 변경하지 않았다.
- host의 동일한 direct flag 5개 초기화를 세 호출부에서 같은 동기 helper로 공유했다.
  helper를 다시 펼치면 기준 커밋의 소스와 바이트 단위로 동일하며,
  GPU pin과 journal 초기화 순서도 유지한다. host는 29650행, live admission은 559행으로
  기존 상한을 그대로 만족한다. 상한·실패 조건을 완화하지 않았다.
- live admission 세 경로의 같은 geometry 조건을 하나의 순수 값으로 공유했다.
- 소스 검증 reader에 이미 추출된 실제 live-surface 모듈을 포함했다.
  wet-ink 검사는 현재 commit 호출문을 찾도록 맞췄으며 seal 거절 이후의 조기 반환과
  commit 순서 검사는 그대로 유지했다.
- 관련 ratchet·pointer·history·live integration 9개 파일의 83개 검사가 통과했다.

이 변경은 c926에만 적용했다. 다른 작업트리의 experience-v8 CI 변경은 복사하거나 덮어쓰지 않았다.
최종 CI와 disposable DB 검증은 별도로 확인해야 한다.

## PR #2145에서 드러난 독립 검증 도구의 이전 누락

아래는 원격 head `9199512fe7c9a1a3259d0bc41477847d4480ed31`의 실패를 분류하고
수정 후 로컬에서 같은 검사를 실행한 결과다. 원격 최종 head의 통과 결과와 구분한다.

| 범위 | 원인·수정 | 실제 재검증 |
| --- | --- | --- |
| Creator resource 독립 컴파일 | 임시 TS project의 contracts 공개 alias 누락 복구 | Node 85개, Chromium 91개 통과 |
| Marketplace DB 검사 | 웹 shim 대신 정식 contracts subpath 사용 | 별도 PostgreSQL 16 DB에서 3D parity·repository 검사 통과 |
| CC0 브라우저 handoff | 이동된 Vite config의 절대 경로 명시 | 384개 통과, 모델 reload 50개 포함, pageerror 0 |
| 관리자 스키마 통합 | root scripts 상대 경로 복구, helper import를 client 대여 앞으로 이동 | 임시 PostgreSQL 17에서 2파일 11개 통과, client 반환·서버 종료 확인 |
| Studio 메뉴·소재 | 이미 변경된 메뉴명과 전체 소재 목록·더 보기 동작을 정확하게 검사 | finishing 18파일 181개, asset 14파일 147개 통과 |
| 레이어 보기·Worker CSP | 정확한 예산 오류 문구, 실제 앱과 같은 `worker.format: "es"` fixture | 4파일 128개 통과, UTF-8 한도+1바이트 거절·실제 Worker asset 검사 유지 |
| Studio 소스 경계 | 추출된 배치 commit의 호출과 내부 확정 검사를 연결, pinned renderer·인증 gate의 실제 조건 검사 | 5파일 31개 통과 |
| 공개 Node 경로 검사 | 신규 공개 경로 import에 기존 native TS 규칙의 `.ts` 확장자 적용 | Node 13개 통과 |
| 협업 시작 안내 | 늦게 mount되는 실제 안내를 기다려 닫은 뒤 기존 visible/synced 확인 | 8파일 102개 및 전체 3탭 수렴 통과, 150ms 지연 fixture에서 기존 30초 실패·수정 성공 |

위 복구는 검사 skip, 보안·권한·픽셀·용량 기준 완화, CI 조건 변경으로 실패를 숨기지 않는다.
예산 초과·인증 거절·문서 준비·실제 클릭·재진입 검사를 유지한다. 로컬 fixture 검증은
운영 API, 인증된 다중 사용자 협업 또는 실기기 GPU 보증을 뜻하지 않는다.

## 전체 회귀에서 확인한 브랜드·자산·도구 계약

첫 전체 루트 검사는 5,197개 파일 중 5,108개 통과, 51개 실패, 38개 기존 skip을 기록했다.
57,200개 테스트 중 56,610개 통과·96개 실패·494개 기존 skip이며, 이를 전체 통과로
보고하지 않는다. 실패 원인을 분리하여 아래와 같이 복구하고 최종 전체 검사를 다시 실행한다.

- 원본 GLB의 저작자 메타데이터는 생성 시점의 `ToonSpectrum`을 유지한다. 제품 표시명과
  혼동하여 바뀐 테스트 기대만 복구했으며 GLB 바이트·hash·폴리곤·재질 기준은 유지했다.
- VRM catalogue의 불변 source/renderer 식별자 두 곳을 복원하자 420,936바이트와 기존
  SHA-256 `f482cb50758880260508d074a54060fc3c9f5fe874738c38199a63f4eed8b1f6`가
  정확히 복구됐다. 기존 hash나 길이를 바꿔 손상된 자산을 승인하지 않았다.
- MyPaint/KPP golden 입력의 고정 메타데이터를 복원했다. 이미지·브러시 golden을
  새로 만들지 않았고 기존 전체 프레임·컴파일 hash 검사를 유지했다.
- 게시 package golden 세 개는 이미 변경된 `toonstudio.publish-package` 명세의 hash만
  갱신했다. 같은 직렬화의 schema를 이전 `toonspectrum.publish-package`로 치환하면
  세 기존 hash가 정확히 재현됨을 확인했다. manifest의 다른 필드는 동일하다.
- API 공통 오류가 `AppApiError`로 정규화된 뒤 AI client에서 인증·한도 코드를 잃던
  문제를 복구했다. 사용자 키 사용 여부·과금 주체·재시도 정책은 바꾸지 않았다.
- 탭 내 프로젝트 이동 문맥은 실제 호출자가 전달하는 `window.sessionStorage`라는
  점을 이름과 주석으로 명확히 했다. 원고 영속 저장의 허용 범위는 늘리지 않았다.
- Node 전용 테스트 10개가 Vitest에 0개로 수집되던 문제를 기존의 runner 선택 패턴으로
  복구했다. 두 runner에서 같은 assertion과 정리 훅을 실행하며 exclude나 skip을 추가하지 않았다.
- 이전된 계약의 실제 package 소스와 단일 web re-export를 함께 검사하도록 경계 테스트를
  복구했다. 독립 QA 스크립트의 인증 암호화 import도 실제 API 소유 경로를 사용한다.
- 캠페인 보호 정책에 이전된 `platform/database` 경로를 반영했다. 기존 `db`와 현재
  migration/schema 모두 focused test 유무에 관계없이 보호한다.

변경 후 51개 실패 파일의 재실행은 391개 중 390개를 통과했다. 남은 대형 바이트 배열
비교는 객체 속성 비교 비용으로 30초를 넘겼다. 동일한 전체 바이트열을 `Buffer.compare`로
비교하도록 바꾸고 해당 자산 10개와 페이지 분류 19개를 다시 실행하여 29개 모두 통과했다.
이는 timeout 증가나 바이트 검증 축소가 아니다. 자산·게시·브러시 관련 별도 14파일 157개,
Node/Vitest 자산·게시 6파일 25개도 통과했으며 서로 독립 실행 결과다.

번역은 namespace를 권위로 legacy flat 221개를 기존 생성기로 동기화하고 보간 손상을
복원했다. 후속 전수 integrity에서 발견한 91파일 105값은 70개의 순수 보간식과 35개
번역 문장 안의 오염된 변수 토큰이었다. 수정 전후 모든 key/value와 hash를 비교하여
해당 값 외의 원문을 보존했다. strict manifest의 문자열 동일성 검사를 Studio까지
확장했으며 전수 i18n 7파일 67개가 통과했다. 외부 번역 서비스는 호출하지 않았다.


## API 출력 패키징의 실제 계약 연결

첫 PR의 Core production build는 contracts runtime exports가 이전 4개 계약만 연결하여
124개 import를 `ERR_PACKAGE_PATH_NOT_EXPORTED`로 거부했다. staging은 컴파일된 JS의
실제 의존성을 AST로 수집하고 정식 contracts package manifest의 공개 항목만 연결한다.
기존 필수 4개, 누락된 컴파일 출력의 실패, 미공개 파일의 차단을 유지한다.

수정 후 API build는 성공했고 4개 workspace package, 컴파일 JS 887개와 import 2,732개를
검증했다. 관련 3개 suite는 Node와 Vitest에서 각각 30개 통과했고 실제 native module load,
법적 정책 runtime 7개도 통과했다. 서버 실행·DB 연결·배포는 수행하지 않았다.
