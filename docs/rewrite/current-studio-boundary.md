# 기존 Studio 경계 감사 (V11.1 §12.2)

- 감사 일자: 2026-08-07
- 감사 대상: `claude/toonstudio-v11-codex-master-23fdef` 워크트리, HEAD `5ad23665c3423e2957c63f6080ae9fa83ca7b0b1`
  (근거: `/Users/hjunkim/WebstormProjects/toonspectrum/.git/worktrees/toonstudio-v11-codex-master-23fdef/HEAD`)
- 방법: 전부 실파일 열람·grep/find 실측. 추측값 없음. 모든 수치는 감사 시점 스냅샷이며,
  같은 워크트리에서 병렬 세션이 활동 중이라 일부 값(패키지명·apps 목록)은 감사 도중
  변한 것을 직접 관측했다 — 해당 항목은 본문에 명시.

## 1. 경계 값 확정표 (10개)

| 경계 | 확정 값 | 근거 (경로:라인) |
| --- | --- | --- |
| REPO_ROOT | `/Users/hjunkim/WebstormProjects/toonspectrum/.claude/worktrees/toonstudio-v11-codex-master-23fdef` (linked worktree), origin `https://github.com/blue45f/toonspectrum.git` | `.git` 파일 → `gitdir: /Users/hjunkim/WebstormProjects/toonspectrum/.git/worktrees/toonstudio-v11-codex-master-23fdef`; origin은 `/Users/hjunkim/WebstormProjects/toonspectrum/.git/config:13` |
| STUDIO_APP_ROOT | `src/domains/creator` — .ts/.tsx **3,593개**(그중 테스트 1,747개), **총 1,470,842 LOC**; 최대 파일 `StudioPage.tsx` 42,111줄 | find/wc 실측; `src/domains/creator/StudioPage.tsx` wc -l |
| STUDIO_ROUTE_ENTRY | `src/app/routes/AppRouter.tsx:307` `<Route path="/studio" element={<StudioPage />} />` (동반 라우트 `/studio/tools-companion`:308) | 부트스트랩 체인: `index.html:115` `<script type="module" src="/src/app/main.tsx">` → `src/app/main.tsx:33` createRoot → `src/app/AppShell.tsx:5,139` `<AppRouter />` → `AppRouter.tsx:178-186` lazy `import("@/src/domains/creator/StudioPage")` |
| STUDIO_BUILD_TARGET | Vite → `dist/` 단일 SPA. manifest 강제(`vite.config.ts:236`), manualChunks(`:245`)로 `studio-konva-runtime`(:305-307)·`studio-bg3d-babylon-runtime`(:253)·`studio-workspaces`(:262)·`studio-selection-tools`(:272)·`studio-tool-hints`(:281)·`studio-core-micro-contracts`(:294)·`react-runtime`(:303)·lucide 2종(:309-312) 분리. 엔트리 프리로드 제외(`:15-22`) | 예산 게이트 `scripts/check-studio-bundle.mjs` — entry 정의 `:7` (`src/domains/creator/StudioPage.tsx`), budgets 블록 `:22`(값 :99-110): studio raw 3,060,000/gzip 1,000,000, studioEntry 1,284,000/389,000, studioIncremental 2,556,000/840,000/chunks 158, app 510,000/170,000, bg3d 계열 별도 6종 |
| STUDIO_DEPLOY_TARGET | **Vercel Git Integration이 실제 서빙 주체**. `render.yaml`은 Socket.IO 협업 전용 preview 호스트, `deploy/cloudflare-realtime`은 realtime Worker | `.github/workflows/deploy-vercel.yml:1-6` "Production pushes are deployed by Vercel Git Integration … manual emergency fallback"(workflow_dispatch 전용); `vercel.json:7` outputDirectory=dist, `:36` SPA rewrite → /index.html, `:57-70` `/studio`·`/studio/(.*)`에 COOP same-origin + COEP credentialless; `render.yaml:1-13` `toonspectrum-studio-live`(free, CRDT/잠금 Socket.IO 전용, `API_RUNTIME_ROLE=studio-live`) |
| AUTH_SESSION_BOUNDARY | Google OAuth + 이메일 로그인 + 세션쿠키 `toonspectrum-auth-session`. **토스 appLogin/mTLS 코드는 이 레포에 부재**(전 소스 grep 0건 — 토스 미니앱은 별도 저장소) | `apps/api/src/modules/auth/auth.controller.ts:109` @Controller("auth"), `:149` session, `:170/:197` oauth start/callback, `:238` google/id-token, `:360/:407/:446` signup/login/logout; 쿠키명 `apps/api/src/session-cookie.ts:5`; `apps/api/src/session-middleware.ts`; 서버 공용 `lib/server/session.ts`·`lib/server/oauth.ts`; 프론트 `src/domains/account/AuthCallbackPage.tsx`; Render와 `AUTH_SESSION_SECRET`만 공유(`render.yaml` envVars 말미) |
| SHARED_UI_BOUNDARY | `packages/core`(@toonspectrum/core, src 38파일 — creator 직접 import는 1파일, src 전체 5파일), 루트 `components/`(78항목), 디자인 토큰 `src/styles/globals.css` | creator의 components 소비 실측 상위: `@/components/ui/button-utils`(65회)·`section`(5)·`use-media-query`(4)·`cover-image`(4)·`use-resizable`(3)·`ui/button`(3); 토큰: `src/styles/globals.css` Tailwind v4 `@theme` OKLCH 커스텀 프로퍼티 150개 + studio 전용 셀렉터(`html[data-studio-mobile-immersive]` 등 :5-20) |
| API_BOUNDARY | `apps/api` NestJS 모듈 13개: admin·auth·catalog·community·creator·creator-marketplace·feedback·fortune·health·legal·me·studio-ai·studio-realtime-ticket | Studio가 호출하는 그룹 — ① `/api/creator/*`: `apps/api/src/modules/creator/creator.controller.ts:62-439+`(works :68-112, **revisions :122-154**(목록/단건/comparison/restore), team/document :169-280, assets :322-408, series :418-439, draft-collaboration :86-98) ② CRDT/협업: `studio-crdt-*.repository.ts`·`studio-crdt-root-schema.ts`·`studio-live.gateway.ts`(유일한 @WebSocketGateway)·`apps/api/src/realtime/studio-postgres-io.adapter.ts` ③ `/api/studio-realtime`(티켓, `modules/studio-realtime-ticket` ↔ 프론트 `src/domains/creator/studio-live-auth-ticket-client.ts`) ④ `/api/studio-ai`. 프론트 실측 호출 빈도: /api/creator 7, /api/studio-realtime 5, /api/studio-ai 2 |
| CURRENT_STORAGE_BOUNDARY | OPFS 루트 3개 + IndexedDB 7개 + localStorage 다수(접근 파일 116개) | §1.1 참조 |
| CURRENT_WORKER_BOUNDARY | 전용 Worker **52개**(`src/domains/creator/*.worker.ts`, 합계 7,062 LOC) + worker-client 래퍼 페어 | §1.2 참조. Worker 자산 COOP/COEP 게이팅: `src/app/studio-cross-origin-isolation.ts:128` (`assets/studio-*.worker-*.js` 패턴) + `vercel.json` `/assets/(.*)` COEP credentialless 헤더 |

