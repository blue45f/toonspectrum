# ToonStudio V12 최종 구현·실측 증거 보고서

- 기준 문서: `ToonStudio_Codex_Vello차세대엔진_공격적활용_기존Studio전면교체_V12_2026-08-08.md`
- 제품 경계: 기존 `/studio` 인플레이스 전면 교체
- 데이터 정책: `LEGACY_DATA_MIGRATION=FALSE`; V12 내부 데이터만 SQLite/OPFS에 새로 저장
- 판정 원칙: 품질·필압·손맛을 성능보다 우선하고, 자동화할 수 없는 실기기/CSP 판정은 완료로 위장하지 않는다.
- 보고서 상태: 현재 공유 V12 작업 트리의 구현·raw artifact를 반영한 증거 스냅샷이다. 최종 병합
  `main` HEAD의 release 검증은 아직 실행 전이며, 24시간 soak와 CSP 실기기 블라인드 랩은 미통과다.

## Implemented

### 안정 IR·명령·복구

- `SceneIR`, `StrokeIR`, `BrushProgramIR`, `EffectGraphIR`, `ComicGraph`, `AnimationGraph`를
  엔진 객체와 분리한 저장 권위로 고정했다.
- `CommandBus` + CRC32 append journal + A/B two-slot snapshot + 손상 절단·재개를 구현했다.
- 실제 sqlite-wasm DB에 저널·스냅샷을 저장하고 재개방, CRC 부패, torn tail, 슬롯 손상,
  이어쓰기 중복 방지를 검증했다.
- deterministic ZIP32/store 외부 복구 패키지와 SHA-256 OPFS CAS를 구현했다. 패키지 import는
  경로·크기·CRC32·SHA-256·IR schema·연속 seq·project digest를 모두 검증한다.
- autosave는 native OPFS journal을 1차 권위로, 공유 SQLite를 내구 fallback/mirror로 사용하고
  문서별 Web Lock으로 직렬화한다. localStorage는 호환 입력·폐기 대상으로만 남고 저장 성공이나
  durable generation 전진의 근거가 될 수 없다. OPFS와 SQLite가 모두 실패하면 현재 탭 메모리는
  유지하되 `StudioAutosaveDurabilityError`와 degraded 신호를 내고 durable generation을 전진시키지 않는다.
- 실제 Vite production bundle/Chromium에서 checkpoint reload, 검증된 최신 호환 sidecar의 OPFS
  승격, durable clear tombstone의 stale primary·sidecar 제거를 검증했다. 이 sidecar 경로는 과거
  호환 입력 검증이며 현재 제품 autosave가 localStorage에 쓰는 경로가 아니다.

### 렌더러·GPU 허브

- Vello 0.9 GPU의 native Metal 및 browser WebGPU WASM 레인을 만들고, vello_cpu 0.2.0을
  bit-stable reference/fallback으로 유지했다.
- 기존 `/studio` selection overlay를 첫 bounded Vello Hub island로 교체했다. 같은
  `GPUDevice`를 공유하고 `GPUTexture`를 canvas current texture로 GPU copy하며 제품 표시 hot path의
  GPU→CPU readback은 0이다.
- 이 Hub의 Classic 전환은 `admissionMode=scene-local-shadow-candidate`인 장면 로컬·메모리 내
  후보 선택이다. 영수증은 `persistentWinnerStorage=false`, `productWidePromoted=false`를 고정하며,
  PromotionRegistry 승인과 shadow soak가 없는 상태를 제품 전체 승격으로 해석하지 않는다.
- `SceneFingerprint` v2는 canvas 크기, line/quadratic/cubic, clip, gradient/stop, blend/opacity,
  text code-point와 group depth를 결정적 power-of-two bucket으로 만든다. `DeviceWorkloadProfile`은
  engine build, runtime/workload, browser/OS/CPU/memory, GPU backend/vendor/architecture, DPR/color
  space/power preference를 명시적으로 partition하고 알 수 없는 축은 `?`로 남긴다.
- 실측값만 받는 `ProviderCostModel`과 `(bucket, device-workload)` winner cache, 12% hysteresis,
  pen-down 전환 금지, shadow renderer, fuzzy visual gate, promotion registry, remote kill switch를
  구현했다. cost evidence는 warm/cold/CPU preparation/GPU pass와 CPU/GPU/WASM/texture/buffer/atlas
  메모리 축의 p50/p95/p99를 반환하고, 미관측 축은 추정하지 않고 `null`로 유지한다.
- 연속 visual 또는 shadow failure가 정책 임계값에 도달하면 provider를 자동 격리한다. 격리 중인
  provider는 후보에서 제외되고, revive는 격리 이후 새 visual/shadow/soak 증거와 pen-up 경계를 모두
  요구한다. shadow 실패와 report sink 실패는 winner의 생산 픽셀을 바꾸지 않는다.
- 정확 100,000/1,000,000 path 문서의 생성·sharding/culling·재생은 package/benchmark harness에서
  검증했다. 이 exact corpus를 소비하는 `/studio` 비테스트 호출부는 확인되지 않았다. 제품 호출부
  증거는 별도의 bounded selection island와 정확 100-layer tiled WebGPU surface이며, 둘을 exact
  100k/1M 제품 배선으로 합쳐 주장하지 않는다. one-primary-surface와 device-loss fallback은 유지한다.
- `toon-vello`/`wgpu-toon` fork 트랙을 열어 상류 호환 트랙과 공유-device 트랙을 동시에 검증한다.

### 벡터·텍스트·SVG·Lottie

- Kurbo 0.13.1 editable proxy, Parley 0.11 + Skrifa/Fontique/Harfrust text shaping, Glifo 역할의
  bounded LRU shape cache는 package/provider/품질 하니스 경계까지 구현했다. 이 후보들과 Velato,
  WESL, OpenCV, libmypaint에는 확인된 비테스트 `/studio` 기본 호출부가 없으므로 제품 기본 오너로
  표시하지 않는다. Peniko/Linebender Color는 Vello 장면 의존이며, 실제 일반 텍스트·CSS/광색역
  색관리 제품 오너는 CanvasKit과 Color.js/Culori 및 기존 고비트 경로다.
- `group.clip`을 공통 SceneIR에 추가하고 Vello/CanvasKit 양쪽에서 같은 comic panel clipping을
  렌더한다.
- 편집 가능한 SVG→SceneIR gateway와 strict `vello_svg` adapter·브라우저 품질 하니스를 구현했다.
  현재 제품 호출부는 CPU RGBA thumbnail을 소비하며 interactive GPU Scene Fragment를 소유하지 않는다.
  strict lane의 미지원 SVG 기능은 렌더 전 명시적으로 거부하고 SceneIR/resvg 경로로 라우팅한다.
- Velato 0.11 + Vello 0.9 Lottie frame renderer는 브라우저 WebGPU provider/하니스까지 통과했지만
  기존 `/studio` 애니메이션 플레이어의 기본 호출부로 승격하지 않았다.

### 펜·브러시·자연매체

- raw/coalesced/predicted input 분리, 장치 보정, fallback stabilizer, Perfect Freehand/Kurbo/Vello
  레인을 구현했다.
