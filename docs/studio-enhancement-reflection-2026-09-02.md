# ToonStudio 고도화 분석 반영 — 2026-09-02

외부 리뷰([`studio-enhancement-analysis-external-2026-09-02.md`](./studio-enhancement-analysis-external-2026-09-02.md))의
주장 하나하나를 현재 소스와 대조하고, 확인된 것은 고치고, 틀린 것은 정정하고, 정책 판단이 필요한 것은
근거와 함께 남긴 기록이다. 원문은 실기기 E2E 없이 소스·문서·CI를 읽고 쓴 것이므로, 이 문서의 판정
기준은 "저장소의 실제 코드가 무엇을 하는가"다.

기준 커밋: `56e7148a`(main) → 작업 브랜치 `claude/document-analysis-reflection-ef1f80`.

## 0. 한눈에

| 원문 주장 | 판정 | 조치 |
| --- | --- | --- |
| P1-1 `.will` 32MiB 프로필 vs 1MiB 직접 CRC 상한 불일치 | **참** (단, 파일 메뉴 내보내기는 무영향) | 수정 `3474c06f` — 증분 CRC + 1MiB 슬라이스 yield |
| P1-2 구형 `requiredEvidence: "fallback"` 마이그레이션 누락 | **참** | 수정 `26cd209f` — 토큰 재매핑 + 레거시 카탈로그 테스트 |
| P1-3 Dry Media 캐시가 `elementSheet`만 비교, layoutKey 미검증 | **부분 참** (`elementSheet`는 존재하지 않는 식별자, 갭은 실재) | 수정 `dd49e597` — `lastPresented.layoutKey` 검증 + DPR 포함 |
| "Studio Perf Harness" CI 잡 실패 | **거짓** — 그런 잡은 없다 | 실제 실패 잡 3종 기록; core를 막던 lint(PR #485)·마이그레이션 매니페스트 누락·`.myb` 테스트 기대값 세 겹을 걷어냄(§3.1) |
| 장거리 스트로크 하네스가 Stage 없으면 성공 종료, assertion 없음 | **참** (그 이상: 데드 코드, 홈 디렉터리 하드코딩) | `scripts/verify-studio-long-stroke.mts`로 교체 (§3.2) |
| 슬라이스 출력 고정 250ms 대기 | **2026-08-08에 해소됨** (문서 표가 stale) | 표 갱신 `1fb142a0`, 잔여 1곳 기록 |
| 필터 다이얼로그가 SQLite wasm 928KB를 끌어옴 | **2026-08-08에 해소됨**, 잔여 정적 의존 있음 | 표 갱신 `1fb142a0` |
| 중심 컴포넌트 42,149줄 | **stale 수치** — 현재 5줄 심 + 30,961줄 호스트 | §4 |
| 적색 main에서도 배포되는 구조 | **참**, 단 2026-08-14 의도적 결정 | 재도입은 정책 판단으로 남김 (§3.3) |

수정 커밋은 모두 회귀 테스트를 포함하며, 관련 6개 테스트 파일 70건이 통과한다. 하네스 교체는 §3.2에서
별도로 결과를 적는다.

## 1. 검증 방법

- 각 주장에 대해 소스를 직접 읽고 `file:line`으로 근거를 남겼다. 원문이 쓴 식별자가 저장소에 없으면
  그 사실을 그대로 적었다(`elementSheet`, "Studio Perf Harness").
- 원문이 인용한 성능 수치는 전부 [`perf/heavy-feature-findings.md`](./perf/heavy-feature-findings.md)
  (2026-08-08 측정)에서 온 것이다. 측정치 자체는 기록으로 두고, 그 뒤 해소된 항목만 표에서 정정했다.
- 원문의 "확정 결함" 표현은 실서비스 클릭 재현이 아니었으므로, 여기서는 **소스에서 재현 경로가 성립하는가**를
  기준으로 참/거짓/부분을 판정했다.

## 2. 소스 결함 3건

### 2.1 P1-1 — `.will` CRC 상한 불일치 (참)

근거:

- 프로필 상한 32MiB: `src/domains/creator/studio-will-v1-interchange.ts:28-37`(`maxStrokesBytes`),
  OPC 프로필 재수출 `studio-will-v1-opc-interchange.ts:67-76`.
- 직접 CRC 상한 1MiB: `studio-crc32-worker-client.ts` `STUDIO_CRC32_DIRECT_MAX_BYTES`, `runDirect`가
  초과 시 throw.
- 기본 실행 모드가 `direct-bounded`: `studio-will-v1-opc-interchange.ts` `buildStudioWillV1OpcBytes`
  (`crc32ExecutionMode: options.crc32ExecutionMode ?? "direct-bounded"`), 그리고 이 기본값은
  `studio-package-archive.test.ts`의 소스 스캔 ratchet이 고정하고 있었다.
- 실패 경로: 프로필 검사(32MiB) 통과 → `buildStudioPackageArchiveBytes` → `crc32Session.run` →
  `runDirect` throw → `fail("ARCHIVE_INVALID")`. **fail-closed**이므로 손상 저장은 없지만, 이미 검증을
  통과한 문서가 아카이브 단계에서 거부된다.

원문보다 좁은 영향 범위:

- 파일 메뉴 `.will` 내보내기(`export/studio-will-v1-export-bridge.ts` → `studio-will-v1-opc.worker.ts`)는
  워커에서 `direct-headless`(256MB 상한)로 실행되어 **무영향**이다.
- 영향을 받는 것은 기본 모드로 `buildStudioWillV1OpcBytes`를 호출하는 경로 —
  `encodeStudioWillV1DocumentTransport`와 인증 코덱 프로바이더(`studio-first-party-will-v1-document-codec-provider.ts`),
  그리고 코덱 컨포먼스(`studio-first-party-will-v1-document-codec-conformance.ts:150`)다.

수정(`3474c06f`):

- `studio-crc32.ts`에 증분 API 추가: `STUDIO_CRC32_INITIAL_STATE`, `updateStudioCrc32(state, bytes, start, end)`,
  `finalizeStudioCrc32(state)`. `calculateStudioCrc32`는 이 둘의 합성으로 재정의(핫 루프는 인덱스 기반 유지).
- `studio-crc32-worker-client.ts`: `direct-bounded`에서 1MiB 초과 입력은 `runDirectSliced`로 1MiB 슬라이스씩
  접고 슬라이스 사이에 `scheduler.yield()`(없으면 `setTimeout 0`)로 이벤트 루프에 양보. 전체 상한은 기존
  `assertCrc32Input`(256MB)이 그대로 지킨다. "bounded"의 의미는 "동기 작업 하나가 메타데이터 크기"로
  유지되고, 프로필이 허용한 전 구간을 받아들이게 된다. `direct-headless`·`worker` 모드는 변경 없음.
- 원문이 권한 "프로필을 1MiB로 낮추기"는 계약 파기이므로 채택하지 않았다. 원문이 권한 "증분·청크 방식"을
  채택했다.

회귀 테스트:

- `studio-crc32-worker-client.test.ts`: 1MiB−1 / 1MiB / 1MiB+1 경계, 2·16·32MiB 슬라이스 케이던스(yield
  횟수 = MiB−1), 슬라이스 사이 abort. 대용량 버퍼는 필드 단위 비교(딥이퀄은 매처가 수천만 원소를
  순회·출력해 8GB 힙을 넘긴다 — 실제로 한 번 겪었다).
- `studio-will-v1-opc-interchange.test.ts`: 48경로×4,000점(192,000점) 실데이터로 strokes 파트가 1MiB를
  넘는 것을 확인한 뒤, **기본 모드**로 빌드·임포트 왕복.
- 원문의 32MiB−1/32MiB/32MiB+1 경계는 CRC 계층에서 32MiB 케이스로 덮었고, OPC 계층의 32MiB 초과는 기존
  `RESOURCE_LIMIT` 테스트(`studio-will-v1-interchange.test.ts:304`)가 담당한다.

미채택: "저장 실패 시 문서 크기·처리 단계·진단 복사 UI". 현재 `ARCHIVE_INVALID`의 `cause`에 바이트 수가
들어가 있어 진단은 가능하다. 오류 UX 표준화는 §5.4에서 백로그로 다룬다.

### 2.2 P1-2 — 구형 renderer evidence 마이그레이션 (참)

근거:

- 허용 토큰 9종(`packages/studio-project-model/src/ir/asset-metadata.ts:430-453`)에 `fallback`은 없다.
  `0520c7e1`(2026-09-01, "make WebGPU and WASM render paths fail closed")이 enum의 `fallback`을
  `explicit-provider-selection`으로 **개명**했다(추가가 아니라 1:1 치환).
- 마이그레이션 `migrateLegacyAssetRendererSubstitution`은 최상위 `fallback` 지시만 `providerUnavailable`로
  바꾸고 `replacementCondition.requiredEvidence`는 스프레드로 통과시켰다.
- 이전 릴리스의 레지스트리(`git show 0520c7e1^:src/domains/creator/studio-asset-metadata-registry.ts`)는
  myb/kpp/svg 카드마다 `fallback` 지시와 `requiredEvidence: [..., "fallback", ...]`를 **같은 객체에** 냈다.
- 카탈로그 키·리비전(`catalog.v1`, revision 1)은 그 커밋에서 바뀌지 않았으므로 구형 스냅숏은 리비전 검사를
  통과하고 `register` → `parseAssetMetadata`에서 Zod `invalid_value`로 실패한다. `loadFrom`은 의도적으로
  부분 로드를 거부하므로 **카드 한 장이 카탈로그 전체 로드를 막는다**. 원문의 사용자 영향 서술과 일치한다.
- 원문보다 넓은 범위: `fallback: null`인 카드는 마이그레이션 본문에 들어가지도 않지만, evidence 토큰 때문에
  똑같이 실패한다. 즉 "마이그레이션이 남긴다"가 아니라 "재매핑 코드가 어디에도 없다"가 정확하다.

수정(`26cd209f`):

- `migrateLegacyAssetReplacementEvidence`를 추가해 `fallback` → `explicit-provider-selection`으로 재매핑하고
  중복을 제거한다. 최상위 지시 유무와 **독립적으로** 먼저 적용된다. 정규값 선택 근거: enum diff의 1:1 치환,
  레지스트리 요약문의 동시 개명, 마이그레이션 reason 문구, ADR 0018.
- 알려지지 않은 토큰은 여전히 스키마가 거부한다(마이그레이션이 게이트를 발명하지 않음).

회귀 테스트:

- `asset-metadata.test.ts`: 지시+토큰 동반 카드, `fallback: null`+토큰, 두 철자 공존 시 단일화, 정규 JSON
  왕복 고정점, 미지 토큰 거부.
- `studio-asset-metadata-registry.test.ts`: 현재 deriver 카드를 이전 릴리스 형태(`providerUnavailable` 제거,
  `fallback` 지시 복원, 토큰 개명)로 되돌린 `catalog.v1` 스냅숏을 실제 sqlite-wasm 메모리 DB에 넣고 로드 →
  카드 전부 복원, `providerUnavailable` 라우팅 사실 일치, 재저장 후 바이트 동일 재로드.

같은 파일의 `.myb` "hardness" 테스트는 `66bc25b4`(2026-09-02)가 hardness를 매핑 대상으로 옮긴 뒤 기대값이
갱신되지 않아 main에서 실패하고 있었다. 이 PR에서 매핑된 상태를 단언하도록 고쳤다(§3.1).

### 2.3 P1-3 — Dry Media 캐시 레이아웃 검증 (부분 참)

원문 정정:

- `elementSheet`라는 식별자는 저장소에 없다(`grep -rn elementSheet src packages` → 0). 동일성 필드는
  `element: DrawEl`이다.
- "layoutKey를 검증하지 않는다"는 최상위 게이트에 대해선 틀렸다 —
  `canvas/studio-canonical-dry-media-authority.ts`의 resolver는 `authority.layoutKey === layoutKey`를 검사한다.

실재하는 갭:

- 봉투(envelope)의 `layoutKey`는 publish 시점에 **현재** 값으로 찍히므로 항상 일치한다. 보존 스냅숏
  `lastPresented`는 자체 `layoutKey`를 갖고 있지만(`StudioCanonicalVNextDryMediaCanvas.tsx` 타입 선언),
  resolver는 `lastPresented.element === candidate`만 봤다.
- 컴포넌트의 보존 참조 리셋은 element 변경에만 반응했고 layout 변경엔 반응하지 않았다. 따라서
  리사이즈 → 새 프레젠테이션 실패 → `publishUnavailable`이 **옛 레이아웃의** `lastAuthorizedRef`를
  `retainsLastGoodFrame: true`로 내보내고, 스냅숏 캔버스는 현재 bounds로 CSS 배치되지만 backing store는 옛
  `width/height`라 늘어난 잔상이 보인다. 원문의 "창 크기 변경 후 이전 프레임 잔상" 증상과 정확히 대응한다.
- DPR은 `layoutKey`에도 effect deps에도 없었다. 컴포넌트 내부 `resizeSignature`에만 있어 모니터 이동·브라우저
  줌으로 DPR만 바뀌면 재실행도 무효화도 일어나지 않았다.
- 기존 테스트 `StudioCanonicalVNextDryMediaCanvas.test.tsx` "ends a failed presentation epoch…"은 layoutKey를
  바꾼 뒤 `retainsLastGoodFrame: true`를 **정상으로** 단언하고 있었다(bounds를 안 바꿔서 오배치가 보이지
  않았을 뿐).

수정(`dd49e597`):

- resolver: `retainsExactLastGood`에 `lastPresented.layoutKey === layoutKey` 추가.
- 컴포넌트: `publishUnavailable`의 `lastPresented` 선택과 보존 참조 리셋 게이트 모두 `layoutKey` 일치를
  요구. 레이아웃이 바뀌면 같은 DrawEl이라도 `clearPresentedSnapshot` + `callback(null)`.
- `canvas/studio-canvas-viewport-live-surfaces.ts`: `canonicalDryMediaLayoutKey`에 DPR(1~4 clamp) 포함.

동작 변화의 정당성: 부모 resolver는 이미 옛 레이아웃 authority를 비활성으로 취급했으므로, 레이아웃 변경 시
Konva 원본 요소가 잠시 보이는 것은 전과 같다. 달라지는 것은 "실패 시 옛 비트맵을 늘려 보여주던 것"이
"원본 요소를 그대로 보여주는 것"으로 바뀌는 점이며, 이는 resolver 주석의 원칙("정확한 프레임이 없으면
문서 요소를 숨기지 않는다")과 일치한다.

회귀 테스트:

- `studio-canonical-dry-media-authority.test.ts`: 봉투는 현재 레이아웃, 스냅숏은 옛 레이아웃인 unavailable →
  `canvasVisible: false`; 스냅숏 레이아웃이 현재와 같으면 소유권 유지.
- 컴포넌트 테스트: (a) 640→520 리사이즈 + 프레젠테이션 실패 → `retainsLastGoodFrame: false`,
  `lastPresented: null`, 스냅숏 캔버스 width 0·hidden, 경고 alert 표시, (b) 기존 "stale in-flight frame"
  테스트는 레이아웃 변경 직후 authority가 `null`로 반납되는 새 의미론으로 갱신, (c) 같은 DrawEl·같은
  레이아웃에서의 보존은 기존 device-lost 테스트가 담당 — 프로덕션에서는 bounds·scale·flip·DPR이 모두
  `layoutKey`에 접히므로 키가 같은 채 epoch이 다시 도는 경로는 device loss뿐이다.

원문의 회귀 매트릭스(창 크기, 브라우저 줌, DPR 1·2·3, 회전, 패널 토글, 모니터 이동, 방향 전환)는 모두
"layoutKey가 달라지는 사건"으로 환원되며, 위 단위 테스트가 그 축을 덮는다. 실기기 E2E는 §7의 verify 스크립트
확장 항목으로 남긴다.

## 3. CI와 테스트 신뢰도

### 3.1 CI 실제 상태 (원문 정정)

- "Studio Perf Harness"라는 체크는 워크플로·git 이력 어디에도 없다(`grep -rn "Studio Perf Harness"` 0건,
  `git log --all -S` 0건). 원문이 본 것은 다른 저장소이거나 이름을 만들어 낸 것이다.
- `56e7148a` 기준 main CI 실패 잡은 `core`, `studio-inapp-browser`, `studio-3d-visual`, 그리고 `core`에
  종속된 `verify`다.
  - `core`: `pnpm run lint`가 `scripts/qa/studio-soak-runner.mjs:26`의 ANSI 제거 정규식에서
    `no-control-regex`로 멈춘다(`56e7148a`가 추가). 이 PR과 PR #485가 같은 억제를 넣었고 main 쪽이 먼저
    머지되어 이 브랜치의 커밋은 리베이스에서 드롭됐다. lint를 통과하자 그 뒤에 가려져 있던 두 실패가
    드러났고 둘 다 이 PR에서 고쳤다: (1) `e90aadbe`가 `0035_creator_marketplace_3d_asset_kind.sql`을
    추가하며 `scripts/production-database-migrations.manifest`를 갱신하지 않아 "manifest must list every
    numbered SQL migration exactly once"로 마이그레이션 채택 단계가 실패 → 항목 추가; (2) `66bc25b4`가
    `.myb` `hardness`를 매핑 대상으로 옮겼는데 `studio-asset-metadata-registry.test.ts`는 여전히
    unmapped 목록에 있기를 요구 → 매핑된 상태를 단언하도록 갱신.
  - `studio-3d-visual`: "Verify Studio 3D surfaces against rendered frames" 실패 — 2026-09-01 진단된
    `peakColorTileDelta` 타이밍 회귀 계열. 이 작업 범위 밖.
  - `studio-inapp-browser`: 라우트 스윕·상단 크롬 프로브 실패. 이 작업 범위 밖.
- 단위 테스트 기존 실패: `studio-asset-metadata-registry.test.ts` ".myb … loud-loss ledger"의 `hardness`
  누락(`66bc25b4`에서 myb 임포터 변경). 이 작업 범위 밖이며 §2.2 테스트와 무관함을 확인했다.

### 3.2 장거리 스트로크 하네스 (TS-QA-005)

원문 판정은 참이고 실제로는 더 나쁘다. `scripts/long-stroke-stress-benchmark.mts`(`2f07dd89`)는

- `expect` 0개, 임계값 0개. p95/p99를 계산해 `console.log`로만 흘렸다(커밋 메시지는 "Assert p95…"라고 썼다).
- `.konvajs-content` bounding box가 없으면 `return`으로 정상 종료 → exit 0.
- 스크린샷을 `~/.gemini/antigravity-cli/...` 절대 경로에 기록, 비교 없음.
- `package.json`·워크플로·playwright testDir 어디에도 연결되지 않은 데드 코드. 측정한 "latency"도 CDP
  왕복 시간이지 렌더러 입력→페인트 지연이 아니다.

한편 원문이 요구한 8개 assertion은 이미 저장소의 다른 하네스에 구현이 있다
(`scripts/studio-brush-frame-budget-policy.ts`의 `inputDeliveryRatio`·p95/p99·longtask·heap,
`scripts/probe-studio-brush-sweep.mjs`의 live/committed diff·pageerror 수집,
`scripts/verify-studio-brushes.mts`의 `pendingStrokeDurability`). 문제는 새 하네스가 그것을 재사용하지 않고
약한 버전을 새로 썼다는 점과, `verify:studio-brush-latency`·`verify:studio-brush-planner-quality`가
어떤 워크플로에서도 호출되지 않는다는 점이다.

조치(`a0880c48`): 데드 스크립트를 삭제하고 `scripts/verify-studio-long-stroke.mts`(`verify:studio-long-stroke`)로
교체했다. 13개 하드 assertion을 두고 모든 실패를 모아 exit 1 한다.

| 축 | 판정 방식 | 근거 훅 |
| --- | --- | --- |
| Stage 부재 | `[data-studio-frame-graph-document]` → `.konvajs-content` 없으면 즉시 FAIL | `StudioCanvasViewportStageHost.tsx` |
| 입력 점 수 vs 커밋 점 수 | SQLite 자동저장 문서의 draw 요소 `points`를 읽어 디스패치 수와 대조. 기대치 = min(디스패치, 경로길이/`sampleSpacing`) −15% ~ +4 | `verify-studio-brushes.mts:2351`과 같은 훅(`studio-autosave-sqlite-store.ts`, `studio-autosave.ts`) — dev 서버 전용, preview에서는 `inputDeliveryRatio ≥ 0.95`로 대체하고 표기 |
| 미완료 스트로크 0 | pointerup 300ms 뒤와 900ms 뒤 캡처 동일 + 자동저장 draw 요소 정확히 1개 | 앱은 라이브 드래프트를 DOM에 노출하지 않음(`pendingStrokeDurability`는 내구성 마커) |
| 라이브/커밋 픽셀 패리티 | 전반부 경계상자에서 변경 픽셀 ≤ 1%, 후반부 ≥ 200px | `probe-studio-brush-sweep.mjs` diff 방식 |
| 프레임 p95 | ≤ 33.4ms(헤드리스는 vsync 2배) | rAF 샘플러 |
| long task | 50ms 초과 ≤ 3 | `PerformanceObserver("longtask")` |
| 오류 | console.error / pageerror / unhandledrejection 0 (dev 서버의 선택적 API 루프백 실패는 노이즈로 제외) | |
| 힙 | 해제 후 ≤ 시작 + 64MiB | CDP `Runtime.getHeapUsage` (performance.memory는 양자화되어 부적합) |

실측(2026-09-02, dev 서버, headless Chromium):

- **CPU/Konva 경로(기본): 13/13 통과.** 커밋 점 602 vs 디스패치 600, 입력 전달 1.000, 정착 변경 픽셀 0,
  후반부 잉크 3,194px·전반부 변경 0px, 프레임 p50 8.3 / p95 9.1 / max 183.3ms(6,087프레임), long task 2건,
  힙 86.1 → 86.8 → 86.7MiB, 오류 0.
- **`--enable-unsafe-webgpu`(opt-in `TOONSPECTRUM_LONG_STROKE_WEBGPU=1`): 4/13 실패.** 헤드리스 SwiftShader
  WebGPU 어댑터가 텍스처 생성에 실패(`[Invalid Texture] … "Studio retained tile presentation"`,
  `"Studio Google Ink live-tail encoder"`, 검증 경고 15~33건)하고 "GPU 가속을 다시 켰습니다" 복구 토스트가 뜬 뒤
  **획이 통째로 사라진다** — 픽셀 0, 자동저장 draw 요소 0, 실행취소 비활성. 나머지 9축(전달 600/600, 프레임
  p95 16.8ms, long task 0, 오류 0)은 통과.

WebGPU 실측은 두 갈래로 읽어야 한다. (1) 헤드리스 SwiftShader의 WebGPU 텍스처 검증 실패는 알려진 측정
함정이므로 게이트 기본값은 CPU 경로로 두었다 — CI 러너의 GPU 드라이버 상태를 재는 도구가 되면 안 된다.
(2) 그러나 "GPU 복구 토스트 뒤 진행 중 획이 유실된다"는 앱 동작 자체는 실기기 GPU 컨텍스트 손실에서도
같을 수 있으므로 별도 확인이 필요하다 — ADR 0018의 fail-closed는 "자동 대체 금지"이지 "입력 유실 허용"이
아니다. §6에 TS-QA-021로 추가했다.

하네스 작성 중 확인된 함정(다른 verifier에도 적용): Quick Start 다이얼로그가 hydration 뒤 마운트되어 `b`
키·클릭을 삼킨다(설정은 SQLite UI prefs, localStorage 아님); tsx의 esbuild `__name` 헬퍼가 `page.evaluate`로
새어 들어간다(`verify-studio-brush-latency.mts`처럼 shim); 종이 박스가 1000px 뷰포트 아래로 이어진다;
상단 바의 실행취소 버튼 라벨은 `Undo`이고 툴벨트의 `실행취소`는 disabled로 렌더된다.

### 3.3 배포 게이트 (TS-CI-004) — 정책 판단으로 남김

원문은 "적색 main 배포 차단"을 P0으로 둔다. 현재 `deploy-vercel.yml`은 main push마다 배포하며, 승인 SHA
게이트는 **2026-08-14에 의도적으로 제거**됐다. 브랜치 보호도 없다(`gh api …/branches/main/protection` → 404).
기술적으로는 (a) main 브랜치 보호에 `core`를 required check로 올리거나 (b) `deploy-vercel.yml`을
`workflow_run: [ci]` + `conclusion == success`로 바꾸는 두 가지가 있고, 어느 쪽도 한 시간 안에 된다.
그러나 이전 결정을 뒤집는 일이므로 이 PR에서는 하지 않았다. 권고는 (b): 브랜치 보호 없이도 "적색 main은
배포 안 됨"만 정확히 표현하고, hotfix는 `workflow_dispatch`로 남긴다.

## 4. 성능·아키텍처 주장 대조

| 항목 | 원문 | 현재 | 비고 |
| --- | ---: | --- | --- |
| 중심 컴포넌트 줄 수 | 42,149 | `StudioPage.tsx` 5줄(라우트 심) + `StudioCuttoonEditorHost.tsx` 30,961줄 | 2026-08-08 측정치 인용. 분할은 진행 중이며 여전히 최대 리스크 |
| 슬라이스 250ms 고정 대기 | 현재 결함 | `16f15f37`(08-08)에서 "다음 다운로드 허용 시각" 마감 방식으로 교체 | 합성·인코딩 시간이 간격에서 차감. 잔여: 스트립 전체 다운로드 청크 루프의 무조건 250ms(`render/studio-raster-export-orchestration-runtime.ts`) |
| 필터 → SQLite wasm 928KB | 현재 결함 | `16f15f37`에서 idle 콜백 지연 로딩 | 잔여: 다이얼로그 청크가 `studio-local-database.ts`(2,444줄) SQL 계층을 정적 포함; 팩 종류 필터는 프리셋 라이브러리 때문에 열 때 워커 기동(기능 의존) |
| 콜드 오픈 1,068ms / 4.51MB / 268요청 / VRM 7.83MB | 문서 인용 | 동일 문서의 08-08 수치 | 재측정은 [`perf/startup-findings.md`](./perf/startup-findings.md) 하네스로 가능. 이 PR에서 재측정하지 않음 |

원문이 제안한 "렌더 완료·Blob 완료 이벤트 대기"는 잘못된 위험을 겨냥한다. `canvasToBlob`은 이미 await하며,
남은 간격은 `a[download]` 연속 클릭 시 WebKit이 뒤 파일을 조용히 버리는 문제를 막는 것이고 브라우저에
다운로드 완료 이벤트는 없다(`export/studio-export-presets.ts:640-649` 주석). 0으로 내릴 수 없다.

원문의 분리 경계(StudioShell → DocumentCore / CommandBus·OperationJournal / InputRouter / …)와
`StudioOperation` 직렬화 모델은 방향으로 타당하다. 저장소에는 이미 ADR 0007(append journal, two-slot),
ADR 0012(SQLite/OPFS local authority), `@toonspectrum/studio-command-registry`, journal 관련 93개 파일이
있으므로 "새로 만들 것"이 아니라 "UI가 직접 문서를 만지는 경로를 command로 밀어 넣는 것"이 실제 과제다.
이는 [`toonspectrum 핫패스 탈React 계약`]과 같은 축의 리팩터링이며 이 PR 범위 밖이다.

## 5. UI/UX 제안 대조

원문은 실제 화면을 보지 못했으므로 정보구조 제안이다. 저장소에 이미 있는 것과 없는 것을 구분한다.

| 제안 | 현재 | 판단 |
| --- | --- | --- |
| 7.3 명령 팔레트 ⌘K | 있음 — `src/components/command-palette-host`(AppShell), `@toonspectrum/studio-command-registry` | 검색 대상에 "실행 불가 사유"·"소재"·"동의어"가 포함되는지는 별도 감사 필요 |
| 7.5 비활성 상태 설명 | 부분 — `disabledReason`/`unavailableReason` 81개 파일(툴벨트 퀵액션, 룰러, 원근 패널 등) | 3D·필터의 GPU/메모리 조건 문구 통일은 백로그 |
| 7.6 상시 저장 상태 센터 | 부분 — `studio-quick-access-integration.ts`의 `StudioQuickAccessSaveStatus`, 라이브 오버레이 | 로컬/서버/대기 작업 수/복구 지점을 한 곳에 상시 표시하는 UI는 없음 → TS-UX-008 유지 |
| 7.7 오류 UX 표준화 | 없음(개별 토스트) | "무엇이 실패/데이터 안전/재시도/행동/진단" 5항 템플릿 채택 권고 |
| 7.1 작업 중심 워크스페이스 | 부분 — `studio-workspaces.ts` 프리셋·기기 오버라이드(저자형 불변식) | 스토리/선화/채색/식자/3D/애니/검수 7종 프리셋은 기존 구조 위에 추가 가능 |
| 7.2 Simple Mode(별도 흐름) | 없음 | 원문 §15 "패널 숨김으로 구현 금지"에 동의. 온보딩 마법사와 겹치는지 먼저 확인 |
| 7.8 모바일 팜 리젹션 등 | 부분 — palm 관련 19개 파일, 44px·handed dock 기준 있음 | 스타일러스/손가락 역할 분리, 회전 중 스트로크 취소, 백그라운드 직전 journal flush는 확인 필요 |
| 7.9 접근성 CI | 부분 — 뷰포트 도달성 회귀 테스트(08-09), 포커스 복귀 원칙 | 키보드 전용 패널 순회·고대비·200% 확대 자동화는 백로그 |
| 7.10 브랜드 통일 | 미해결(PRODUCT 문서상) | 제품명 ToonStudio / 플랫폼 ToonSpectrum 권고에 이견 없음. 출력 ZIP·PDF 생성자 문자열까지 일괄 변경은 별도 PR |

## 6. 클립스튜디오 갭 → 저장소 기준 백로그

원문 §9·§13의 티켓을 저장소의 실제 상태로 다시 적는다. "현재 근거"는 `src/domains/creator` 식별자 grep
결과(테스트 제외 파일 수)로, 기능 완성도가 아니라 **착수 지점이 있는지**를 뜻한다.

| ID | 작업 | 현재 근거 | 이 PR | 남은 완료 기준 |
| --- | --- | --- | --- | --- |
| TS-REL-001 | `.will` 증분 CRC | — | **완료** `3474c06f` | 32MiB 케이던스 테스트 통과 ✓ |
| TS-REL-002 | 구형 evidence 변환 | — | **완료** `26cd209f` | 레거시 catalog.v1 왕복 ✓ |
| TS-REN-003 | Dry Media layoutKey 검증 | — | **완료** `dd49e597` | resize/DPR 단위 회귀 ✓, 실기기 E2E는 §7 |
| TS-CI-004 | 적색 main 배포 차단 | 08-14 의도적 제거 | 정책 판단 (§3.3) | `workflow_run` 게이트 결정 |
| TS-QA-005 | 성능 하네스 assertion | 정책 파일에 구현 있음, 미연결 | **교체** `verify:studio-long-stroke` | CI 잡 연결(`verify:studio-brush-latency`도 함께) |
| TS-QA-006 | live/commit 픽셀 비교 | `probe-studio-brush-sweep.mjs`, `verify-inkwash-dippen-live-commit-fidelity.mts` | — | 브러시 전종 자동화를 CI 야간 잡으로 |
| TS-SAVE-007 | Operation Journal | ADR 0007/0012, journal 93파일 | — | 강제 종료 후 마지막 작업 복원 E2E(`verify:studio-autosave-opfs`·`two-tab` 확장) |
| TS-UX-008 | 저장·동기화 상태 센터 | `StudioQuickAccessSaveStatus` | — | 로컬/서버/대기/복구 지점 상시 표시 |
| TS-ARCH-009 | 호스트 경계 분리 | 30,961줄 | — | InputRouter·PanelHost·SaveRecoveryService 독립 테스트 |
| TS-PERF-010 | 필터 SQLite 지연 | 08-08 idle 로딩 완료 | 문서 정정 | 다이얼로그 청크에서 `studio-local-database` 정적 import 제거 |
| TS-PERF-011 | VRM LOD·압축 | 470MB 자산 | — | Draco/Meshopt·KTX2, 저용량 프록시 |
| TS-BRUSH-012 | 스트로크 프리뷰 | stabilizer 101파일, live draft 18파일(`b871ff48` 라이브/커밋 통일) | — | 고보정 시 프리뷰 지연 실측 |
| TS-BRUSH-013 | 큰 브러시 속도·품질 모드 | 없음(0) | — | 프레임 예산 정책과 연동한 자동 품질 단계 |
| TS-SHAPE-014 | Smart Shape | 식별자 12파일 | — | 스트로크 후 길게 눌러 도형 교정 UX 확인 |
| TS-ASSET-015 | 최근·빈도·핀·태그 | favorite/pin 125파일, recent 0 | — | 최근 사용·빈도·프로젝트별 최근 |
| TS-COLOR-016 | ICC·Lab·soft proof | ICC 30파일, Lab 15, CMYK 18 | — | 프로필 왕복·출력 일치 검증 |
| TS-MOBILE-017 | 팜 리젹션·120Hz | palm 19파일 | — | 120Hz·분할화면·소프트키보드 E2E |
| TS-3D-018 | 3D 텍스처 페인팅 | surface brush 17파일 | — | UV seam·텍스처 레이어·일괄 출력 |
| TS-FX-019 | 비파괴 효과 스택 | glow/shadow 98파일(필터) | — | 레이어 효과 스택으로 재편 |
| TS-COLLAB-020 | 서버 충돌 E2E | presence/CRDT 출하 | — | offline/409/권한 매트릭스 |
| TS-QA-021 (신규) | GPU 복구 시 진행 중 획 유실 확인 | 헤드리스 WebGPU 실측에서 복구 토스트 뒤 픽셀 0·자동저장 0 (§3.2) | 관찰 기록 | 실기기 `device.lost`/컨텍스트 손실 주입 시 진행 중 획이 커밋 또는 복구 저널에 남는지; 유실이면 P0 |

우선순위는 원문 §12·최종 우선순위를 그대로 따른다: 신뢰성(REL/CI/QA/SAVE/UX-008) → 결과 일관성(QA-006) →
구조(ARCH-009) → 제작 속도(BRUSH/SHAPE/ASSET/COLOR) → 웹툰 특화.

## 7. QA 매트릭스 → 기존 verify 스크립트

원문 §11의 축을 `package.json` verify 스크립트에 대응시킨다. 없는 축은 명시한다.

| 축 | 담당 | 비고 |
| --- | --- | --- |
| 입력장치·펜 정보·종료 이벤트 | `verify:studio-brushes`, `verify:studio-brush-latency` | 120/240Hz·DPR 1/2 매트릭스는 latency의 `--competitive-long-stroke` |
| 캔버스 줌·브라우저 줌·DPR | Dry Media 단위 테스트(이 PR) | 실기기 리사이즈/DPR E2E는 미구현 |
| 1MiB/32MiB 경계 | `studio-crc32-worker-client.test.ts`, OPC 테스트(이 PR) | ✓ |
| 60,000점 장거리 스트로크 | `verify:studio-long-stroke`(이 PR), `probe-studio-brush-sweep.mjs` 3,200샘플 | 60k 단일 스트로크는 미구현 |
| 100페이지·500레이어·8K | 없음 | 문서 규모 매트릭스 신설 필요 |
| 탭 종료·프로세스 종료·쿼터 부족·두 탭 | `verify:studio-autosave-opfs`, `verify:studio-autosave-two-tab`, `verify:studio-lifecycle` | 재부팅·24시간 방치·iOS 메모리 회수는 수동 |
| GPU 컨텍스트 손실·대체 렌더러 | Dry Media 컴포넌트 테스트(device-lost), `verify:studio-engine-*` | ADR 0018: 자동 대체 없음, 명시 재선택만 |
| PNG·PSD·SVG 출력 비교 | `verify:studio-gpu-committed-parity` | |
| 375×812·handed dock·키보드 전용 | `studio-inapp-browser` CI 잡, 뷰포트 도달성 테스트 | 스크린리더·고대비·200% 확대 자동화 없음 |
| 10시간 조합 soak | `studio-soak-10h.yml` | core lint 차단은 이 PR에서 해제 |

## 8. KPI 채택

원문 §14의 KPI 중 저장소가 **지금 측정할 수 있는 것**만 채택하고, 나머지는 계측 선행 과제로 둔다.

- 지금 측정 가능: required CI 성공률, unhandled rejection 0(하네스), live/commit 픽셀 차(스윕),
  input-to-preview p95(`verify:studio-brush-latency`), `/studio` 정착 시간(`startup-findings` 하네스),
  PNG/PSD/SVG 출력 시간.
- 계측 선행: crash-free session, 강제 종료 복구 성공률, 저장 후 재오픈 해시 불일치, 내보내기 실패율,
  첫 스트로크까지 시간, 소재 검색→적용 시간. 이 중 해시 불일치와 복구 성공률은 TS-SAVE-007의 완료 기준으로
  쓰는 것이 맞다.

## 9. 하지 말아야 할 것 (원문 §15)

전부 동의하며 두 항목은 이 저장소의 기존 결정과 정확히 일치한다: "기능별 별도 저장·실행 취소 체계 금지"는
ADR 0007/0012의 단일 저널 원칙, "3D 실패 원인·GPU 상태 숨기기 금지"는 ADR 0018의 fail-closed 원칙이다.
"클립스튜디오 전체 기능을 그대로 따라가기 금지"는 [`studio-feature-gap-audit-2026-07-27.md`](./studio-feature-gap-audit-2026-07-27.md)의
감사 원칙("문제와 작업 흐름을 참고하되 구현·명칭·자산은 고유 모델로")과 같다.

## 10. 이 PR의 산출물과 남은 일

커밋(PR #483, main 리베이스 후 해시):

1. `136eecaa` docs — 외부 리뷰 원문 보존
2. `3474c06f` fix(creator) — WILL CRC 증분 슬라이스
3. `26cd209f` fix(studio-project-model) — 구형 evidence 토큰 재매핑
4. `dd49e597` fix(creator) — Dry Media 보존 프레임 레이아웃/DPR 무효화
5. `1fb142a0` docs(perf) — heavy-feature findings 표 정정
6. `16b11b71` test(creator) — WILL 대용량 fixture 타입 보정
7. `a0880c48` test(creator) — `verify:studio-long-stroke` 게이트로 데드 벤치마크 교체
8. `934ed6cd` docs(studio) — 반영·판정 기록(이 문서)
9. `211b47d4` test(creator) — 리뷰 지적 반영(스냅숏 바이트 동일성, flip 케이스 정리, 성능 문서 시제)
10. `25189c54` test(creator) — 장획 게이트 기대치를 디스패치 기하로 도출, 샘플러 재시도 수정
11. `c4f387e2` test(creator) — `.myb` hardness 매핑 상태 단언(main의 core 단위 테스트 실패 해소)
12. test(db) — 마이그레이션 핀 테스트 2건을 0035까지로 갱신(`run-production-database-migrations.test.mjs`
    34→35, `bootstrap-empty-production-database.test.mjs` pending 목록)
13. docs(studio) — 이 문서의 CI 절·커밋 목록 갱신

두 커밋은 main이 먼저 같은 내용을 받아 리베이스에서 드롭됐다: soak runner의 `no-control-regex` 억제(PR #485)와
프로덕션 마이그레이션 매니페스트의 0035 등재. 매니페스트 등재로 실패하기 시작한 핀 테스트 2건은 12번이 잡는다.

main의 core Vitest 실패(2026-09-02 18:50 기준 10파일 18건 — 히스토리 계약 6, DrawNode 4, 검수 스냅샷, 도크
로케일, 스트로크 라우트 경계, 포인터 시작 플랜, 마켓 클라우드 라이브러리, 마이그레이션 핀 2, hardness 1)
중 이 PR은 마이그레이션 핀 2건과 hardness 1건만 잡는다. 나머지는 PR #517이 같은 날 별도로 고치고 있어 중복
수정하지 않았다(`.remember/remember.md` 세션 간 기록).

검증: 변경 테스트 파일 6개 70건 + WILL 코덱·인터체인지·워커·CRC 커널 12파일 76건 통과, 변경 파일 eslint
통과, 새 게이트 CPU 경로 13/13 통과(§3.2). 전체 typecheck는 pre-push 훅에서 실행.

남은 일(이 PR 밖): §3.3 배포 게이트 결정, TS-QA-021 GPU 복구 시 획 유실 확인, §6의 미완료 티켓, §7의
미구현 축(문서 규모 매트릭스, 실기기 리사이즈/DPR E2E, 접근성 자동화), 그리고
`verify:studio-brush-latency`·`verify:studio-long-stroke`를 CI 잡(야간 또는 PR 라벨 트리거)에 연결하는 일.
