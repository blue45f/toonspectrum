# 현재 Studio 경계 감사 (V12)

- 감사 일자: 2026-08-11
- 감사 대상: `/Users/hjunkim/WebstormProjects/toonspectrum` 현재 루트 트리
- 감사 범위: 현재 소스, 설정, 테스트, 커밋된 benchmark JSON, retained Git metadata 유실 대조,
  production build와 전체 `verify:push`의 경계 사실
- 제외 범위: 24시간 실행, 외부 Clip Studio Paint 블라인드 랩, 실제 전원 차단·브라우저
  프로세스 crash·quota 고갈·실기기 매트릭스

이 문서는 과거 V11.1 linked worktree 스냅샷을 대체한다. 현재 상태는 “신엔진이 앱과
미배선”도 “V12가 전체 Studio를 이미 대체”도 아니다. V12 계층은 기존 `/studio`에 실제로
배선됐지만, 제품 권위는 기능별 island와 provider gate로 제한된다.

## 1. 현재 경계 요약

| 경계 | 현재 판정 | 직접 근거 | 확대 해석 금지 |
| --- | --- | --- | --- |
| 앱/URL | **기존 `/studio`에서 in-place** | [`index.html`](../../index.html) → [`src/app/main.tsx`](../../src/app/main.tsx) → [`src/app/routes/AppRouter.tsx`](../../src/app/routes/AppRouter.tsx) → [`src/domains/creator/StudioPage.tsx`](../../src/domains/creator/StudioPage.tsx) | 별도 `/studio-v11`, `/studio-v12`, `/studio/v12` 제품 route가 있다는 뜻이 아니다. |
| 문서·입력 권위 | **Konva Stage 유지** | [`StudioCanvasViewport.tsx`](../../src/domains/creator/StudioCanvasViewport.tsx)의 `<Stage>`와 pointer handlers | Vello가 전체 문서, pointer, brush pixel 또는 whole-canvas 권위를 얻었다고 말할 수 없다. |
| Vello 제품 배선 | **selection-overlay island에 제한해 기본 활성** | [`studio-vello-hub-capability.ts`](../../src/domains/creator/studio-vello-hub-capability.ts), [`studio-vello-hub-surface.tsx`](../../src/domains/creator/studio-vello-hub-surface.tsx), [`studio-vello-hub.ts`](../../src/domains/creator/studio-vello-hub.ts) | scene-local candidate이며 `productWidePromoted=false`, `persistentWinnerStorage=false`다. |
| 렌더/브러시 tournament | **실제 제품 호출부에 배선** | [`StudioPage.tsx`](../../src/domains/creator/StudioPage.tsx)의 pointer-down admission, [`StudioKonvaImageNode.tsx`](../../src/domains/creator/StudioKonvaImageNode.tsx)의 filter-island plan | winner cache가 모든 장면·장치의 기본 renderer 승격을 의미하지 않는다. |
| VRM 표면 브러시 | **round-tip/no-mixing 제품 경로에 배선** | [`StudioVrmPoser.tsx`](../../src/domains/creator/StudioVrmPoser.tsx), [`studio-vrm-surface-paint-tool.ts`](../../src/domains/creator/studio-vrm-surface-paint-tool.ts), [`studio-vrm-surface-brush-provider.ts`](../../src/domains/creator/studio-vrm-surface-brush-provider.ts) | stamp/image/smudge/wet와 사람 손맛·다중 실기기 품질까지 통과했다는 뜻이 아니다. |
| Velato | **엔진 패키지·wasm·하니스 구현, 제품 호출부 없음** | [`crates/studio-engine-vello/Cargo.toml`](../../crates/studio-engine-vello/Cargo.toml), [`packages/studio-engine-vello/src/lottie.ts`](../../packages/studio-engine-vello/src/lottie.ts) | 현재 Studio Lottie UI가 Velato를 사용한다고 말할 수 없다. |
| WESL | **컴파일러·corpus 구현, 제품 호출부 없음** | [`packages/studio-engine-registry/src/wesl-compile.ts`](../../packages/studio-engine-registry/src/wesl-compile.ts) | 결합 승격 raw gate가 `passed=false`이므로 제품 기본 shader platform이라고 말할 수 없다. |
| 로컬 데이터 | **SQLite WASM + OPFS SAH-pool이 제품 기본 권위** | [`studio-local-database.ts`](../../src/domains/creator/studio-local-database.ts), [`studio-local-database.worker.ts`](../../src/domains/creator/studio-local-database.worker.ts) | OPFS는 cloud backup이 아니며 실제 power-loss/fsync 보장을 이 소스만으로 주장할 수 없다. |
| browser KV | **localStorage/IndexedDB 호환 시임이 남음** | [`studio-browser-kv-authority-boundary.test.ts`](../../src/domains/creator/studio-browser-kv-authority-boundary.test.ts)의 exact allowance 원장 | “localStorage가 소스에서 완전히 제거됨”은 거짓이다. 제품 창작 데이터의 기본 권위가 아니라는 것이 현재 계약이다. |
| 외부 gate | **미통과·격리 유지** | 8시간 soak raw artifact, CSP 블라인드 랩 CLI, CRDT fault artifact (§6) | 기술 CSP 검사, 8시간 soak, Worker terminate를 외부 CSP/24h/물리 fault 통과로 대체할 수 없다. |