- Google Ink stroke modeler와 Google Ink mesh를 Emscripten WASM으로 실제 빌드했다. 증분 mesh
  delta는 최종 single-shot mesh와 byte-identical이고 pressure/tilt/orientation을 보존한다.
- MYB/BrushProgramIR→Hokusai raster compile bridge와 libmypaint 1.6.1 full-size benchmark
  reference를 구현했다. full-size raw gate가 품질·처리량 승격 조건을 통과하지 못해 Hokusai 자동
  제품 route는 0개이며, Hokusai는 사용자에게 보이는 명시적 experimental 선택에서만 허용한다.
  libmypaint도 benchmark-reference-only-not-product-fallback이다. 매핑되지 않은 설정·입력은 전부
  warnings/unmapped로 표면화한다.
- Living Ink pointer-contact hot path는 GPU field의 `provider.render()`를 호출하지 않는다. retained
  Konva vector shadow가 실시간 표시를 소유하고, simulation operation은 `present:false` acknowledgement만
  받으며, pointer-up deterministic settle 뒤 `finishStroke()`가 canonical RGBA8을 정확히 한 번 읽는다.
- 브러시 10,000개 SQLite catalog + OPFS 실제 브라우저 close/reopen을 구현했고 카탈로그 상한을
  두지 않았다.

### 필터·셰이더

- CanvasKit/libvips 제품 경로와 OpenCV 분석 후보를 비교하는 품질 토너먼트, EffectGraph
  preview/final compiler, 10,000개 SQLite filter catalog를 구현했다. OpenCV는 패키지/하니스
  후보이며 현재 `/studio` 기본 필터 실행 오너라고 표시하지 않는다.
- 5연산 EffectGraph를 단일 WGSL compute variant로 융합하고 35개 variant를 Chromium WebGPU와
  Naga 29.0.4에서 전수 검증했다.
- interactive filter preview는 retained `GPUCanvasContext`가 최종 storage buffer를 직접 표시한다.
  slider frame 사이에 canvas/context/pipeline을 유지하며 staging buffer나 `MAP_READ`/`mapAsync`를
  사용하지 않는다. settle 때 같은 frame handle의 `readbackFinal()`만 canonical 픽셀을 한 번 만든다.
- 구조 기반 WGSL variant key의 bounded LRU pipeline cache를 구현했다. 값만 바뀌는 slider update는
  같은 pipeline을 재사용하고, in-flight compile deduplication, byte/entry budget, remote kill/revive,
  device-loss epoch invalidation을 계약으로 고정했다.
- wesl-js 0.7.28 모듈 링커를 provider/하니스 도전자 레인으로 추가하되 제품 기본 실행은 정적
  WGSL/자체 생성기를 유지한다.
- G'MIC/GEGL은 앱 번들에 넣지 않고 origin/source/protocol/quota/cancel/crash를 검증하는
  `ExternalFilterBridge` 격리 경계까지만 출하했다.

### 만화·애니메이션·3D·포맷

- panel clip, balloon, tone, seeded effect line을 ComicGraph→SceneIR로 낮추고 손실 가능 항목을
  warnings로 반환한다.
- cel exposure, camera easing, X-sheet/animatic canonical document와 SQLite/OPFS 저장을 구현했다.
- dialogue ruby의 공유 배치 계획을 PDF vector base/ruby glyph, `/ActualText`, `/ToUnicode`로
  내보낸다. PSD는 보이는 raster와 deterministic XMP source/ruby receipt를 함께 내보내며, 이를
  native editable ruby layer라고 표시하지 않는다.
- Three.js/VRM 제품 기능의 custom pose, full poser state, pose material, Emeres library, scene
  snapshot을 공유 SQLite 권위에 연결했다. VRM model/texture와 BG3D model/template/metadata의
  실제 제품 repository를 Vite production Dedicated Worker + SQLite/OPFS CAS로 재개방했다.
- `executeSurfaceBrushStroke()`는 `BrushProgramIR` + `StrokeIR` + `SurfaceProjectionProvider`를
  순차 UV dab operation과 비어 있지 않은 deterministic straight-alpha RGBA8 reference texture로
  낮춘다. pressure/tilt dynamics, UV island/seam 분리, miss/fallback, transaction rollback,
  NaN/overflow/admission을 검증했다. Three.js `Intersection` 호환 입력과 실제 `three-mesh-bvh` ray
  hit를 기존 `StudioVrmTexturePaintRuntime`의 단일 texture owner에 연결하는 concrete adapter도
  구현했다. 실제 R3F UI event loop를 통과했다는 주장은 하지 않는다.
  texture matrix/wrap, triangle/UV-island, texel density, pressure 원정밀도와 seam run을 보존하고,
  성공한 operation 전체를 sparse COW undo 뒤 한 번의 atlas upload로 원자 커밋한다. 취소·upload
  실패·cross-texture hit는 픽셀과 history를 남기지 않고 fail-closed한다.
- MYB v3, ABR v1/v2, SUT/SUTG, Krita bundle, SVG를 bounded FormatGateway에서 검증·변환한다.
  ABR v6+와 손실 가능한 기능은 “지원 완료”로 표시하지 않고 explicit unsupported로 반환한다.

### 로컬 데이터 권위

- `@sqlite.org/sqlite-wasm` 3.53.0-build1 + OPFS SAH-pool
  `toonspectrum-studio-sqlite` + `/studio-local-v12.db`를 앱 수명 공유 권위로 승격했다.
- renderer tournament, cost samples, journal/snapshot, brush/filter catalogs, CRDT outbox/ACK,
  animatic, translation memory, Production Bible, creator pack, Emeres, scene snapshot, VRM 창작
  상태, palette/Brand Kit/saved clips, 이름 있는 프로젝트 체크포인트, BG3D shot recovery를
  SQLite/OPFS에 저장한다. 영구 거절 CRDT frontier와 재전송 잠금 marker도 같은 권위에 저장해
  제품 factory가 IndexedDB/localStorage를 열지 않는다.
- AI 이미지 참조 메타데이터는 `StudioProjectFile`·project snapshot·autosave·save payload의 동일
  문서 권위에 포함하며, 원본 이미지 바이트는 asset/CAS 참조로 분리한다. Creator Pack palette는
  제품 SQLite repository가 소유한다. 브러시 quick slot도 `studio-brush-quick-slots-v12` SQLite
  권위를 두고 legacy 자동 마이그레이션을 금지했으며, 최종 병합 `main`에서 제품 호출부가 이 권위를
  소비하는지 다시 확인한다.
- Unsplash access key, AI recent prompts와 AI session settings, pose/full-poser clipboards는 탭 수명의
  `sessionStorage` 또는 메모리만 사용한다. 과거 localStorage 값은 호환 읽기 뒤 제거하거나 폐기하며,
  이 세션성 데이터를 SQLite 영구 창작 권위로 승격하지 않는다.
- CRDT recovery vault는 구조화 `crdt_recovery_v12_rows` v6 surface에 permanent-rejection marker와
  manifest-last frontier chunks를 저장한다. 같은 페이지의 즉시 latch는 ephemeral이며 SQLite commit
  실패를 durable success로 바꾸지 않는다. row identity/UTF-8 byte count/schema/연속 chunk가 다르면
  부분 frontier를 반환하지 않고 fail-closed한다.
