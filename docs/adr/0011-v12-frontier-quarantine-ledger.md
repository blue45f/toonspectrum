# ADR 0011 — V12 프런티어 레인 격리 원장 (Frontier Quarantine Ledger)

## 상태

승인 (2026-08-08)

## 맥락

V12 Codex §10은 Graphite challenger에 대해 "WASM compile failure, device-loss, visual mismatch는
기록하고 Graphite lane만 강등한다. 전체 Studio phase를 막지 않는다"를 규정하고, §15 완료 보고 형식은
`Known failures and quarantined providers`를 필수 항목으로 요구한다. 이 원칙을 Graphite 한 레인이
아니라 모든 프런티어 레인에 일반화하려면, 레인별 현재 상태·실측 근거·승격(해제) 조건·폴백을 한 곳에
기록하는 원장이 필요하다.

관련 선행 ADR: 0009(Google Ink PoC 게이트와 잉킹 폴백 확정), 0010(차세대 엔진 리스크 수용 —
성숙도 라벨이 아니라 품질 게이트·폴백 체인·capability 라우팅으로 채용 판단).

## 결정

1. **레인별 강등, 전체 비블로킹**: 프런티어 레인의 실패(툴체인 부재·빌드 실패·패리티 미달·상류 지연)는
   본 원장에 실측 근거와 함께 기록하고 해당 레인만 강등한다. 어떤 레인의 격리도 다른 레인이나
   Studio phase 진행을 막지 않는다.
2. **상태 어휘**: `활성 검증됨`(패리티/품질 실측 통과) · `빌드 게이트 통과`(컴파일·링크 실증, 구동 게이트
   잔여) · `조사 단계`(존재·버전 실측 완료, 파이프 미구축) · `격리`(전제 조건 부재로 착수 보류) ·
   `차단`(사람 개입 필요) · `진행 중`(장기 런 가동).
3. **승격은 실측으로만**: 상태 전이는 본 원장에 기록된 해제 조건의 실측 통과로만 수행한다.
   추측·상류 로드맵 발표만으로는 전이하지 않는다.
4. **폴백 상시 유지**: 각 레인은 검증된 폴백을 명시하며, 폴백 레인은 프런티어 레인의 성패와 무관하게
   출하 품질을 유지한다.

## 레인 원장 (2026-08-08 실측)