### 1.1 CURRENT_STORAGE_BOUNDARY 상세

OPFS 루트 (3개, 이름공간 상호 분리):

- `toonspectrum-studio-autosave-v3` — `src/domains/creator/studio-autosave-opfs-session.ts:29`
- `toonspectrum-studio-engine-storage-v2` — `src/domains/creator/studio-engine-tile-storage-opfs-v2-backend.ts:22`
- `toonspectrum-hybrid-dcc-v1` — `src/domains/creator/StudioPage.tsx:4933` (rootName 인자)
- 공용 접근 계층: `studio-opfs-filesystem.ts`, `studio-opfs-sync-access-store.ts`, `studio-opfs-recovery-journal.ts`

IndexedDB (DB명 실측):

- `toonspectrum-studio-crdt-outbox` — `studio-crdt-outbox.ts:6`
- `toonspectrum-studio-crdt-recovery-vault` — `studio-crdt-recovery-vault.ts:7` (동일 DB를 `studio-pages-history-durable-runtime.ts:34`도 사용)
- `toonspectrum-studio-checkpoints` — `studio-checkpoints.ts:7`
- `toonspectrum-studio-asset-library` — `studio-asset-library.ts:8`
- `toonspectrum-studio-vrm-library` — `vrm-library.ts:1`
- `toonspectrum-studio-bg3d-model-library` — `bg3d-model-library.ts:29`
- `toonspectrum-studio-production-bible` — `studio-production-bible.ts:219`