- VRM 트래킹 보정값은 `studio-vrm-tracking-calibration-v12` namespace와 `device-default-v1` key를
  사용하는 전용 SQLite repository가 소유한다. canonical finite payload만 허용하고 save/clear를
  직렬화하며, product hydration/mutation generation fencing으로 늦은 load가 현재 보정을 덮지 않는다.
  이 보정 경로에는 localStorage authority나 조용한 fallback이 없다.
- 제품 boot는 legacy localStorage/IndexedDB를 자동 탐색·복사하지 않는다. 남은 adapter는
  explicit compatibility/test seam이며 V12 cutover 시 기존 내부 데이터는 폐기한다.
- Community Marketplace의 게시 후보도 brush/filter/palette SQLite repository에서 비동기
  hydration하며, 순수 projection의 omitted input은 빈 목록이라 legacy localStorage를 발견하지 않는다.
- 3D 마네킹 체형·포즈 상태와 BG3D LT 사용자 프리셋은 각각
  `studio-mannequin-state-v12`, `studio-bg3d-lt-user-presets-v12` SQLite namespace를 사용한다.
  hydration/mutation generation fencing으로 늦은 load가 현재 편집을 덮지 않으며, 쓰기 실패는
  memory-only 상태로 명시한다.
- 원본 에셋 마켓의 설치·업데이트·제거 manifest도
  `studio-marketplace-package-library-v12` SQLite namespace로 옮겼다. 제품 패널의
  localStorage 접근은 0이며, concurrent writer 병합·명시적 제거·200개 overflow 무축출·손상
  fail-closed와 UI rollback을 검증했다.
- 일반 Studio asset, VRM 모델·thumbnail·texture-paint, BG3D GLB·thumbnail은 SQLite에 base64를
  넣지 않는다. strict canonical manifest는 공유 `/studio-local-v12.db`, 실제 바이트는 기능별
  OPFS SHA-256 CAS가 소유하며, CAS 검증·owner-reference fencing 뒤 manifest를 마지막에 commit한다.
  제품 무인자 API는 ambient IndexedDB를 열지 않고, missing/tampered blob·MIME/size drift·torn
  manifest를 부분 복구 없이 거부한다.
- 사용자 글꼴 manifest는 `studio-custom-font-library-v12`/`manifest-v1`, 실제 font bytes는
  `toonspectrum-studio-assets` SHA-256 CAS가 소유한다. 실제 제품 factory를 module Dedicated
  Worker에서 무인자로 열었고 localStorage·IndexedDB·memory DB·memory CAS fallback은 모두 0이었다.
  missing/corrupt CAS와 metadata mismatch는 부분 목록이나 대체 글꼴 없이 fail-closed한다.

### 라이선스·출처 증거

- `THIRD_PARTY_NOTICES.md`와 `crates/studio-engine-vello/THIRD_PARTY_INVENTORY.json`은 Vello CPU
  artifact의 외부 crate 85개와 GPU `fabric,lottie,svg` artifact의 외부 crate 144개를 각각 핀한다.
  두 artifact의 JS/WASM 4개 파일과 88개 license document digest가 inventory에 기록되어 있다.
- Google Ink stroke modeler, Google Ink mesh, libmypaint는 pnpm graph로 추정하지 않는다.
  각 소스 artifact 디렉터리의 `THIRD_PARTY_INVENTORY.json`/`NOTICE`가 총 3개 opaque WASM inventory,
  5개 upstream component, JS/WASM 6개 파일을 버전·commit·license·SHA-256으로 핀한다. Vello까지
  합치면 독립 엔진 산출물 10개 파일이 hash-pinned다.
- 최종 병합 HEAD에서는 `pnpm run audit:licenses`와 생성 notice drift 검사를 다시 실행해야 한다.
  현재 항목은 inventory 존재·내용 증거이며 최종 HEAD audit 실행 완료를 뜻하지 않는다.

## Deleted/Replaced

- 별도 V12 앱·별도 route·평행 monorepo 대신 기존 `/studio` 호출부를 교체했다.
- 렌더러 객체를 문서 원본으로 저장하던 경로를 stable IR/provider descriptor로 교체했다.
- 제품 기본 localStorage JSON envelope와 기능별 IndexedDB 이중 권위를 SQLite/OPFS로 교체했다.
- autosave에서 localStorage 쓰기와 browser-KV durable-success 판정을 제거했다. OPFS/SQLite receipt가
  없으면 저장 성공으로 표시하지 않고 현재 generation을 dirty 상태로 유지한다.
- VRM 트래킹 calibration의 localStorage key를 전용 SQLite namespace로 교체하고, CRDT 영구 거절
  marker/frontier의 localStorage·IndexedDB fallback을 구조화 SQLite와 ephemeral same-page latch로
  교체했다.
- 제품의 generic asset, VRM asset/texture, BG3D model/template/metadata 무인자 저장 API에서
  ambient IndexedDB 자동 탐색을 제거하고 명시적 `legacy*` import/test seam으로 격리했다.
- 사용자 글꼴의 localStorage/base64 manifest와 ambient IndexedDB/memory fallback을 제품 권위로
  사용하지 않는다. autosave lifecycle sidecar는 별도 영구 권위가 아니라 더 최신일 때만 검증 후
  OPFS로 승격되는 current-version reconciliation 입력이다.
- 파괴 인벤토리에 OPFS root `studio-recovery`와 dotted namespace exact key
  `toonspectrum.studio-marketplace-library.v1`,
  `toonspectrum.studio-creator-filter-presets.v1`,
  `toonspectrum.studio-filter-library.v12.fallback`,
  `toonspectrum.studio.bg3d.lt-presets.v1`,
  `toonspectrum.studio.bg3d.lt-presets.corrupt.v1`을 추가했다. account/platform 데이터까지 지울 수
  있는 광범위한 `toonspectrum.studio` prefix는 사용하지 않는다.
- CPU readback 기반 제품 WebGPU 표시는 shared-device texture copy와 retained GPUCanvas presentation으로
  교체했다. filter drag 중 GPU→CPU readback은 0이고 settle canonical readback만 1회 허용한다.
- Living Ink의 pointer-contact material readback을 retained vector shadow + simulation-only acknowledgement로
  교체하고 canonical materialization을 pointer-up settle 이후로 이동했다.
- “하나의 엔진이 전체 기능을 소유”하는 규칙을 기능별 provider와 큰 island/workspace 소유권으로
  교체했다.
- 무조건 자체 구현 금지 규칙을 동일 corpus·품질·성능·라이선스 증거 기반 승인 규칙으로 교체했다.
- V12 파괴 확인 문구는 `REPLACE_CURRENT_TOONSTUDIO_IN_PLACE_V12`로 교체했고 compile flag,
  `RESET_EXISTING_STUDIO_DATA=YES`, 확인 문구가 모두 없으면 삭제를 거부한다.

## Build/Test/Benchmark commands

주요 재현 명령은 다음과 같다. 최종 병합 HEAD에서는 아래 명령을 다시 실행해 결과를 이 문서에
고정한다.