| # | 레인 | 상태 | 실측 근거 | 승격(해제) 조건 | 폴백 |
| --- | --- | --- | --- | --- | --- |
| 1 | Vello GPU 네이티브 (Metal) | **활성 검증됨** | `tests/benchmarks/results/vello-gpu-native.json`: 7장면 중 6장면 GPU↔CPU 퍼지 불일치 0.0000%, `03-curves` 0.0366%(게이트 0.6%의 1/16), p50 1.54~1.62ms/128²(readback 포함). 하니스 `crates/studio-engine-vello/tests/gpu_parity.rs` | (유지 게이트) 대형 장면(30k 스트립·8K) 벤치에서 처리 상한 실측 | vello_cpu 0.2.0 결정적 기준선 / CanvasKit |
| 2 | Vello GPU WebGPU wasm | **활성 검증됨** | 2026-08-08 실브라우저 실측 `tests/benchmarks/results/vello-gpu-browser.json`(Chromium 140.0.7339.186 headless, wgpu `BrowserWebGpu` 어댑터 획득, 하니스 `packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts` `VELLO_GPU_BROWSER_PROBE=1`): 7장면 중 6장면 GPU↔CPU 퍼지 불일치 0.0000%, `03-curves` 0.0366% — 레인 1 네이티브 Metal과 동수치(게이트 0.6%), p50 2.6~2.8ms/128²(readback+JS 경계 포함). 산출물 `crates/studio-engine-vello/pkg-gpu/`(`wasm-pack build --target web --release --out-dir pkg-gpu -- --features gpu`, wasm 4,256,707B≈4.26MB, INTEGRITY.sha256 핀 + `verify:studio-engine` 게이트 편입). 어댑터 `render_scene_gpu_json`/`probe_webgpu`(crates `src/gpu_web.rs`, 인코딩은 네이티브 하니스와 공용 `src/gpu_scene.rs`) + TS `packages/studio-engine-vello/src/gpu-browser.ts`(`vello-gpu-browser` descriptor, WebGPU 부재 시 명시 에러 계약 — `gpu-browser.test.ts` 고정) | (유지 게이트) `toon-vello` fork 2트랙 개설 조건 충족(`docs/engines/vello-baseline.md` §3, 착수는 별도 트랙) + 대형 장면(30k 스트립·8K)·실기기 매트릭스 성능 실측 | vello_cpu wasm(기본 wasm-pack 산출물, gpu 피처 제외) — `loadVelloGpuBrowser`/`probeWebGpu`가 WebGPU 부재를 명시 에러/`supported:false`로 보고해 폴백 라우팅 강제 |
| 3 | Google Ink C++ 벤더링 | **격리** | `which emcc` → `emcc not found`(exit 1), `emcc --version` → `command not found: emcc` (2026-08-08 실행 실측) — emsdk/Bazel 툴체인 부재 | ADR-0009 게이트 유지: 고정 commit 핀 + 자체 emsdk/Bazel 재현 빌드, 1차 범위는 ink-stroke-modeler 단독 PoC(지연·평활 품질 vs 자체 스태빌라이저), Brush Fidelity Lab 코퍼스에서 perfect-freehand 레인 대비 우위 입증 | perfect-freehand 1.2.3 + Kurbo 편집 프록시(`packages/studio-brush-platform` + `fit_polyline_json`) — 결정성·교차 렌더 검증 완료, 출하 중 |
| 4 | Skia Graphite + Dawn WASM | **격리** | Skia 소스 체크아웃·gn/ninja 빌드 파이프라인이 리포·로컬에 부재(§10의 실제 C++ WASM build 시도 전제 미충족) | 핀 SHA 재현 빌드 + V12 매트릭스 게이트: CanvasKit Ganesh/Vello 대비 20% 우위, compile/device-loss/visual gates 통과 | CanvasKit Ganesh (생산 기준선) |
| 5 | WESL / wesl-rs (V12 플래그 `WESL_SHADER_PLATFORM`) | **격리 — 선행 조건 부재(커스텀 셰이더 그래프 미존재)** | (a) `cargo search wesl --limit 5` (2026-08-08 실측): crates.io에 `wesl 0.4.2`·`wesl-cli 0.4.2`·`wesl-c 0.4.0`·`wesl-quote 0.4.2`·`wesl-metadata 0.0.5` 존재 — V12 매트릭스 표기 0.4.1보다 상류가 한 패치 진행. (b) 리포 grep 실측: `wesl` 문자열은 런타임 코드(src·crates·packages·server·tests) 0건 — V12 문서에만 존재. EffectGraphIR·컴파일러 v1(`packages/studio-project-model/src/ir/effect.ts`, `packages/studio-engine-registry/src/effect-compiler.ts`)은 provider 서브체인 그룹핑까지만 하고 커스텀 WGSL variant 생성 표면이 없음(WGSL은 정적 커널 고정). wesl-rs는 Rust측 WGSL 모듈화 툴체인이라 소비할 입력 자체가 아직 없다 | 재개 조건: BrushGraph/EffectGraph가 커스텀 WGSL variant를 생성하기 시작하는 시점. 재개 게이트(V12 매트릭스 Shader 행): 모든 variant compile + Naga validation + 파이프라인 수/jank 감소 실측 | 정적 WGSL — 기존 `src/domains/creator/studio-gpu-filter-kernels.ts` 계열 커널 |
| 6 | Xilem/Masonry CanvasWidgetIsland | **격리** | V12 매트릭스 실측 표기: Xilem 0.4.0 알파, risk "웹/접근성/IME 완성도, breaking changes" — 웹 타깃 실험 단계. 리포 내 PoC 코드 없음 | React+Vello 오버레이 대비 input latency·accessibility(AccessKit)·IME·testability 동률 이상(§11). 이기면 Pen Display Surface Mode 기본값 승격 | React 19 + Vello 오버레이 (현행) |
| 7 | bevy_vello 인터랙티브 스테이지 | **격리** | V12 매트릭스 baseline: bevy_vello 0.13.1은 Vello 0.7 계열 — 본 리포 핀 vello 0.9.0 대비 상류 지연. web compute 제한 risk 병기 | bevy_vello의 Vello 0.9/Hybrid 대응 + WebGPU browser gate 통과 | Three.js (+ Vello 오버레이) |
| 8 | CSP 블라인드 벤치 | **차단 (사람 개입 필요)** | Clip Studio Paint 최신 안정판 소프트웨어 + 실기기(펜 태블릿) 랩이 필요 — 라이선스 소프트웨어·물리 입력 장치·블라인드 평가자는 자동화 불가 | 사람이 운영하는 블라인드 선호/레이턴시 랩 세션 확보(§9·§13의 CSP 게이트). 그 전까지 본 게이트는 보류로 표기하고 다른 레인 진행을 막지 않음(§10 원칙) | 게이트 보류 상태 유지 — 자동화 가능한 대체 증거(패리티·pressure-fidelity 테스트)로 회귀만 방어 |
| 9 | 8h/24h soak | **1차 실패 → 결함 수정 → 재기동** | 1차 8h 런(2026-08-08 KST 00:31 기동)이 22분/32,735 cycles 만에 **실결함을 색출하고 중단**: RSS 223.7→1,851.8MB 선형 증가 후 cycle 32,735에서 CanvasKit 128×128 CPU 서피스 할당 실패 11연속(`tests/benchmarks/results/soak-leak-regression-2026-08-08.json` 보존). 원인 실측: canvaskit-wasm `MakeSurface`는 픽셀 버퍼를 JS측 `_malloc`으로 잡고(`surface.Te`) `delete()`는 이를 해제하지 않음 — `dispose()`만 `_free(Te)` 수행(canvaskit.js 소스 확인). 렌더당 정확히 65,536B(=128×128×4) 누수로 관측 기울기와 일치. 수정: 어댑터 `renderSceneToPixels`/`renderSceneToPng`와 quality-lab 하니스를 `dispose()`로 전환 + 힙 크기 무관 판별형 회귀 게이트(`render-memory.test.ts`, 동적 루프로 누수 시 힙 성장 강제) — 뮤테이션 체크로 `delete()` 복원 시 2테스트 실패 확인 | 수정판 8h 런 errors 0 + RSS 추이 판정 통과 → 24h 런 착수(§13 Reliability) | 스모크 soak(분 단위)+누수 회귀 테스트로 방어 유지 |