localStorage 주요 키 (전부 `src/domains/creator` 실측):

- `toonspectrum:studio:workspaces` — `studio-workspaces.ts:57` (레거시 `studio:leftW`/`studio:rightW` :70-71)
- `toonspectrum-studio-app-settings:v1` — `studio-app-settings.ts:22`
- `toonspectrum-studio-brush-slots:v2`(현행)/`:v1`(레거시) — `studio-brush-slots.ts:21-22`
- `toonspectrum-studio-ui-density:v1` — `studio-ui-density.ts:16`
- `toonspectrum-studio-quick-actions:v1` — `studio-quick-actions.ts:69`
- `toonspectrum-studio-effect-favorites:v1` — `studio-effect-favorites.ts:30`
- `toonspectrum-studio-mannequin-state:v1` — `studio-mannequin-poses.ts:510`
- `toonspectrum:studio:page-preview-size:v1` — `StudioPageListPane.tsx:51`
- `studio_tracking_calibration` — `studio-vrm-tracking-calibration.ts:33`
- `studio_reference_panel_v1` — `studio-reference-panel.ts:21`
- `studio_unsplash_access_key` — `studio-stock-image-client.ts:69`
- 직접 리터럴: `studio_custom_poses`, `studio_pose_clipboard`, `studio_vrm_full_clip`, `studio_vrm_full_states`, `studio_webcam_consent`

### 1.2 CURRENT_WORKER_BOUNDARY 상세 (52개 전수, 기능군별)

- 엔진/저장 코어: `studio-engine.worker.ts`(+`studio-engine-worker-client.ts`), `studio-storage.worker.ts`, `studio-offscreen-raster.worker.ts`, `studio-crdt-raster.worker.ts`, `studio-crc32.worker.ts`
- 브러시/자연매체: `studio-hokusai-live-brush.worker.ts`, `studio-hokusai-natural-media.worker.ts`(hokusai wasm 소비), `studio-procedural-artistic-brush.worker.ts`, `studio-physics-particle-brush-provider.worker.ts`, `studio-fiber-bristle-brush-provider.worker.ts`, `studio-procedural-media-surface-provider.worker.ts`, `studio-multi-light-surface-provider.worker.ts`, `studio-living-ink.worker.ts`
- 필터/리터치: `studio-image-filter.worker.ts`, `studio-liquify.worker.ts`, `studio-smudge.worker.ts`, `studio-heal-clone.worker.ts`, `studio-retouch.worker.ts`, `studio-outline.worker.ts`, `studio-auto-color-hints.worker.ts`
- 선택: `studio-magic-wand.worker.ts`, `studio-color-range.worker.ts`, `studio-advanced-fill.worker.ts`
- 레이어 리프트: `studio-layer-lift-compose/-mask/-artifact.worker.ts` (3종)
- BG3D: `studio-bg3d-geometry/-physics/-obj/-obj-preflight/-glb-validation/-lt-render/-shot-png/-shot-psd/-shot-batch/-shot-contact-sheet.worker.ts` (10종) + `studio-occt.worker.ts`, `studio-opencv-image-provider.worker.ts`, `studio-xatlas-uv-provider.worker.ts`, `studio-weighted-deformation-provider.worker.ts`
- VRM: `studio-vrm-texture-fill/-texture-geometry/-photo-pose.worker.ts` (3종)
- 포맷/입출력: `studio-svg-export.worker.ts`, `studio-hybrid-dcc-glb-export.worker.ts`, `studio-raster-interchange.worker.ts`, `studio-first-party-raster-codec.worker.ts`, `studio-first-party-will-v1-document-codec.worker.ts`, `studio-will-v1-opc.worker.ts`, `studio-abr-import.worker.ts`, `studio-paper-vector-refinement.worker.ts`, `studio-revision-compare.worker.ts`