```text
pnpm run verify:studio-engine
pnpm run validate:architecture
pnpm run verify:studio-launch
pnpm run verify:studio-brushes
pnpm run verify:studio-gpu-committed-parity
pnpm run verify:studio-gpu-filters
pnpm run verify:studio-living-ink-execution
pnpm run verify:studio-autosave-opfs
pnpm run verify:studio-vello-candidate
pnpm run verify:studio-menus
pnpm run verify:studio-mobile-top
pnpm run verify:studio-icons
pnpm run audit:licenses
pnpm run verify:push

pnpm exec vitest run packages/studio-engine-registry/src/__tests__/tournament-evidence.test.ts
pnpm exec vitest run \
  src/domains/creator/studio-autosave-opfs-session.test.ts \
  src/domains/creator/studio-autosave-opfs-product-boundary.test.ts \
  src/domains/creator/studio-crdt-recovery-vault-sqlite.test.ts \
  src/domains/creator/studio-crdt-recovery-vault-sqlite-product-boundary.test.ts \
  src/domains/creator/studio-vrm-tracking-calibration-sqlite-repository.test.ts \
  packages/studio-brush-platform/src/__tests__/surface-brush-composition.test.ts
pnpm exec tsx tests/benchmarks/harness/wgsl-pipeline-cache-browser.ts

VELLO_GPU_BROWSER_PROBE=1 pnpm exec vitest run packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts
WGSL_VARIANT_BROWSER_PROBE=1 pnpm exec vitest run packages/studio-engine-registry/src/__tests__/wgsl-variants-browser.test.ts
WESL_VARIANT_BROWSER_PROBE=1 pnpm exec vitest run packages/studio-engine-registry/src/__tests__/wesl-variants-browser.test.ts
pnpm exec tsx tests/benchmarks/harness/custom-font-sqlite-opfs-browser.ts
pnpm exec tsx tests/benchmarks/harness/renderer-tournament-browser.ts
pnpm exec tsx tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser.ts
pnpm exec tsx tests/benchmarks/harness/vrm-surface-brush-browser.ts
pnpm exec vitest run \
  tests/visual/custom-font-sqlite-opfs-browser-contract.test.ts \
  tests/visual/renderer-tournament-browser-contract.test.ts \
  tests/visual/crdt-recovery-sqlite-opfs-browser-contract.test.ts \
  tests/visual/vrm-surface-brush-browser-contract.test.ts \
  tests/visual/studio-v12-browser-qa-contract.test.ts \
  tests/visual/svg-vello-native.test.ts \
  tests/visual/tiledoc-webgpu-browser-contract.test.ts \
  tests/visual/large-scene-million-contract.test.ts \
  tests/visual/vrm-asset-sqlite-opfs-browser-contract.test.ts \
  tests/visual/bg3d-libraries-sqlite-opfs-browser-contract.test.ts
pnpm exec vitest run \
  src/domains/creator/studio-dialogue-ruby-export.test.ts \
  src/domains/creator/studio-canvaskit-pdf-vector.test.ts \
  src/domains/creator/studio-psd-export-text.test.ts
SOAK_MINUTES=480 pnpm run soak:studio-engine
```

## Measured results