## 결과

- 프런티어 실패가 은폐되지 않고 레인 단위로 기록·강등되며, 전체 phase 진행이 유지된다(§10/§15 충족).
- 완료 보고의 `Known failures and quarantined providers` 항목은 본 원장을 인용하는 것으로 표준화된다.
- 폴백 레인(vello_cpu·CanvasKit·perfect-freehand+Kurbo·정적 WGSL·React 19·Three.js)이 명시적으로
  고정되어, 프런티어 레인의 성패가 출하 품질을 흔들지 않는다.

## 재검토 조건

- 레인 2: 실브라우저 WebGPU 구동 패리티 실측이 나올 때(통과 → fork 트랙 개설, 실패 → 원인과 함께 강등 기록).
- 레인 3: emsdk/Bazel 재현 빌드가 구축되거나 상류가 공식 WASM/웹 배포를 제공할 때(ADR-0009 재검토 조건과 동일).
- 레인 5: BrushGraph/EffectGraph가 커스텀 WGSL variant를 생성하기 시작할 때(재개), 또는 wesl-rs 상류 버전 변동 시(핀 재조사).
- 레인 7: bevy_vello가 Vello 0.9+ 대응을 릴리스할 때.
- 레인 9: 8h soak 완료 시(`soak.json` 갱신 확인 후 본 원장 상태 갱신).
- 공통: 각 레인의 게이트 실측 결과가 나올 때마다 본 원장을 갱신하며, 상태 전이는 §결정 3에 따른다.