생성 방식은 `new Worker(new URL(...))` 페어 패턴(예: `studio-engine-worker-client.ts`, `studio-magic-wand-worker-client.ts` 등 클라이언트 파일 30여 개 실측).

## 2. 의존 방향 그래프

```
index.html:115
  └─ src/app/main.tsx:33 (createRoot)
      └─ src/app/App.tsx → src/app/AppShell.tsx:139 <AppRouter/>
          └─ src/app/routes/AppRouter.tsx:178-186 (lazy) · :307 <Route path="/studio">
              └─ src/domains/creator/StudioPage.tsx (42,111줄, 편집 코어 진입점)
                  ├─ [현행 렌더] Konva 스테이지 계열 (react-konva import 76파일)
                  │     └─ vite chunk "studio-konva-runtime" (vite.config.ts:305-307)
                  ├─ [핫패스] 탈React 파이프라인 → studio-engine-* 58파일
                  │     └─ Worker 52개 → OPFS(§1.1 루트 3) / IndexedDB(§1.1)
                  ├─ [협업] studio-live-*/StudioLive* 61파일
                  │     └─ /studio-live WebSocket (vite.config.ts:330 프록시)
                  │         └─ apps/api studio-live.gateway.ts → Postgres pubsub
                  │             (realtime/studio-postgres-io.adapter.ts) / Render / CF Worker
                  └─ [HTTP] /api/creator·/api/studio-realtime·/api/studio-ai (§1 API_BOUNDARY)

[V11 신엔진 계층 — 아직 앱과 미배선]
packages/studio-{brush-platform,command-registry,engine-registry,engine-skia,
                 engine-vello,project-model} + studio-hokusai-wasm + crates/studio-engine-vello
  ← 소비자는 tests/benchmarks/harness/main.ts·tests/visual/cross-renderer-diff.test.ts 뿐
```

방향성 검증 (실측):

- 엔진 계층 → UI 금지: `packages/studio-*/src` 전체에서 `from "react"`·`src/domains` import **0건** (grep 실측).
- 역방향(구 Studio → 신 엔진): `src/`·`apps/`에서 `@toonspectrum/studio-brush-platform` 등 6패키지 import **0건** — V11 핸드오프 전 상태.
- 신 엔진 소비자: `tests/visual/cross-renderer-diff.test.ts:5-15` (project-model·engine-skia·engine-vello), `tests/benchmarks/harness/main.ts:17-25` (brush-platform·project-model·engine-skia).

## 3. 유지/폐기 결정표 (V11.1 §0.4 기준)