| 경로 | 실제 결과 |
| --- | --- |
| Vello WebGPU 128² | 7장면 p50 2.9~3.0ms, 6장면 fuzzy mismatch 0%, curve 0.036621%(gate 0.6%) |
| Vello-native SVG | 제품은 CPU RGBA asset preview이며 interactive GPU Scene Fragment가 아니다. vello_svg 0.10.0 native CPU↔resvg SSIM 0.995936/0.995692/0.997639; 별도 browser GPU 하니스 p50 3.0ms, p95 3.1~3.4ms, GPU↔CPU fuzzy 최대 0.030518% |
| Vello 대형 장면 package/harness | 5k@512² GPU p50 73.7ms vs vello_cpu 2,471.7ms; 15k GPU 205.0ms vs CPU 7,410.3ms |
| renderer tournament 실제 브라우저 | schema v2, Chromium 140/Apple Metal WebGPU, 동일 SceneIR·cold 7/warm 31: flat-simple CanvasKit warm p50/p95/p99 0.115/0.160/0.215ms·fuzzy 0%; curves/clips/gradients Vello GPU 3.040/4.250/4.350ms·0%; dense 768-stroke Vello GPU 19.820/21.710/25.060ms·0%(CanvasKit 0.006104%); 0.505% 반복 측정은 12% hysteresis hold, 시각 실패 3회 fault-control은 quarantine. shadow soak 부재로 product-wide promotion은 보류. 기술 증거는 `technicalPass=true`지만 `script-src: eval` CSP event 76건 때문에 최상위 `status=quarantined`, `releasePass=false`, `pass=false`다 |
| 정확 대형 문서 | package/harness에서 100k/1M path 생성·직렬화·재생 exact count; 1M 중심 viewport 3,904 path GPU p50/p95/p99 18.110/20.485/20.485ms, 256-path CPU reference fuzzy 0.032%. exact corpus의 비테스트 `/studio` caller는 확인되지 않았고 1M monolithic all-visible는 격리 |
| 100-layer tiled WebGPU | 8,192² 및 2,048×30,720, 100 layers/200 RGBA tiles/209,715,200B; pan/zoom p50/p95/p99 16.645/18.505/21.120ms 및 16.685/18.435/27.595ms; hot-path readback 0, max linear delta 0.00036147(gate 0.002) |
| Google Ink 증분 mesh | update p50/p95/p99 0.069750/0.085750/0.108125ms; single-shot 대비 payload -85.90%; final mesh byte-identical |
| 필터 품질 | downscale: libvips Lanczos3 27.26dB/SSIM 0.9887; Gaussian: CanvasKit 47.94dB/0.9874 |
| retained WebGPU filter presentation 512² | Chromium 140/Metal, 6-op chain, warmup 5 + 40 frames: interactive `mapAsync` 0, settle 1; submit/present p50/p95/p99 1.10/3.90/4.30ms, next-rAF visible 16.70/17.90/18.50ms, final readback 3.90ms; GPUCanvas↔canonical RGB/alpha 최대 오차 0, changed channel 0 |
| WGSL/WESL | 35/35 browser compile + Naga valid; 5→1 pipeline(-80%), GPU pass p50 0.142→0.037ms, 픽셀 오차 0 |
| WGSL pipeline cache | Chromium 140/Metal production build, 61 samples: uncached create p50/p95/p99 2.805/2.885/3.630ms vs cached value update 0.035/0.050/0.090ms; p95 57.7×, pipeline creation 61→1, long task 0, estimated resident entry 22,040B |
| Living Ink deferred presentation | 실제 Chromium WebGL2/WebGPU 각각 operation 81, applied ACK 81, ACK readback 0, ACK ImageBitmap 0, explicit presentation 1; 각 backend의 deferred endpoint가 every-operation baseline과 hash-exact |
| CJK text cache package/harness | 실제 Parley/Skrifa 100,000 serviced glyph; steady hit 100%, 전체 hit 90%, 472.601×; 6 sample shape/pixel byte-exact |
| SQLite Translation Memory | 512 entries/296,700B; save p50/p95/p99 7.965/13.860/16.255ms, load 8.715/9.915/10.075ms |
| SQLite Production Bible | save p50/p95/p99 2.450/2.885/3.685ms, load 0.240/0.385/1.465ms; forced Worker terminate reopen 9.215ms |
| SQLite animatic | 799,973B; save p95 24.520ms, load p95 5.135ms; close/reopen SHA 동일 |
| autosave native OPFS reconciliation | Chromium 140 production bundle; `getDirectory` 5회, 같은 문서 Web Lock 11회; reload snapshot seq 1, 최신 sidecar→OPFS seq 2, clear tombstone seq 3; console/page/request/5xx/CSP error 0 |
| 사용자 글꼴 23,278,008B TTF | 30 save p50/p95/p99 136.660/143.310/143.675ms, 30 load 74.300/80.000/85.130ms; 매 회 byte length·SHA mismatch 0 |
| 사용자 글꼴 66,933,080B TTC | 30 save p50/p95/p99 383.640/396.450/399.880ms, 30 load 217.575/234.320/238.990ms; 매 회 byte length·SHA mismatch 0 |
| 사용자 글꼴 재개방/FontFace | 새 Worker 정상 재개방 30회 total p50/p95/p99 305.855/321.795/322.120ms; commit 직후 강제 terminate 1회 internal/page recovery 384.210/738.860ms; TTF/TTC decode 33.015/47.855ms |
| VRM asset SQLite/OPFS | 1MiB model 100 save/load p95 18.690/9.245ms, 32MiB 2 save/5 load p95 260.170/208.580ms, PNG texture 100 save/load p95 12.285/3.580ms; reopen 102 models+100 textures mismatch 0, fallback 0 |
| VRM surface brush Three/BVH | Chromium 140/ANGLE Metal, 실제 `sample.vrm`(5,307 vertices/8,864 triangles, 2,048² atlas) 2회 atlas byte-deterministic(commit 14.690/14.870ms). mock 없이 Three→`three-mesh-bvh`→surface provider→`executeSurfaceBrushStroke`→texture runtime을 실행했다. 256²/8 samples, 512²/32, 1,024²/128의 full raycast→commit p50/p95/p99는 각각 1.585/2.940/3.350ms, 4.280/5.400/5.695ms, 13.205/14.785/15.650ms(각 warm 31); BVH-derived UV 최대 delta 0, hot-path GPU readback 0, seam/cancel/upload rollback 통과, CSP event 0. GPU resident memory와 사람 시각 품질은 미측정이다 |
| BG3D SQLite/OPFS | 1/32/100MiB verified read p95 7.255/140.865/432.315ms; 1MiB commit 후 Worker terminate reopen/read 64.315ms exact; 250ms Web Lock holder에 product writer wait 250.515ms, fallback 0 |
| PDF/PSD ruby export | PDF plan/assembly p95 0.046/0.082ms, 3,688B deterministic; PSD p50/p95/p99 3.154/4.086/4.563ms, 48,724B deterministic; focused 3 files/66 tests 통과 |
| SQLite 마네킹 상태 | 19관절·7체형·3축 canonical 1,307B; 100회 save p50/p95/p99 2.305/2.600/2.920ms, load 0.170/0.200/0.230ms; Worker 강제 종료 뒤 SHA·의미 동일 |
| SQLite BG3D LT 프리셋 | 최대 32개 canonical 28,447B; 100회 save p50/p95/p99 8.715/9.520/10.655ms, load 4.140/4.990/5.270ms; Worker 강제 종료 뒤 SHA·32개 의미 동일 |
| CRDT recovery SQLite/OPFS | Chromium 140 Dedicated Worker, 31 frontier/4,127 updates/95 rows/1,883,363B; save p50/p95/p99 75.495/131.265/134.820ms, 전체 load 126.670/134.105/179.470ms; close/reopen·30회 load·1,853,078B bundle digest 동일, 257-update commit 직후 Worker terminate 후 손실 0, 손상 행 fail-closed. 동일 SAH-pool의 두 번째 Worker는 `NoModificationAllowedError`로 거절됐고 예상 경합 console error 7건/예상 밖 error 0건이므로 판정은 `quarantined-single-owner`다 |
| `/studio` production browser QA | Chromium 140, 1440×900·390×844·320×568 모두 `/studio` 유지, 수평 overflow 0, primary canvas/top/edit surface 가시·비영점, 안전한 메뉴/도크 open→close 통과; console/page/request/5xx/CSP/unhandled rejection 각 0; launch/menu/mobile-top/icon verifier 전부 exit 0. 이 결과는 3개 guest API를 브라우저 context에서 격리한 dirty detached-worktree `dist`(`index.html` SHA-256 `35df9ccf0a380b90e2755b8a45edfe36e022976c4b59da044567aa84196e9045`) 증거이며 최종 병합 `main` 검증이 아니다 |
| final bundle budget | 최신 `origin/main` 통합 production build 기준 route raw/gzip **4,642.2/1,489.0KiB**, StudioPage **1,958.5/578.1KiB**, app shell 이후 **4,059.5/1,305.6KiB**, request **191**, route chunk **200**; baseline regression **0**, 개선 2건. 두 개의 273/313B eager micro-chunk는 기존 core-contract chunk로 병합해 요청 상한을 완화 없이 통과했다 |
| 외부 복구 패키지 | 1,055,639B ZIP export p50/p95/p99 4.545/4.970/5.034ms; import 27.922/34.303/40.996ms |
| third-party provenance inventory | Vello CPU/GPU 외부 crate 85/144, Vello license document digest 88, opaque WASM inventory 3개·upstream component 5개, hash-pinned JS/WASM 엔진 파일 총 10개 |
| 8h soak | 480분, 727,739 cycles, 29,109,560 commands, 1,455,478 renders, error 0; RSS 225.1→344.8MiB |
| 24h soak | 유효한 1,440분 raw artifact 없음 — **미통과·격리 유지**; 8h 결과로 면제하지 않음 |

원시 데이터는 `tests/benchmarks/results/`에 커밋하며, browser/engine 메모리가 API로 노출되지 않은
항목은 추정하지 않고 `null`로 유지한다. autosave 검증기는 실행별 JSON을 격리된 임시 디렉터리에
기록하므로 임시 경로를 영구 artifact로 인용하지 않고 아래 검증기와 contract를 재현 권위로 삼는다.
Renderer tournament는 실제 Chromium raw benchmark를 갖는다. CPU preparation/GPU pass/readback 분리와
provider 귀속 native CPU/GPU·texture/buffer peak는 production adapter와 WebGPU가 노출하지 않아 `null`로
유지하고, Vello WASM memory만 실제 buffer byte length를 기록했다. 세 fingerprint bucket의 bounded corpus
판정이며 shadow soak가 없으므로 product-wide promotion으로 확대하지 않는다.

### Evidence artifact index

- renderer tournament: `packages/studio-engine-registry/src/tournament.ts`,
  `packages/studio-engine-registry/src/__tests__/tournament-evidence.test.ts`,
  `tests/benchmarks/results/renderer-tournament-browser.json`,
  `tests/benchmarks/harness/renderer-tournament-browser-page.ts`,
  `tests/benchmarks/harness/renderer-tournament-browser.ts`,
  `tests/visual/renderer-tournament-browser-contract.test.ts`