## 2. `/studio` in-place 진입과 표면 소유권

현재 부트스트랩과 route는 다음 하나의 제품 경로다.

```text
index.html
  -> src/app/main.tsx
  -> src/app/AppShell.tsx
  -> src/app/routes/AppRouter.tsx
  -> /studio
  -> src/domains/creator/StudioPage.tsx
  -> src/domains/creator/StudioCanvasViewport.tsx
       |- Konva Stage: 문서 표시와 pointer 입력 권위
       |- Vello Hub: 선택 오버레이 island의 조건부 단독 권위
       `- Pixi: Vello disabled/fallback 때 같은 island의 명시적 fallback
```

- [`AppRouter.tsx`](../../src/app/routes/AppRouter.tsx)는 `StudioPage`를 lazy import하고 정확히
  `path="/studio"`에 마운트한다. 동반 도구는 `path="/studio/tools-companion"`이며 별도 V12 앱이
  아니다.
- 같은 router는 [`StudioCrossOriginIsolationGate.tsx`](../../src/app/StudioCrossOriginIsolationGate.tsx)로
  Studio 문서 전환을 감싼다. [`vercel.json`](../../vercel.json)은 `/studio`와 `/studio/(.*)`에
  COOP `same-origin`, COEP `credentialless`를 설정하고, 전체 응답에 HTTP
  `Content-Security-Policy`를 설정한다.
- [`StudioCanvasViewport.tsx`](../../src/domains/creator/StudioCanvasViewport.tsx)는 현재도 Konva
  `<Stage>`와 `onPointerDown`/`onPointerMove`/`onPointerUp` 경로를 마운트한다. Vello canvas는
  [`studio-vello-hub-canvas-target.ts`](../../src/domains/creator/studio-vello-hub-canvas-target.ts)에서
  `pointerEvents = "none"`이다.
- 따라서 “in-place 교체”는 URL·앱을 새로 만들지 않고 기존 호출부 내부에서 기능별 provider를
  교체한다는 뜻이다. whole-canvas 단일 엔진 컷오버 완료를 뜻하지 않는다.

## 3. 현재 엔진 배선

과거의 “`packages/studio-*` 소비자는 tests/benchmarks뿐이고 `src/` import는 0건”이라는 문장은
더 이상 맞지 않는다.

### 3.1 renderer/brush tournament

- [`StudioPage.tsx`](../../src/domains/creator/StudioPage.tsx)는 mount 뒤
  `bootStudioTournamentPersistence()`를 호출한다. 구현은
  [`studio-tournament-persistence-bootstrap.ts`](../../src/domains/creator/studio-tournament-persistence-bootstrap.ts)에서
  SQLite adapter를 dynamic import하고, hydration이 끝나기 전에는 원래 lane 순서를 유지한다.
- 같은 `StudioPage.tsx`의 실제 pointer-down 경로는
  [`studio-stroke-route-tournament.ts`](../../src/domains/creator/studio-stroke-route-tournament.ts)의
  `resolveStudioStrokeRoutePointerDownGate()`로 living-ink, Hokusai, stamp, GPU, live-ink,
  wet-fallback, dynamic, Konva admission을 결정한다. Konva는 fail-visible 종단 fallback으로 남는다.
- [`StudioKonvaImageNode.tsx`](../../src/domains/creator/StudioKonvaImageNode.tsx)는
  [`studio-filter-island-plan.ts`](../../src/domains/creator/studio-filter-island-plan.ts)의
  `planStudioFilterIslandLanes()`를 실제 이미지 필터 경로에서 호출한다.
- tournament 메커니즘은
  [`@toonspectrum/studio-engine-registry`](../../packages/studio-engine-registry/src/index.ts)에서 오고,
  제품 브리지는 [`studio-renderer-tournament-runtime.ts`](../../src/domains/creator/studio-renderer-tournament-runtime.ts)에
  있다. 이 배선은 존재하지만 장면/장치 전체의 영구 승격과는 별개다.

### 3.2 Vello GPU/CPU 제품 island

- [`studio-vello-hub-capability.ts`](../../src/domains/creator/studio-vello-hub-capability.ts)는
  `studio-vello-hub-selection-overlay-v1`을 기본 활성화한다. 범위는
  `accelerated-selection-overlay` 하나이며 document/input/brush-pixel/canonical-document 권위는
  모두 `false`다.
- [`StudioCanvasViewport.tsx`](../../src/domains/creator/StudioCanvasViewport.tsx)는
  `StudioVelloHubSurface`를 기존 `/studio` canvas host에 직접 마운트한다. Vello가 명시적으로
  disabled되거나 `fallback` 상태일 때만 같은 selection island의 Pixi host를 활성화한다.
- [`studio-vello-hub.ts`](../../src/domains/creator/studio-vello-hub.ts)의 Classic backend는
  [`studio-gpu-fabric.ts`](../../src/domains/creator/studio-gpu-fabric.ts)의 공유 `GPUDevice` lease를
  채택하고 Vello GPU texture를 만든다. CPU backend는 `vello_cpu` pixels를 품질 기준/fallback으로
  사용한다.
- [`studio-vello-hub-canvas-target.ts`](../../src/domains/creator/studio-vello-hub-canvas-target.ts)는
  GPU frame을 `GPUCanvasContext.getCurrentTexture()`로 texture-to-texture copy해 표시한다. CPU frame만
  `putImageData()`를 사용하며, GPU hot path를 CPU readback으로 가장하지 않는다.
- hub의 승격은 scene-local memory evidence, visual shadow, 12% hysteresis, pen-up 전환 금지에 묶인다.
  Hybrid/Sparse GPU는 [`studio-vello-hub-capability.ts`](../../src/domains/creator/studio-vello-hub-capability.ts)에서
  `unavailable-upstream-api`로 남아 있다. 현재 제품 GPU backend는 Vello 0.9 Classic이다.

### 3.3 Velato와 WESL: 구현됨, 제품 기본 아님

| lane | 현재 구현 | 제품 caller 확인 | 현재 판정 |
| --- | --- | --- | --- |
| Velato 0.11 Lottie | Rust `lottie` feature가 Lottie JSON을 Vello scene으로 낮추고, TS가 `renderLottieToPixelsGpu()`를 export한다. 커밋된 [`velato-lottie-browser.json`](../../tests/benchmarks/results/velato-lottie-browser.json)은 package probe 스냅샷이다. | 비테스트 `src/`·`apps/`에서 `renderLottieToPixelsGpu` 호출 없음. export와 package 내부 구현만 확인됨. | 엔진 후보/하니스. Studio Lottie 제품 표면 배선으로 승격되지 않음. |
| WESL 0.7.28 | [`wesl-compile.ts`](../../packages/studio-engine-registry/src/wesl-compile.ts)가 `*.wesl?raw`, `link()`, `@if`, virtual schedule module로 WGSL variant를 만든다. [`wesl-variants-browser.json`](../../tests/benchmarks/results/wesl-variants-browser.json)은 35개 variant 스냅샷을 가진다. | 비테스트 `src/`에서 `compileWeslVariant()` 호출 없음. | compiler candidate. [`wgsl-variants-pipeline.json`](../../tests/benchmarks/results/wgsl-variants-pipeline.json)의 결합 gate는 `passed=false`; 정적 WGSL/기존 생성기 기본을 유지. |

커밋된 JSON은 과거 실행 영수증이다. 이번 문서 감사에서는 Velato/WESL 실제 브라우저 probe를
재실행하지 않았으므로 그 artifact보다 넓은 통과를 주장하지 않는다.

### 3.4 VRM 표면 브러시 제품 경로

- [`StudioVrmPoser.tsx`](../../src/domains/creator/StudioVrmPoser.tsx)의 실제 R3F pointer workflow가
  down/move/up, `Intersection.faceIndex`, pressure/tilt와 analytic camera scale을
  [`studio-vrm-surface-paint-tool.ts`](../../src/domains/creator/studio-vrm-surface-paint-tool.ts)의
  bounded transaction으로 전달한다.
- transaction은 최대 2,048 input samples와 50,000 projected operations로 제한되고, 기존
  `BrushProgramIR`/`StrokeIR`→surface adapter→`StudioVrmTexturePaintRuntime` 경계에서 atlas를
  정확히 한 번 원자 커밋한다. 별도 브러시 엔진이나 문서 권위를 만들지 않는다.
- pointercancel/leave/lost capture/window blur/device loss/unmount는 discard 또는 rollback한다.
  face index·texel density 근거가 없으면 seam-safe로 가장하지 않고 compatibility round path로 보낸다.
- 자동 제품 계약 127건은 이 배선·결정적 undo/replay·hot-path readback 0을 고정한다. 다중 실제
  VRM corpus의 사람 시각 품질·손맛, 실 GPU resident memory와 실기기 pressure/tilt는 외부 gate다.

## 4. SQLite/OPFS 제품 권위

제품 로컬 SQL 경계는 다음과 같다.

- package: `@sqlite.org/sqlite-wasm` `3.53.0-build1` — [`package.json`](../../package.json)
- OPFS SAH-pool directory: `toonspectrum-studio-sqlite`
- logical database: `studio-local-v12.db`
- app-lifetime owner: [`studio-local-database-runtime.ts`](../../src/domains/creator/studio-local-database-runtime.ts)
- Dedicated Worker RPC: [`studio-local-database-worker-client.ts`](../../src/domains/creator/studio-local-database-worker-client.ts)
  → [`studio-local-database.worker.ts`](../../src/domains/creator/studio-local-database.worker.ts)
- schema/API: [`studio-local-database.ts`](../../src/domains/creator/studio-local-database.ts)

Worker는 `@sqlite.org/sqlite-wasm`을 동적 import하고 SAH-pool 하나를 소유한다. OPFS/SQLite를 열 수
없으면 core open은 `SqliteUnavailableError`로 명시 실패한다. 각 UI 기능이 허용하는 memory-only
session은 “저장됨”과 다른 상태이며 localStorage를 durable 성공으로 승격하는 우회가 아니다.

현재 shared SQLite runtime을 제품 factory로 사용하는 범위에는 journal/history, renderer tournament,
autosave mirror, brush/filter/palette/marketplace catalog, UI preferences, tutorial progress,
translation memory, production bible, custom font manifest, generic/VRM/BG3D asset manifest,
CRDT outbox/recovery, owner-scoped workspace·Quick Access·draft collaboration identity, Pro Draw,
companion-window layout, Reference Panel, watermark, VRM recent pose/character 등이 포함된다.
workspace의 BroadcastChannel은 snapshot을 전송하지 않고 revision invalidation만 전달하며, 실제
병합은 SQLite 재읽기와 dirty-revision fence를 통과한다. 정확한 호출부는 다음 명령으로 재감사한다.

```sh
rg -n -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' \
  'acquireStudioLocalDatabase|acquireProductStudio|createStudio.*Sqlite|sqlite-opfs' \
  src/domains/creator