| 판정 | 대상 | 근거 경로 |
| --- | --- | --- |
| 유지 | 인증/세션 | `apps/api/src/modules/auth/*`, `apps/api/src/session-cookie.ts:5`, `session-middleware.ts` |
| 유지 | 결제/마켓 | `apps/api/src/modules/creator-marketplace/` |
| 유지 | 배포 파이프라인 | Vercel Git Integration(`deploy-vercel.yml:1-6` fallback 선언), `vercel.json`, `render.yaml`, `deploy/cloudflare-realtime/wrangler.jsonc`, 게이트 `scripts/vercel-production-release-gate.mjs`(`vercel.json:5` ignoreCommand) |
| 유지 | 업로드·CDN | `apps/api/src/modules/creator/studio-asset-upload.guard.ts`, `apps/api/src/infrastructure/supabase-object-storage/`, `vercel.json` `/assets`·`/vrm`·`/audio` 캐시/CORS 헤더 |
| 유지 | `/studio` URL | `src/app/routes/AppRouter.tsx:307`, `vercel.json:57-70` 라우트별 COOP/COEP |
| 유지 | 디자인 토큰 | `src/styles/globals.css` `@theme` OKLCH 150 토큰 |
| 감사 후 재사용 | OPFS 스토리지 브리지 | `studio-engine-tile-storage-bridge.ts`, `studio-engine-tile-storage-opfs-v2-backend.ts`, `studio-opfs-filesystem.ts`, `studio-opfs-sync-access-store.ts` (+ 검증 `scripts/studio-engine-tile-storage-opfs-v2-browser.ts`) |
| 감사 후 재사용 | Worker 인프라 | §1.2 52개 + COOP/COEP 게이팅(`src/app/studio-cross-origin-isolation.ts:128`, `vercel.json` /assets 헤더) — 신엔진 wasm 워커에 그대로 필요 |
| 감사 후 재사용 | CRDT 백엔드 | `apps/api/src/modules/creator/studio-crdt-*.{ts}`(root-schema·repository·checkpoint coordinator), `studio-live.gateway.ts`, `apps/api/src/realtime/*`, `deploy/cloudflare-realtime/`, 클라 `studio-crdt-outbox.ts`·`studio-crdt-recovery-vault.ts` |
| 게이트 미통과 시 교체 | 기존 렌더 루프(Konva 스테이지) | react-konva/konva import 76파일·72,853 LOC (대표: `StudioPage.tsx`, `StudioDraftPreviewLayers.tsx`, `StudioKonvaImageNode.tsx`, `StudioCanvasGuideLayers.tsx`); 전용 chunk `studio-konva-runtime`(`vite.config.ts:305-307`) |
| 게이트 미통과 시 교체 | 구 Undo/저널 | `studio-command-journal.ts`, `studio-pages-history-command-journal(-client).ts`, `studio-opfs-recovery-journal.ts`, `studio-webgpu-live-source-journal.ts`, `studio-checkpoints.ts`, `studio-autosave(-opfs-session).ts` — journal/autosave/checkpoints/history 계열 38파일·18,009 LOC |
| 게이트 미통과 시 교체 | 구 브러시 파이프라인 | brush 명명 계열 239파일·127,592 LOC + hokusai 워커 2종(§1.2) |
| 게이트 미통과 시 교체 | 구 필터 파이프라인 (3경로) | filter 명명 계열 98파일·42,878 LOC — ① CPU/캔버스 canonical 경로 `studio-engine-canonical-filter-plan.ts` ② Worker 경로 `studio-image-filter.worker.ts` ③ WebGPU 경로(패리티 게이트 `scripts/studio-engine-webgpu-filter-parity-browser.ts`, `scripts/studio-gpu-filters-parity-browser.ts`) |
| 게이트 미통과 시 교체 | 구 문서 모델 | `studio-first-party-will-v1-document-codec.worker.ts`·`studio-will-v1-opc.worker.ts`(will-v1 문서 코덱), `toonspectrum.studio-project`/`studio-project-archive` 코덱 식별자군, 서버측 `apps/api/src/modules/creator/studio-crdt-root-schema.ts` — 신 SoT는 `@toonspectrum/studio-project-model`의 Stable IR(`docs/adr/0002-stable-ir-as-source-of-truth.md`) |

주의: `studio-live-*` 61파일(40,918 LOC)은 "교체 대상 오버레이 UI"와 "재사용 대상 CRDT
클라이언트 배선"이 섞여 있다. §0.4 적용 시 CRDT 프로토콜/티켓 클라이언트
(`studio-live-collaboration-protocol.ts`, `studio-live-auth-ticket-client.ts`)는 재사용 축,
캔버스 오버레이(`studio-live-canvas-overlay-model.ts` 등)는 렌더 루프와 함께 교체 축이다.