- retained WebGPU filter: `tests/benchmarks/results/gpu-filter-retained-presentation.json`,
  `src/domains/creator/studio-gpu-filter-presentation.ts`,
  `src/domains/creator/studio-gpu-filter-apply.test.ts`,
  `src/domains/creator/StudioKonvaImageNode.race.test.tsx`
- WGSL pipeline cache: `tests/benchmarks/results/wgsl-pipeline-cache.json`,
  `tests/benchmarks/harness/wgsl-pipeline-cache-browser.ts`,
  `packages/studio-engine-registry/src/wgsl-pipeline-cache.ts`
- Living Ink: `tests/benchmarks/results/living-ink-probe.json`,
  `src/domains/creator/studio-living-ink-studio-coordinator.test.ts`,
  `src/domains/creator/studio-living-ink-live-draft-boundary.test.ts`
- 사용자 글꼴: `tests/benchmarks/results/custom-font-sqlite-opfs-browser.json`,
  `tests/visual/custom-font-sqlite-opfs-browser-contract.test.ts`,
  `tests/benchmarks/harness/custom-font-sqlite-opfs-browser.ts`
- autosave OPFS reconciliation: `scripts/verify-studio-autosave-opfs-session.mts`,
  `scripts/verify-studio-autosave-opfs-session.test.ts`,
  `src/domains/creator/studio-autosave-opfs-session.test.ts`,
  `src/domains/creator/studio-autosave-opfs-product-boundary.test.ts`,
  `src/domains/creator/studio-storage-recovery-runtime.test.ts`
- CRDT recovery SQLite: `src/domains/creator/studio-crdt-recovery-vault.ts`,
  `src/domains/creator/studio-crdt-recovery-vault-sqlite.test.ts`,
  `src/domains/creator/studio-crdt-recovery-vault-sqlite-product-boundary.test.ts`,
  `tests/benchmarks/results/crdt-recovery-sqlite-opfs-browser.json`,
  `tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser-worker.ts`,
  `tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser-page.ts`,
  `tests/benchmarks/harness/crdt-recovery-sqlite-opfs-browser.ts`,
  `tests/visual/crdt-recovery-sqlite-opfs-browser-contract.test.ts`
- VRM tracking calibration SQLite:
  `src/domains/creator/studio-vrm-tracking-calibration-sqlite-repository.ts`,
  `src/domains/creator/studio-vrm-tracking-calibration-sqlite-repository.test.ts`,
  `src/domains/creator/studio-vrm-creative-sqlite-product-boundary.test.ts`
- 3D surface brush: `packages/studio-brush-platform/src/brush-composition.ts`,
  `packages/studio-brush-platform/src/__tests__/surface-brush-composition.test.ts`,
  `src/domains/creator/studio-three-mesh-bvh-provider.ts`,
  `src/domains/creator/studio-three-mesh-bvh-provider.test.ts`,
  `src/domains/creator/studio-vrm-surface-brush-provider.ts`,
  `src/domains/creator/studio-vrm-surface-brush-provider.test.ts`,
  `tests/benchmarks/results/vrm-surface-brush-browser.json`,
  `tests/benchmarks/harness/vrm-surface-brush-browser-page.ts`,
  `tests/benchmarks/harness/vrm-surface-brush-browser.ts`,
  `tests/visual/vrm-surface-brush-browser-contract.test.ts`
- SVG/Vello: `tests/benchmarks/results/vello-svg-native-browser.json`,
  `tests/visual/svg-vello-native.test.ts`
- tiled/million-scale: `tests/benchmarks/results/tiledoc-webgpu-browser.json`,
  `tests/visual/tiledoc-webgpu-browser-contract.test.ts`,
  `tests/benchmarks/results/large-scene-million.json`,
  `tests/visual/large-scene-million-contract.test.ts`
- VRM/BG3D: `tests/benchmarks/results/vrm-asset-sqlite-opfs-browser.json`,
  `tests/visual/vrm-asset-sqlite-opfs-browser-contract.test.ts`,
  `tests/benchmarks/results/bg3d-libraries-sqlite-opfs-browser.json`,
  `tests/visual/bg3d-libraries-sqlite-opfs-browser-contract.test.ts`
- `/studio` production browser QA: `tests/benchmarks/results/studio-v12-browser-qa.json`,
  `tests/visual/studio-v12-browser-qa-contract.test.ts`
- ruby PDF/PSD: `docs/candidates/dialogue-ruby-export/benchmark-plan.md`,
  `src/domains/creator/studio-dialogue-ruby-export.test.ts`,
  `src/domains/creator/studio-canvaskit-pdf-vector.test.ts`,
  `src/domains/creator/studio-psd-export-text.test.ts`
- license/provenance: `THIRD_PARTY_NOTICES.md`,
  `crates/studio-engine-vello/THIRD_PARTY_INVENTORY.json`,
  `packages/studio-brush-platform/src/ink-modeler/THIRD_PARTY_INVENTORY.json`,
  `packages/studio-brush-platform/src/ink-mesh/THIRD_PARTY_INVENTORY.json`,
  `packages/studio-brush-platform/src/libmypaint/THIRD_PARTY_INVENTORY.json`
- soak: `tests/benchmarks/results/soak-leak-regression-2026-08-08.json`,
  `tests/benchmarks/results/soak.json`

## Visual correctness results

- Vello GPU↔vello_cpu: 7장면 중 최대 fuzzy mismatch 0.036621%(δ48 대칭 3×3, gate 0.6%).
- Vello-native SVG↔resvg: curves/gradients/clip SSIM 0.995936/0.995692/0.997639;
  GPU↔CPU fuzzy 최대 0.030518%.
- Comic clip: Vello 1,200px vs CanvasKit 1,199px ink coverage(0.08% 차이), panel gap 누출 0.
- SVG gateway: speech balloon/star/clipped rect의 엔진 간 coverage 차이 0.804/0.272/1.304%.
- MYB→Hokusai pressure: wash-soft ink-area correlation 0.963, ink-crisp 0.940; 8/8 bucket 비감소.
  이는 compile/pressure 축 증거이며 자동 제품 route 승격 증거는 아니다.
- full-size raw artifact는 `allQualityParityPass=false`, `hokusaiPasses20pctGate=false`, 최소 처리량
  비율 **0.096991×**를 기록했다. 따라서 Hokusai automatic route·자동 승격 preset은 **0개**이고
  명시적 experimental opt-in만 허용한다. libmypaint는 비교 기준일 뿐 제품 fallback이 아니다.
- retained WebGPU filter presentation은 표시 GPUCanvas와 settle canonical 픽셀의 최대 RGB/alpha
  오차 0/255, changed channel 0이다. 품질 확인용 `getImageData`는 drag가 끝난 benchmark에서만
  사용했고 제품 interactive presentation에는 없다.
- Living Ink의 Chromium deferred presentation은 WebGL2와 WebGPU 각각 every-operation baseline과
  endpoint hash가 exact이고 ACK readback은 0이다. Studio product 경로의 vector shadow→settled
  handoff는 계약 테스트로 고정했지만, live→settled centroid/centerline drift와 energy ratio의 현재
  수치는 커밋된 raw artifact가 없어 이 보고서에 전재하지 않는다.