```

## 5. 남은 localStorage/IndexedDB 호환 시임

“제품 기본 권위가 SQLite/OPFS다”와 “browser KV 코드가 없다”는 다른 주장이다. 후자는 현재
거짓이다. exact allowlist의 단일 원장은
[`studio-browser-kv-authority-boundary.test.ts`](../../src/domains/creator/studio-browser-kv-authority-boundary.test.ts)다.

| 잔여 시임 | 현재 동작 | 대표 경로 |
| --- | --- | --- |
| autosave 호환 읽기 | OPFS/SQLite 후보를 먼저 조정한다. durable 후보가 없거나 open이 실패할 때 기존 browser-storage JSON을 `compatibility-only` 복구 후보로 표시할 수 있지만 새 autosave를 localStorage에 쓰지 않는다. durable write/clear 뒤에는 구 key를 삭제한다. | [`StudioPage.tsx`](../../src/domains/creator/StudioPage.tsx), [`studio-autosave-opfs-session.ts`](../../src/domains/creator/studio-autosave-opfs-session.ts) |
| 삭제 전용 cleanup | autosave/sidecar, AI recent prompts, VRM pose clipboard, account data-destruction, server revision restore가 구 key를 제거한다. `removeItem`은 새 권위를 만들지 않는다. | [`studio-data-destruction.ts`](../../src/domains/creator/studio-data-destruction.ts), [`studio-server-revision-restore-controller.ts`](../../src/domains/creator/studio-server-revision-restore-controller.ts) |
| 명시적 legacy import/test adapter | brush/filter/production-bible/animatic/BG3D preset/brand/clip/font/marketplace/palette 등의 codec가 주입된 `Storage`를 처리한다. 제품 default는 `discard`; import는 명시 opt-in이어야 한다. | [`studio-brush-library-sqlite-repository.ts`](../../src/domains/creator/studio-brush-library-sqlite-repository.ts), [`studio-filter-library-sqlite-repository.ts`](../../src/domains/creator/studio-filter-library-sqlite-repository.ts), [`studio-production-bible.ts`](../../src/domains/creator/studio-production-bible.ts) |
| UI-only compatibility helper | tutorial progress와 workspace의 주입형 rollback/test codec 등 구 동기 helper는 남아 있지만 제품 UI factory는 SQLite runtime/repository를 사용한다. exact key/write 수는 allowlist가 고정한다. | [`studio-feature-tutorials.ts`](../../src/domains/creator/studio-feature-tutorials.ts), [`studio-tutorial-progress-sqlite.ts`](../../src/domains/creator/studio-tutorial-progress-sqlite.ts), [`studio-workspaces.ts`](../../src/domains/creator/studio-workspaces.ts) |
| legacy IndexedDB | BG3D/asset/checkpoint/CRDT/history/production-bible/VRM 등의 기존 DB adapter가 명시적 import·rollback seam으로 남는다. product factory의 ambient 자동 선택을 허용하지 않는다. | [`studio-browser-kv-authority-boundary.test.ts`](../../src/domains/creator/studio-browser-kv-authority-boundary.test.ts) |
| 탭 범위 민감 상태 | 일부 clipboard/BYOK 설정은 `sessionStorage`를 사용한다. 이는 재시작 durable authority가 아니며 scanner도 별도로 취급한다. | [`studio-ai-client.ts`](../../src/domains/creator/studio-ai-client.ts), [`StudioPage.tsx`](../../src/domains/creator/StudioPage.tsx) |

따라서 삭제 기준은 “`localStorage` 문자열 grep 0건”이 아니다. 새 창작 데이터 write 또는 새
IndexedDB open이 exact allowance 없이 들어오지 못하고, 제품 factory가 legacy adapter를 ambient하게
선택하지 못하는지가 현재 경계다.

## 6. 외부·장시간·물리 fault gate

여기서 외부 **CSP**는 Clip Studio Paint 비교를 뜻한다. HTTP
**Content-Security-Policy** 기술 검증과 혼동하면 안 된다.

| gate | 현재 트리의 증거 | 현재 상태 | 닫기 위한 조건/명령 |
| --- | --- | --- | --- |
| HTTP Content-Security-Policy | [`vercel.json`](../../vercel.json), [`verify-vercel-csp.mjs`](../../scripts/verify-vercel-csp.mjs) | 이번 감사에서 `pnpm run verify:csp` 통과. 이는 정적 배포 정책/inline hash 검사다. | 실제 배포 응답과 각 browser runtime 오류 검사는 별도 release/browser QA 범위다. |
| 외부 Clip Studio Paint 비열위 | [`csp-blind-lab.ts`](../../tests/benchmarks/harness/csp-blind-lab.ts)와 [`csp-blind-lab-cli.ts`](../../tests/benchmarks/harness/csp-blind-lab-cli.ts)는 packet/analyze 도구만 제공한다. 현재 tree에 study/response/analysis JSON은 없다. | **미통과 (`insufficient-data`로 취급)** | 최신 Clip Studio Paint와 ToonStudio를 동일 물리 태블릿·동일 과제로 사전등록하고, 사람 응답을 모아 CLI `analyze`가 `pass`를 내야 한다. |
| 24시간 soak | [`soak.json`](../../tests/benchmarks/results/soak.json), [`soak-leak-regression-2026-08-08.json`](../../tests/benchmarks/results/soak-leak-regression-2026-08-08.json)은 둘 다 `soakMinutes: 480`이다. `1440` artifact는 없다. | **미통과·8시간으로 대체 불가** | `SOAK_MINUTES=1440 pnpm run soak:studio-engine`을 중단 없이 실행하고 raw result, 오류 0, 메모리 수렴을 보존한다. |
| SQLite/OPFS 물리 fault | [`crdt-recovery-sqlite-opfs-browser.json`](../../tests/benchmarks/results/crdt-recovery-sqlite-opfs-browser.json)은 close/reopen·Worker terminate·손상 격리를 기록하지만 `osCrashPowerLoss`와 `quotaExhaustion`은 `null`이고 remaining gate를 열어 둔다. | **부분 기술 증거만 있음; 물리 fault 미통과** | full browser process crash, OS crash/power loss, browser-enforced quota, SAH-pool capacity, 장기 multi-tab contention, cross-platform filesystem matrix를 별도 격리 환경에서 실행한다. |
| 제품 전체 renderer 승격 | [`renderer-tournament-browser.json`](../../tests/benchmarks/results/renderer-tournament-browser.json)은 `boundedCorpusOnly=true`, `productWidePromotion=false`, `cspNonInferiority="not-measured"`를 기록한다. | **bounded candidate만 허용** | 24h shadow/soak, 외부 CSP blind lab, 장치/장면 matrix와 PromotionRegistry 승인이 필요하다. |
| 실기기 GPU/표시 matrix | 현재 자동 artifact는 주로 Chromium/macOS/Apple Metal 범위다. | **미통과 범위 유지** | Windows D3D12, Linux Vulkan, 통합 GPU, mobile WebGPU, P3/HDR와 실제 target-app round-trip을 실행한다. |

외부 CSP packet/analyze 명령은 operator가 사전등록 study와 응답 파일을 준비한 뒤 다음과 같다.

```sh
pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts packet \
  --study study.json --evaluator artist-001 \
  --packet-out packet.json --key-out sealed-key.json