## 4. 삭제 목록 — 교체 대상 인벤토리 (`src/domains/creator` 실측)

| 그룹 | 파일 수 | LOC | 산정 방식 |
| --- | ---: | ---: | --- |
| Konva 스테이지 계열 | 76 | 72,853 | `konva`/`react-konva` import 파일 grep |
| live 협업 계열 (`studio-live-*`/`StudioLive*`) | 61 | 40,918 | 접두 glob (§3 주의 항목 — 부분 재사용) |
| 라이브 잉크 오버레이 계열 (living-ink/live-ink/wet-ink/DraftPreview) | 58 | (live 계열과 일부 중복) | 명명 grep |
| 구 저널/오토세이브/체크포인트/히스토리 | 38 | 18,009 | journal/autosave/checkpoints/history 명명 grep |
| 구 필터 3경로 | 98 | 42,878 | filter 명명 grep |
| 구 브러시 파이프라인 | 239 | 127,592 | brush 명명 grep |
| 전용 Worker 본체 | 52 | 7,062 | `*.worker.ts` glob |
| WebGPU 실험/런타임 | 88 | — | webgpu 명명 grep |
| CRDT 클라이언트 | 45 | — | crdt 명명 grep (재사용 후보 포함) |
| (모수) creator 도메인 전체 | 3,593 | 1,470,842 | find/wc |

그룹 간 중복이 있으므로 합산은 모수를 넘지 않는 상한 지표로만 사용할 것.

## 5. V11 엔진 계층 현황

패키지 6종 — **감사 도중 리네임 완료를 직접 관측**: 감사 시작 시 package.json name이
`@toonspectrum/{brush-platform,command-registry,provider-catalog,skia-adapter,vello-adapter,project-model}-v11`
이었고, 종료 시점 재확인에서 아래 현재명으로 확정됐다(디렉터리명은 처음부터 동일).

- `packages/studio-brush-platform` → `@toonspectrum/studio-brush-platform` (src 7파일)
- `packages/studio-command-registry` → `@toonspectrum/studio-command-registry` (src 2파일)
- `packages/studio-engine-registry` → `@toonspectrum/studio-engine-registry` (src 7파일)
- `packages/studio-engine-skia` → `@toonspectrum/studio-engine-skia` (src 5파일, `/node` 서브패스로 CanvasKit 로더)
- `packages/studio-engine-vello` → `@toonspectrum/studio-engine-vello` (src 5파일)
- `packages/studio-project-model` → `@toonspectrum/studio-project-model` (src 23파일, sceneIRSchema)
- 부속: `packages/studio-hokusai-wasm` (Rust crate + wasm-pack `pkg/` + `pkg/INTEGRITY.sha256`)

Rust crate: `crates/studio-engine-vello` — `src/{lib,render,scene}.rs`, `tests/render.rs`,
커밋된 wasm 산출물 `pkg/vello_adapter_v11_bg.wasm` + `pkg/INTEGRITY.sha256`
(wasm 산출물 내부 명칭은 아직 `vello_adapter_v11` 구명 유지).

테스트 트리 `tests/` (실측 — `studio-v11` 하위 디렉터리가 아니라 4분할 구조):

- `tests/corpus/vector/` — 시나리오 8항목(`01-solid-shapes` ~ `07-group-opacity` + `golden/`)
- `tests/benchmarks/harness/main.ts` — 엔진 패키지 직접 소비 벤치 하니스(`bench:studio-engine`, package.json:65)
- `tests/fault-injection/journal-faults.test.ts`
- `tests/visual/cross-renderer-diff.test.ts` — Skia(CanvasKit) vs Vello 크로스 렌더러 diff