- 3D surface brush는 같은 IR/seed/실제 Three.js·BVH hit에서 UV operation, package reference RGBA8,
  runtime atlas RGBA8를 만들고 alpha가 0보다 큰 texel을 남긴다. reference와 atlas는 서로 같은
  표현이라고 주장하지 않으며, 각자의 digest가 재실행 31회 동안 각각 byte-stable임을 검증했다.
  pressure `0.123456789`/`0.987654321`은 operation까지 strict-equal이며, UV chart 변경은 두 run과 한
  seam으로 분리돼 chart 사이 보간 dab을 만들지 않는다. 실제 bundled `sample.vrm`도 두 실행의 atlas
  bytes가 동일했다. 이는 adapter→제품 texture runtime 경로의 결정성 증거이며 Studio UI 도구 배선이나
  사람의 VRM 질감·손맛 블라인드 품질 판정으로 확대하지 않는다.
- CJK cache는 fresh/cached shape와 렌더 픽셀이 표본 6개에서 byte-exact이고 tofu outline은 0이다.
- 복구한 `/System/Library/Fonts/Supplemental/Arial Unicode.ttf`(23,278,008B,
  SHA-256 `876af2cd4854644e7f3e7feb2f688997fdb3343c6df6693611209c9dfb47ccec`)와
  `/System/Library/Fonts/Supplemental/Songti.ttc`(66,933,080B,
  SHA-256 `6873ac2ccab5c2e74d87d6b690f3773098dd6a6238805363a3b3567f2caf6f47`)를 실제
  `FontFace`로 decode했다. 1,400×340 한·중·일 canvas의 반복 pixel/PNG SHA-256은 각각
  `6c496d748ba2d3af84e7e4b31306748acba4f6fba65704e54789f9291b218911` /
  `654ff4798b8c4a0d86111fd2f8c32b871a2eb7a727f1218a43691ac0fa68d063`로 동일했다.
- PDF ruby는 base와 reading Unicode를 vector glyph와 semantic mapping으로 보존한다. PSD 경로는
  visible raster + XMP source receipt의 정확성만 통과했으며 native editable ruby를 주장하지 않는다.

## Known failures and quarantined providers

- **24h soak**: `tests/benchmarks/results/soak.json`의 `soakMinutes`는 480이고 8시간 런은 통과했다.
  1,440분 완주 raw artifact는 없으므로 24시간 게이트는 미통과·격리 상태다. 제품 오너가 이를
  면제했다는 근거가 없으며 8시간 결과로 대체하지 않는다.
- **CSP blind lab**: deterministic/sealed 평가 하니스는 완료했지만 최신 CSP, 물리 태블릿, 평가자
  응답이 없어 `insufficient-data`다. 자동 수치만으로 CSP 비열위를 선언하지 않는다.
- **renderer tournament CSP-clean**: 실제 Chromium tournament run은 `script-src: eval` event 76건을
  기록했고 artifact 자체가 `status=quarantined`, `cleanClaimed=false`다. Zod의 caught `Function`
  probe라는 설명은 source audit에 근거한 추론일 뿐 확정 원인이 아니다. timing/visual evidence는
  유지하지만 이 run을 CSP-clean 또는 CSP 비열위로 승격하지 않는다.
- **Hokusai 자동 제품 route**: full-size 품질/처리량 gate 실패 때문에 automatic route 0을 유지한다.
  explicit experimental 선택은 가능하지만 완료·기본 provider·CSP 비열위로 표시하지 않는다.
- **Skia Graphite/Dawn WASM**: Skia 소스 1,774/1,783 target까지 컴파일했으나 상류 emsdk 4.0.7
  고착, WebGPU API drift, `CK_ENABLE_WEBGPU` 미배선, host Mach-O Dawn archive로 링크가 차단됐다.
- **Xilem/Masonry**: browser WebGPU PoC는 동작했지만 Vello 0.6 핀, DOM AccessKit 투영·IME·screen
  reader 게이트가 남아 제품 기본 UI로 승격하지 않았다.
- **bevy_vello**: Vello 0.7 계열이라 Vello 0.9 제품 허브와 버전 불일치로 격리했다.
- **G'MIC/GEGL**: 브리지 계약만 검증됐다. 실제 바이너리·시각 품질·라이선스 배포 증거 전에는
  provider를 활성화하지 않는다.
- **ThorVG**: 공식 WebCanvas/Lottie 후보는 조사 상태다. 현재 Vello-native SVG/Velato보다 기능,
  품질, 번들 또는 성능 우위를 같은 corpus에서 입증하기 전에는 추가하지 않는다.
- **exact 100k/1M caller 범위**: 정확 문서·pan/zoom은 package/harness에서 통과했지만 이 corpus를
  소비하는 비테스트 `/studio` caller는 확인되지 않았다. 1M path를 단일 frame에 모두 보이는
  workload는 격리했고, 제품의 bounded tiled surface·selection island 증거와 합치지 않는다.
- **사용자 글꼴 라이선스/플랫폼**: 위 TTF/TTC는 이 macOS에 설치된 system font를 로컬
  benchmark 입력으로만 읽었다. 소스 저장소에는 복사·커밋하지 않았고 production bundle에도
  포함하지 않았으며, 격리된 benchmark origin의 OPFS CAS에만 제품 시나리오로 저장했다.
  재배포·embedding 권리를 주장하지 않는다. Windows/Linux/Safari/Firefox와 quota exhaustion은
  별도 게이트다.
- **autosave 외부 fault**: native OPFS reload, sidecar 승격, tombstone은 통과했지만 Chromium process
  crash, OS power loss, quota exhaustion, 다중 탭 장기 contention은 이 하니스가 통과했다고
  표시하지 않는다.
- **CRDT recovery 외부 fault**: 실제 Chromium OPFS SAH-pool close/reopen, manifest-last corruption
  fail-closed, p50/p95/p99와 commit 직후 Dedicated Worker 강제 종료는 통과했다. 같은 pool의 두 Worker
  동시 소유는 `NoModificationAllowedError`로 거절돼 single-owner 경계를 유지한다. 이 의도적 경합에서
  나온 console error 7건은 artifact에 예상 격리 오류로 보존됐고 예상 밖 console error는 0건이다.
  전체 Chromium process crash, OS power loss, quota/SAH-pool exhaustion, 장기 multi-tab handoff와
  Worker peak memory는 미측정이다.
- **Living Ink product handoff 수치**: no-readback/vector-shadow/canonical-once 계약은 구현됐지만 현재
  커밋된 raw artifact에는 Studio watercolor live→settled centroid/centerline drift와 energy ratio가
  없다. verifier 출력만으로 숫자를 영구 실측값처럼 인용하지 않는다.
- **3D surface brush 잔여 범위**: 실제 Three.js/VRM raycast/BVH provider와 texture owner의 round-tip
  no-mixing 경로는 연결됐다. stamp/image tip, smudge/wet neighborhood backend, face index 또는 texel-density
  근거가 없는 custom picker는 격리돼 있으며, 실제 VRM 모델 corpus의 사람 시각 품질은 아직 통과로
  표시하지 않는다. 현재 source audit에서 surface-brush adapter API의 비테스트 caller는 발견되지 않았고,
  production Chromium artifact도 adapter를 직접 호출하는 전용 하니스다. 따라서 기존 Studio UI/R3F
  pointer workflow에 사용자 도구로 배선됐다고 표시하지 않는다.