pnpm exec tsx tests/benchmarks/harness/csp-blind-lab-cli.ts analyze \
  --study study.json --keys sealed-keys.json \
  --responses responses.json --out analysis.json
```

위 파일명은 operator 입력 예시이며 현재 repository artifact 경로가 아니다. 이번 감사에서는 두 명령을
실행하지 않았다.

## 7. 이번 감사에서 실행한 검증

### 소스/아티팩트 감사 명령

```sh
cd /Users/hjunkim/WebstormProjects/toonspectrum

rg -n '<script[^>]+type="module"|createRoot|<AppRouter|Route path="/studio"' \
  index.html src/app/main.tsx src/app/AppShell.tsx src/app/routes/AppRouter.tsx

rg -n -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' \
  '@toonspectrum/studio-(brush-platform|command-registry|engine-registry|engine-vello|project-model)' \
  src apps

rg -n -g '*.ts' -g '*.tsx' -g '!*.test.ts' -g '!*.test.tsx' \
  'renderLottieToPixelsGpu|compileWeslVariant' src apps packages

rg -n '"soakMinutes"[[:space:]]*:[[:space:]]*(480|1440)' \
  tests/benchmarks/results -g '*.json'
```

### 집중 계약 테스트

```sh
pnpm exec vitest run \
  src/domains/creator/studio-vello-hub-product-wiring.test.ts \
  src/domains/creator/studio-vello-hub-surface.test.tsx \
  src/domains/creator/studio-browser-kv-authority-boundary.test.ts \
  src/domains/creator/studio-tournament-sqlite-only-boundary.test.ts \
  src/domains/creator/studio-v12-data-discard-policy.test.ts \
  packages/studio-engine-vello/src/__tests__/lottie.test.ts \
  packages/studio-engine-registry/src/__tests__/wesl-compile.test.ts