검증 게이트: `scripts/verify-studio-engine.mjs`(:1-11 — ① wasm INTEGRITY 무결성 ② 전 패키지
typecheck ③ V11 테스트 스코프 실행), `package.json:66` `verify:studio-engine`,
`scripts/studio-hokusai-wasm-release-contract.mjs`. 설계 근거 ADR 8건:
`docs/adr/0001-v11-greenfield-monorepo-placement.md` ~ `0008-license-isolation-policy.md`
(0002 Stable IR SoT, 0003 단일 표면 소유자, 0004 CanvasKit+Vello CPU 베이스라인,
0005 잉킹 단계화, 0006 hokusai 자연매체 우선, 0007 append 저널+two-slot 저장).
후보 조사 문서: `docs/candidates/{engine-portfolio,filters,natural-media,renderer-2d,storage-recovery,stroke-brush,text-layout}`.

## 6. 병렬 앱 부재 증명

- `apps/` 실측: 최종 상태 **`api` 단독**. 감사 초반에는 `apps/benchmark-lab-v11`이 존재했으나
  감사 도중 제거를 관측 — 벤치 하니스는 `tests/benchmarks/harness/`로 정리됐다.
  워크스페이스 글롭은 `pnpm-workspace.yaml:2-4` (`.`, `apps/*`, `packages/*`).
- `/studio-v11` 라우트 부재: `src/` 전체 + `vercel.json`에서 `studio-v11`·`/studio/v11`·
  `studio_v11` grep **0건**. 라우터의 studio 계열 라우트는 `/studio`(:307)와
  `/studio/tools-companion`(:308) 둘뿐이며, 유사명 경로는 몰입형 판정에서 명시 제외된다
  (`src/app/routes/immersive-mobile-route.ts:5-9` — `/studio-guide` 오인 방지).
- 결론: 병렬 스튜디오 앱·병렬 라우트 없음. V11은 "새 앱"이 아니라 기존 `/studio` 뒤의
  엔진 계층 교체로 진행 중이다(ADR 0001·0003과 일치).

## 7. V11.1 §12.4 교체 순서에 대응하는 현재 상태

1. **엔진 독립 검증(선행)** — 이미 성립. packages/crates/tests/게이트가 앱과 완전히 분리돼
   존재하고(§5), UI→엔진·엔진→UI 어느 방향 import도 0건(§2)이라 교체 순서의 전제인
   "앱 무영향 병행 개발"이 현재 상태로 보장된다.
2. **스위치 지점 단일화** — `/studio` 진입은 `AppRouter.tsx:178-186`의 lazy import 경계
   하나뿐이다. §12.4의 단계별 컷오버는 이 한 지점(또는 StudioPage 내부의 렌더 서피스
   소유자 교체)만 건드리면 되고, 배포 표면(vercel.json COOP/COEP·/assets 헤더)은 이미
   wasm/Worker 신엔진이 요구하는 격리 조건을 충족한다.
3. **저장 마이그레이션** — OPFS 루트 3개가 버전 접미(v3/v2/v1)로 이름공간 분리돼 있어
   신 저장 계층(ADR 0007 append 저널+two-slot)을 새 루트로 병행 기동한 뒤 구 루트를
   읽기-이관-폐기하는 순서가 가능하다. IndexedDB의 CRDT outbox/recovery-vault는 CRDT
   백엔드 재사용 축이므로 교체 순서상 마지막까지 유지된다.
4. **Worker/CRDT 재사용 축** — Worker 격리 인프라와 서버 CRDT 스키마는 클라이언트 엔진
   교체와 독립이라 §12.4 어느 단계에서도 끊기지 않는다. 단 `studio-live-*`의 오버레이
   UI는 렌더 루프 교체 단계에 묶인다(§3 주의).
5. **게이트 갱신 부채** — `check-studio-bundle.mjs` 예산은 구 청크 명(`studio-konva-runtime`
   등) 기준이므로, 신 엔진 청크가 라우트 그래프에 들어오는 단계에서 budgets(:22)와
   manualChunks(vite.config.ts:245)를 같은 커밋에서 갱신해야 CI(`package.json:45`)가
   교체를 오검출하지 않는다.