- **renderer tournament 승격 범위**: Chromium/Apple Metal의 3개 fingerprint bucket에서 Vello GPU,
  vello_cpu, CanvasKit 실제 cost·visual raw JSON은 통과했다. 그러나 장치·장면 범위가 제한되고 shadow
  soak가 없어 product-wide promotion은 하지 않는다. 분리 GPU pass와 provider 귀속 native CPU/GPU
  peak는 미노출 `null`이며, 기존 검증 provider/fallback과 remote kill/quarantine을 유지한다.
- **Vello Hub Classic 승격 범위**: 현재 전환은 해당 SceneIR만 대상으로 하는 in-memory candidate다.
  `persistentWinnerStorage=false`, `productWidePromoted=false`이며 24h/shadow soak와 PromotionRegistry
  증거 없이 제품 전체 승격으로 확대하지 않는다.
- **`/studio` browser QA 범위**: desktop/390px/320px UI QA와 네 production-preview verifier는
  통과했지만, artifact는 working tree가 dirty인 detached snapshot과 Playwright context의 guest API
  격리를 명시한다. 인증된 API/DB E2E나 최종 병합 `main` build 검증으로 확대하지 않는다.
- **BG3D 동시 authority Worker**: 같은 SAH-pool을 두 product Worker가 직접 소유하는 구성은
  Chromium에서 `NoModificationAllowedError`로 불가능했다. 단일 storage Worker + Web Lock 경계를
  유지하며, 측정한 lock-holder/product-writer 직렬화만 통과로 본다.
- **ruby target-app round-trip**: Photoshop/Photopea open-save, 독립 PDF rasterizer/text extractor,
  실제 라이선스 CJK font corpus와 사람의 세로쓰기 간격 평가는 남아 있다.
- **VRM/BG3D 시각 품질**: 위 브라우저 gate는 repository/CAS 무결성과 복구 증거다. 실제 VRM pose,
  skinning, texture-paint 또는 BG3D 최종 합성의 사람 품질 판정으로 확대 해석하지 않는다.
- **P3/HDR, Windows/Linux, 통합 GPU, 모바일 WebGPU, 실제 target-app round-trip**은 해당 실기기
  없이 통과로 표시하지 않는다.
- **cloud backup/E2EE**는 로컬 외부 복구 패키지와 별도다. 인증·암호화·key recovery·retention을
  구현·운영 검증하기 전에는 cloud backup으로 표시하지 않는다.

상세 승격 조건과 폴백은 `docs/adr/0011-v12-frontier-quarantine-ledger.md`가 유일한 원장이다.

## CSP gate status

- 자동 pressure/visual/determinism/task-flow 게이트: 통과한 범위만 각 raw artifact에 고정했다.
- 이번 Chromium production 하니스의 autosave, custom-font, tiledoc, VRM asset/surface-brush, BG3D
  경로와 별도 `/studio` UI QA는 각각 자기 하니스에서 CSP violation 0을 기록했다. `/studio` QA의 0건은
  guest API를 격리한 dirty detached-build 결과다. 어느 결과도 외부 CSP 제품과의 기능·품질 parity
  판정은 아니다.
- renderer tournament 하니스는 이들과 별개로 `script-src: eval` event 76건을 기록했다. artifact의
  `status=quarantined`, `cleanClaimed=false`, `cspNonInferiority=not-measured`를 유지하며, 다른 하니스의
  CSP 0건으로 이 격리를 상쇄하지 않는다.
- CSP 실사용 비열위 게이트: **차단 — 사람 운영 블라인드 랩 필요**.
- 따라서 자동 증거를 통과한 개별 lane만 후보 증거로 취급하며, 전체 release 승인이나 “CSP보다
  우수함” 또는 “CSP 동률 이상”을 최종 사실로 선언하지 않는다.

## Next

현재 release blocker는 (1) 유효한 24h soak raw artifact, (2) 외부 최신 CSP와 동일 물리 태블릿을
사용한 사람 운영 blind lab, (3) 모든 변경을 병합한 최종 `main` HEAD의 전체 검증이다. 앞의 두 외부
게이트는 이 보고서에서 완료 처리하지 않으며, 세 번째 검증 전까지 현재 working-tree 증거도 release
승인으로 승격하지 않는다.

### 최종 병합 `main` HEAD 검증 체크리스트 — 아직 실행하지 않음

- [ ] Hokusai automatic route 0·explicit experimental only 정책과 opaque WASM integrity를 포함해
  `pnpm run verify:studio-engine`, `pnpm run audit:licenses`를 실행하고 notice/inventory drift 0을 확인한다.
- [ ] `pnpm run validate:architecture`, root typecheck/lint/test/build와 `pnpm run verify:push`를
  같은 최종 `main` HEAD에서 통과시킨다.
- [ ] `pnpm run verify:studio-gpu-filters`, `pnpm run verify:studio-living-ink-execution`,
  `pnpm run verify:studio-brushes`, `pnpm run verify:studio-autosave-opfs`를 재실행하고 새 raw artifact가
  기존 gate를 충족하는지 확인한다.
- [ ] `/studio` production build를 desktop/390px/320px에서 열어 console/page/network/CSP 오류,
  retained filter settle, Living Ink pointer-up, autosave degraded UI, VRM calibration hydration을 점검한다.
- [ ] renderer tournament, CRDT recovery, VRM calibration, surface-brush focused tests와 이 보고서의
  artifact path 존재·JSON parse·Markdown diff 검사를 최종 HEAD에서 다시 수행한다.

### 아직 남은 외부·장시간 게이트

1. `SOAK_MINUTES=1440 pnpm run soak:studio-engine`을 중단 없이 완주하고 raw result·오류 0·메모리
   수렴을 기록하기 전에는 24h gate를 닫지 않는다.
2. 실제 최신 CSP + 동일 물리 태블릿에서 사전등록 blind lab을 운영한다.
3. Windows D3D12/Linux Vulkan/통합 GPU/mobile WebGPU와 P3/HDR 실기기 매트릭스를 실행한다.
4. 사용자 글꼴은 배포/embedding 권리가 확인된 corpus로 재실행하고 Safari/Firefox/quota gate를
   추가한다.
5. autosave의 Chromium process crash·OS power loss·quota·다중 탭 장기 contention과 BG3D 단일
   storage Worker 운영 경계를 검증한다.
6. 실제 VRM 모델 corpus로 surface-brush의 raycast→atlas 지연·메모리와 사람 시각 품질을 측정하고,
   stamp/image·smudge/wet backend는 동일 품질·rollback 게이트를 통과한 경우에만 별도 승격한다.
7. PDF/PSD ruby를 Photoshop/Photopea와 독립 PDF 도구에서 round-trip하고 사람 세로쓰기 검수를
   수행한다.
8. 배포 식별자와 파괴 플래그가 승인된 운영 cutover에서만 V12 destructive reset을 실행한다.