pnpm run verify:csp
```

결과: Vitest 7 files, 42 tests 통과, browser probe 1건 명시 skip; `verify:csp` 통과. skip된
browser probe나 커밋된 benchmark JSON을 이번 감사에서 새로 실행한 gate로 계산하지 않는다.

### 최종 자동 검증

```sh
pnpm run build
pnpm run verify:push
```

최종 통합 트리에서 architecture/lint/root+API typecheck, 전체 Vitest, Cloudflare realtime test·typecheck·
Wrangler dry-run, production build/CSP/notice, workspace build와 Studio bundle ratchet을 실행했다. 번들은
Studio route **4,661.6/1,492.7KiB(raw/gzip)**, `StudioPage` **1,938.8/572.2KiB**,
app shell 이후 **4,078.9/1,309.3KiB**, route/app-shell 정적 청크 **200/191개**로 기준 갱신 없이
27개 ratchet 전부 통과했다.

### 이번 감사에서 실행하지 않은 외부·장시간 gate

```sh
SOAK_MINUTES=1440 pnpm run soak:studio-engine
```

외부 Clip Studio Paint 블라인드 랩, 실제 전원 차단/브라우저 프로세스 crash, browser-enforced quota,
장기 multi-tab contention, Windows/Linux/mobile GPU matrix는 실행하지 않았다. 따라서 이 문서는 해당
gate를 통과했다고 주장하지 않는다.
