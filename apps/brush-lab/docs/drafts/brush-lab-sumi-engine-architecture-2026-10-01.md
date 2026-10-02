# brush-lab Sumi 엔진 아키텍처 — 2026-10-01

- 상태: **target(설계)** 와 **current(2026-10-01 작업 트리 구현 범위)** 를 절별로 구분한다. 베타·실험 항목은 "베타"로 표기한다.
- 배치 예정 경로: `docs/brush-lab-sumi-engine-architecture-2026-10-01.md`(`config/documentation-authority.json` currentDocuments 등록은 통합 담당).
  이 초안의 상대 링크는 `apps/brush-lab/docs/drafts/` 위치 기준이며, 이동 시 통합 담당이 경로를 고친다.
- 권위: 레인별 상태는 [`src/lanes/registry.ts`](../../src/lanes/registry.ts)와 [README 레인 상태 표](../../README.md), 결정 기록은
  [ADR-0026](../../../../docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md), 참고 문헌·라이선스 판정은
  [참고 문헌 원장](../../../../docs/engines/labs-brush-engine-references-2026-10-01.md)이다. 문서가 소스와 다르면 소스를 우선한다.

## 1. 설계 근거 — 왜 자체 compute 엔진인가

사용자 요구는 "Vello처럼 극단적으로 GPGPU(WebGPU compute)를 활용하는, CLIP STUDIO PAINT를 압도하는 종류·품질·성능의 브러시 엔진"이다.
2026-09-30 정찰과 2026-10-01 스펙 심사에서 확인한 사실:

| 후보 | 판정 | 이유 |
| --- | --- | --- |
| Vello(Apache/MIT) 확장 | 비교 레인으로만 | 경로 채움 렌더러라 브러시의 본질인 **픽셀별 상태**(습식·smudge·획 불투명도 상한·안료 질량)를 표현할 API가 없다. 이 컨테이너에는 wasm-bindgen 도구가 없어 Rust 확장을 재현할 수 없다. 커밋된 `pkg-gpu`는 벡터 비교 레인으로 유지 |
| Skia Graphite / Rive / Impeller / Forma | 미채택 | 웹 아티팩트 없음·WebGPU 백엔드 없음·웹 연동 non-goal·아카이브 |
| 설치형 엔진(Krita·MyPaint 앱) | 금지 | GPL/AGPL. 개념·용어만 참고하고 코드·LUT·상수를 열람·복제하지 않는다 |
| mixbox / Rebelle Pigments | 금지 | CC BY-NC. Kubelka-Munk는 자체 구현(§7) |
| **자체 TS + WGSL compute 엔진(Sumi)** | **채택** | 순수 TS + WGSL 문자열이라 Node(vitest)에서 모의 `GPUDevice`로 바인딩·디스패치 계약을 검증할 수 있고, CPU 참조 래스터와 같은 수식·순서로 결정성을 보장한다. `src/engine`을 디렉터리 이동만으로 `packages/studio-brush-engine-sumi`로 승격할 수 있다 |

정찰 보고와 설계 보충(팁 접촉·필기감, 습식 매체)의 요지는 참고 문헌 원장 §1(채택 기법 16건)에 모듈 매핑과 함께 정리돼 있다.

## 2. 데이터 흐름(current)

```text
PointerEvent ──platform/pointer-capture──▶ RawSample[] (coalesced=정본, predicted=미리보기 전용)
   │                                            │
   │ platform/raf-scheduler (프레임당 1회)        ▼
   └──────────────────────────────▶ lane.addSamples(batch)
                                         │
             engine/input InputPipeline  │  calibration → 1€(채널별) → corner-preserve → predictor(표시 전용) → endpoint tail
             engine/physics PhysicsModel │  tip-contact(Hertz/felt) · nib-flex · bristle-bundle · graphite · velocity · friction → ContactFootprint
             engine/dynamics DabEmitter  │  간격 적분·테이퍼·산포·듀얼 팁·색 동역학 → DabBatch(16 f32 = 64 B/dab)
                                         ▼
       ┌──────────── cpu-reference(Surface) ────────────┐    ┌──── webgpu-compute(target) ────┐
       │ tile-binning(CSR, dab 인덱스 오름차순)            │    │ bin-count → bin-scan → scatter    │
       │ fine-raster(해석적 AA 커버리지·팁 mip·그레인·KM)   │    │ fine raster(타일당 워크그룹)       │
       │ stroke-layer(선형 premultiplied f32, 획 알파 상한)│    │ wet_*(옵션)    → composite → present│
       │ wet-reference(베타) · composite · toLabImage      │    │ (1 encoder, queue.submit 1회)      │
       └──────────────────────────────────────────────────┘    └────────────────────────────────────┘
                                         │ readback: LabImage(sRGB straight RGBA8) + linear f32
                                         ▼
       bench: metrics(texture·render·handfeel·perf·family) → thresholds.judge → BrushCertificationReport(zod 1.0.0)
       app: MetricsTable · DiffHeatmap(ΔE) · ReportPanel(JSON/PNG) · FamilyGallery(Worker, cpu-reference 경로)
```

레이어 의존 방향은 `app → platform → bench → lanes → engine`이며 `engine/`은 외부 import 0, 모든 시간·GPU·캔버스·난수 시드는 주입된다.

## 3. DabInstance 64 B 레이아웃(current, TS·WGSL·Rust 단일 원천 `engine/core/dab-layout.ts`)

| 인덱스 | 필드 | 타입 | 의미 |
| --- | --- | --- | --- |
| 0–1 | x, y | f32 | 문서 좌표(px) |
| 2–3 | rx, ry | f32 | 반지름(압력·물리 footprint 반영) |
| 4 | angle | f32 | 회전(rad) |
| 5 | hardness | f32 | 경도 0..1 → feather = max(1, (1 − hardness)·min(rx, ry)) |
| 6 | flow | f32 | 도포량 |
| 7 | shapeExp | f32 | 초타원 지수 |
| 8–11 | r, g, b, a | f32 | 선형 premultiplied 색 |
| 12 | tipSeed | u32(bitcast) | bits 24..31 `TIP_KIND_ID`, 0..23 시드 |
| 13 | grain | f32 | 종이 그레인 응답 |
| 14 | wet | f32 | 습식 투입량 |
| 15 | flags | u32(bitcast) | bits 0..15 pigmentMass(u16), 16..20 erase/smudge/dualTip/lockAlpha/impasto, 24..31 `DEPOSITION_ID` |

WGSL 구조체(크기 64, 정렬 16): `struct Dab { p: vec2<f32>, r: vec2<f32>, angle, hardness, flow, shape_exp: f32, color: vec4<f32>, tip_seed: u32, grain, wet: f32, flags: u32 }`.
`dab-layout.test.ts`가 pack/unpack 왕복과 WGSL 필드 순서 일치를 고정한다.

## 4. GPU 파이프라인(current: `gpu/{layout,device,buffers,timing,pipeline-compute,present,readback}.ts`·WGSL 모듈·모의 GPUDevice 계약 테스트 / 브라우저 실기기 픽셀은 미검증)

### 4.1 한도 상수(`gpu/layout.ts`)

| 상수 | 값 | 의미 |
| --- | --- | --- |
| GPU_TILE_SIZE | 16 | 타일 한 변(px), CPU `TILE_SIZE`와 동일 |
| WORKGROUP_1D / SCAN_BLOCK | 256 / 1024 | 1-D 워크그룹, 스캔 블록(256 스레드 × 4) |
| MAX_DABS_PER_BATCH | 65 536 | 4 MiB; 초과 시 같은 프레임 안에서 분할 제출(`submitCount` 증가) |
| MAX_TILES | 16 384 | 2048² / 16² — MVP 캔버스 상한(초과 → `limit-exceeded`) |
| MAX_TILES_PER_DAB | 4096 | 초과 dab는 fail-visible overflow |
| MAX_REFS / MAX_SCAN_BLOCKS | 1 048 576 / 16 | CSR 참조·스캔 블록 상한 |
| WET_CHANNELS | 12 | water 1, velocity 2, pigment 4, height 1, fixed 4 |

### 4.2 바인딩 표

| 그룹.바인딩 | 이름 | 종류 | 내용 |
| --- | --- | --- | --- |
| 0.0 | params | uniform | 프레임 파라미터 |
| 0.1 | dabs | storage-read | `array<Dab>` |
| 0.2 | bins | storage-rw | counts(atomic)·offsets·block_sums |
| 0.3 | refs | storage-rw | CSR dab 참조 |
| 0.4 | table | storage-rw | dirty 타일 목록·슬롯·overflow·indirect(vec3) |
| 1.0 | strokePool | storage-rw | 획 레이어 타일 풀(vec4 f32) |
| 1.1 | wetPool | storage-rw | 습식 타일 풀(12 ch) |
| 1.2 | document | storage-rw | 문서(vec4 f32, ≤ 2048²) |
| 1.3 / 1.4 | tipAtlas / paperTex | texture-2d | 팁 mip 아틀라스(r8unorm) / 종이(rgba8unorm) |
| 1.5 / 1.6 | linSampler / presentTex | sampler / storage-texture | 표시 텍스처 |

compute 스테이지 storage 버퍼 수는 7(한도 8)이며 바인드 그룹 레이아웃은 명시적으로 2개 생성해 모든 파이프라인이 공유한다(`layout: "auto"` 금지).

### 4.3 프레임 10단계(1 encoder, `queue.submit` 1회)

| # | 패스 | 진입점 | 디스패치 | 요지 |
| --- | --- | --- | --- | --- |
| 0 | 업로드·클리어 | — | — | `writeBuffer(dabs)`, counts·table 클리어 |
| 1 | bin-count | `count_main` | ⌈dab/256⌉ | dab AABB → 겹치는 타일 `atomicAdd(counts)`, 타일 초과 시 overflow |
| 2–4 | bin-scan | `scan_blocks`·`scan_block_sums`·`scan_add` | ⌈tiles/1024⌉·1·⌈tiles/256⌉ | reduce-then-scan(3 dispatch), dirty 타일·슬롯 할당 |
| 5 | write_indirect | `write_indirect` | 1 | `table.indirect = (dirty, 1, 1)` |
| 6 | bin-scatter | `scatter_stable` | indirect | 워크그룹 = dirty 타일 1개, 워크그룹 내 exclusive scan으로 **dab 인덱스 오름차순** CSR(원자 없음) |
| 7 | fine-raster | `raster_tile` | indirect, (16,16,1) | 픽셀 1개/invocation, refs 순회, 커버리지·팁·그레인·KM, 레지스터 premultiplied f32 누적 후 타일 1회 쓰기 |
| 8 | wet(옵션) | 수채 `wet_snapshot`→`wet_edge_delta`→`wet_step_water`→`wet_expand`→`wet_commit`, 유화 `oil_*`(2026-10-02 구현 — 현행 진입점은 `gpu/layout.ts` `ENTRY_POINTS`) | indirect × substeps | 활성 타일(+1링)만 |
| 9 | composite | `composite_dirty` | indirect | `presentTex = encode(over(document, stroke × opacity))`, 임파스토 조명 |
| 10 | present | `vs_main`/`fs_main` | 삼각형 1개 | 캔버스(`alphaMode: "premultiplied"`) |

### 4.4 안정 scatter·간접 디스패치·결정성 논거

- 타일 내 dab 순서는 **dab 인덱스**로 고정(scatter가 워크그룹 내부 prefix로 CSR을 쓰므로 atomic 순서에 의존하지 않는다). 타일은 서로 독립이므로
  같은 입력이면 같은 픽셀이 나온다. dirty 목록 순서는 결과에 영향이 없다.
- decoupled look-back 스캔은 WebGPU forward-progress 미보장과 NVIDIA 특허(US9928033B2) 때문에 기본 경로에서 제외하고 실험 플래그로만 둔다.
- 간접 디스패치(`dispatchWorkgroupsIndirect`)로 dirty 타일 수를 CPU에 읽어오지 않는다. overflow·pool_cursor는 `endStroke`에서 1회만 readback한다.
- CPU 참조 패리티 기준: δ48 3×3 이웃 퍼지 불일치 ≤ 0.5 %, ΔE(CIE76) p99 < 1.0, hard dab 커버리지 |Δ| ≤ 1/255(연구 수치 목표 "Precision 1").
  `WGSL_MIRROR_FUNCTIONS`(hash_u32·value_noise_2d·fbm_2d·superellipse_coverage·dab_tile_bounds·km_mix·linear_to_srgb·srgb_to_linear)는
  CPU 구현과 정적 대조한다.

## 5. 필기감 물리 모델(current, `engine/physics`, 순수 함수·dt 명시)

| 모듈 | 모델(기본 상수) | 출력 |
| --- | --- | --- |
| tip-contact | Hertz `r = r0·(max(p, 1e-3)/p0)^(1/n)`(n = 3), felt `r0·(1 + k·p)/(1 + k)`(k = 1.5), 1차 히스테리시스 τ↑ 12 ms / τ↓ 40 ms | rx, ry |
| nib-flex | 2차계 `x'' = k(target − x) − c·x'`, k = 180/s², 임계 감쇠, semi-implicit Euler(substep ≤ 4 ms), 임계 압력 아래 gap 0 | nibGap, 폭 |
| bristle-bundle | 폭 = w0 + spreadGain·p, 기울기 비대칭 `tiltGain·(1 − altitude/90)`, 각도는 진행 방향을 τ = 30 ms로 추종 | rx, ry, angle, asymmetry |
| graphite-deposit | `grain = clamp((p·contactGain − bumpThreshold)/(1 − bumpThreshold), 0, 1)` 단조 | grain |
| velocity-deposit | `flowScale = (1 − clamp(v/vMax))^γ`(γ = 0.6), `breakup = clamp((v − vBreak)/(vMax − vBreak))`, `water = waterBase + slowGain·(1 − clamp(v/vSlow))` | depositStrength, breakup, water |
| friction | `mu = mu0 + muGrain·|dot(dir, paperDir)|`, jitter 진폭 = mu·jitterGain, flow × (1 − mu·k) | jitterAmp, flowScale |

입력 파이프라인(`engine/input`)은 `getCoalescedEvents` 정본 → 장치 보정(deadZone·γ) → 채널별 1€ 필터(안정화 강도 s → `minCutoff = lerp(3.0, 0.5, s)`,
`β = lerp(0.05, 0.005, s)`) → Menger 곡률 기반 코너 보존 → 예측(표시 전용, 코너·저속에서 0) → pen-up endpoint tail(마지막 좌표 = raw up)이다.
0.6 초과 구간의 spring 팔로워 백엔드는 설계상 분리 대상이며 이 랩에는 없다(패널 표시).

## 6. 습식 모듈(베타, `engine/wet`, CPU 참조 최소 모델 current / GPU 습식 패스 current(2026-10-02 구현, 초안 당시 `wet_step` 단일 패스 서술은 폐기))

인터페이스: `createWetState` · `depositWet` · `activeTilesAfterDeposit`(dirty + 1링) · `stepWet(state, params, dtMs, paper)` · `bakeWet` · `impastoLighting`.
풀 레이아웃(코어 12 ch + 확장 23 ch)은 GPU 습식 모듈(`gpu/wgsl/wet-water.wgsl.ts`·`wet-oil.wgsl.ts`·`wet-composite.wgsl.ts`, 2026-10-02 습식 GPU 미러 구현 — 현행 수치 모델·패리티 측정은 `brush-wet-gpu-mirror-spec.md`와 README)과 공유한다. 아래 수치 모델 서술(5점 Jacobi 등)은 구 최소 모델 기준이라 최신이 아니다. CPU 참조 수치 모델: 5점 Jacobi 확산(water·pigment), 증발, 모세관 흡수(absorb 채널),
에지 다크닝(안료 플럭스 ∝ −∇water), 그래뉼레이션(침전율 ∝ bump), 건조(water < ε → pigment를 fixed로). shallow-water 속도장·임파스토 점성 밀기는 확장 범위.

| 파라미터 | 범위 | 기본 | 의미 |
| --- | --- | --- | --- |
| diffusion | 0..1 | 0.25 | 확산 계수 |
| evaporation | 0..0.1 | 0.004 | ms당 증발 |
| capillary | 0..1 | 0.3 | 종이 흡수 속도 |
| edgeDarkening | 0..2 | 0.8 | 경계 안료 이류 강도 |
| granulation | 0..1 | 0.4 | 요철 침전율 |
| absorptivity | 0..1 | 0.5 | absorb 채널 스케일 |
| viscosity / surfaceTension | 0..1 | 0.1 / 0.2 | 확장 |
| dryingMs | 100..60000 | 4000 | 건조 시간 |
| gravity | [−1..1]² | [0, 0] | 흘러내림(확장) |
| substeps | 1..8 | 2 | 프레임당 스텝 |

## 7. Kubelka-Munk 자체 구현(베타, `engine/pigment`)

`F(R) = (1 − R)²/(2R)`, `R∞ = 1 + q − √(q(q + 2))`, 질량 가중 K/S 혼합, 유한 두께 층 `finiteLayer` + `overSubstrate`, 채널별 F(R) 공간 선형 혼합
`kmMixRgb`(WGSL `km_mix` 미러). 안료 8종 계수는 **자체 합성값**(측정 데이터 아님)이며 mixbox 코드·계수·문자열 유입은 경계 테스트가 거부한다.
공개 수식 출처는 [KM 검토 문서](../../../../docs/engines/brush-spectral-km-20260920.md)와 참고 문헌 원장이다. 목표(연구 수치): GPU 축소 경로 vs CPU 38밴드 ΔE2000 median ≤ 1.0, p95 ≤ 2.5.

## 8. 질감 생성기·종이 모델·샘플링 규약(current)

- 팁 8종(`round`·`flat`·`bristle-strands`·`texture-stamp`·`noise`·`hatch`·`stipple`·`particle`)은 정수 해시 노이즈(`hashU32`, CPU/GPU 비트 동일)로
  생성하며 외부 비트맵 에셋은 0개다. mip 체인은 box 필터로 1×1까지.
- 종이 필드(256², 주기 fBm으로 타일러블): direction·bump·absorb. `seamScore` ≤ 1e-3을 테스트가 고정한다.
- 샘플링 필터 `nearest | bilinear | trilinear | anisotropic`(장축 4탭 평균, GPU 규약 동일). 2× 스케일 HF 에너지 비는 nearest > bilinear > trilinear ≥ anisotropic.

## 9. 프리셋 30종·가족별 품질 목표(current)

카탈로그는 `engine/presets/catalog.ts`(30종, 모든 팁 생성기·도포 모델 최소 1회 사용), 가족 목표는 `engine/presets/families.ts`다.

| 가족 | 프리셋 | 지표(자체 정의 임계값) |
| --- | --- | --- |
| pencil·chalk·charcoal·conte·crayon | pencil-hb, pencil-6b, pencil-mechanical, chalk-pastel, charcoal, conte, crayon | grainPressureMonotonicity(Spearman) ≥ 0.95 |
| ink·ballpoint | ink-g-pen, ink-maru-pen, ink-brush-pen, ballpoint | edgeTransitionWidthPx ≤ 1.2, taperWidthError ≤ 0.08 |
| marker | marker-alcohol | overlapAccumulationError ≤ 0.02 |
| watercolor | watercolor-wet, watercolor-dry | edgeDarkeningRatio ≥ 1.15, granulationContrast ≥ 0.08 |
| gouache·acrylic | gouache, acrylic | overlapAccumulationError ≤ 0.03 |
| oil | oil-impasto | reliefLightingConsistency ≥ 0.9 |
| airbrush | airbrush | airbrushGaussianFit(R²) ≥ 0.97 |
| spray·special | spray-splatter, fx-glitter, fx-fur-grass, fx-cloud-smoke | strandSeparation ∈ [0.1, 0.9] |
| hatch·halftone | hatch-pen, screentone-halftone | moireHighFrequencyRatio ≤ 0.35, halftoneDotRegularity ≥ 0.9 |
| texture | texture-canvas-stamp, texture-fabric-stamp, texture-paper-stamp | seamScore ≤ 0.02 |
| smudge | smudge-blend | smudgeMassConservation ≤ 0.02 |
| eraser | eraser-soft, eraser-hard | eraserColorInvariance = 0(색 채널 불변) |

전역 임계값(`bench/report/thresholds.ts`): edgeStaircaseEnergy ≤ 0.75, opacityAccumulationError ≤ 0.01, fuzzyMismatchPct ≤ 0.5(참조 레인 대비),
deltaEP99 ≤ 1.0, determinism = 1(재실행 해시 동일), latencyP95Ms ≤ 16.7(후보 레인). 판정은 FAIL > UNAVAILABLE > PASS.

## 10. CSP 대비 자체 정의 목표 수치(target, 비공식 출처 명시)

| 지표 | 목표 | 근거(비공식) |
| --- | --- | --- |
| 브러시 지름 | 2 000 px에서 p95 프레임 ≤ 16.7 ms | CSP가 '무거움'으로 안내하는 700 px의 약 3배 |
| 캔버스 | 최장변 ≥ 16 384 px(현 MVP 상한 2048²) | Procreate 상한, CSP DEBUT 10 000 px |
| dab 처리량 | ≤ 2M dab/프레임(바인딩 128 MB 이내) | WebGPU 한도 |
| 입력→화면 지연 | 파이프라인 ≤ 1프레임, 예측 포함 체감 ≤ 20 ms | Ng 2012 지각 임계 |
| 패리티 | 커버리지 |Δ| ≤ 1/255, 단계별 버퍼 비트 동일 | Krita Precision 등급 차용(개념만) |
| 불투명도 상한 | 10회 dab Wash α ≤ opacity(±1/255), Build-up 1 − (1 − flow)^10 | 공개 정의 |
| 습식 | 활성 타일 ≤ 10 %에서 60 fps, 결정적 dt·시드로 재현 100 % | Curtis 1997·MoXi 2005 |
| 카탈로그 | 절차적 브러시 ≥ 24종(현 30종), 외부 에셋 0 | 기존 workbench 제약 |

미확인 수치(CSP 브러시 크기 상한·안정화 범위·LPI 범위 등)는 "미확인"으로 유지한다. 이 수치는 **브라우저 실측 전까지 달성으로 보고하지 않는다**.

## 11. 레인별 상태(current)

| 레인 ID | 종류 | 상태 | 구현 요지 |
| --- | --- | --- | --- |
| cpu-reference | baseline | implemented | `StrokePipeline` + `Surface`(Node 전체 검증, 결정성 기준) |
| platform-baseline | baseline | implemented | `modelRawInput → applyStabilizer → strokeOutlinePath` → 자체 even-odd 스캔라인(4×4 AA) |
| canvas2d | baseline | browser-verification-required | `env.createCanvas` 주입, `arc` + radial gradient 스탬프 |
| webgpu-compute | candidate(주력) | browser-verification-required | `SumiComputeRuntime`(모의 장치로 바인딩·디스패치·제출·예산·오류 표면화 검증) |
| webgpu-instanced | comparison | browser-verification-required | 렌더 인스턴싱 draw(6,n)·bake/encode 패스(모의 장치 검증) |
| webgl2-instanced | comparison | reserved | WebGL2 명시 선택(engine-gpu 확장 예약) |
| wasm-cpu / wasm-gpu-hybrid | candidate | reserved | Rust C-ABI 커널(INTEGRITY 봉인 후) / WASM 동역학 + GPU 래스터(probe not-implemented) |

레지스트리와 README 표가 어긋나면 `lanes/registry.test.ts`가 실패한다. 무음 대체 금지([ADR-0018](../../../../docs/adr/0018-no-automatic-engine-fallback-vello-primary.md)).

## 12. 라이선스 표

| 구분 | 항목 | 판정 |
| --- | --- | --- |
| 직접 의존 | react·react-dom·zod·vite·vitest·jsdom·@testing-library/react(MIT), typescript(Apache-2.0), @toonstudio/*(저장소 내부) | 허용 |
| 재구현(출처 주석) | Vello(Apache/MIT) 파이프라인 골격, libmypaint(ISC) 동역학 스키마, spectral.js(MIT) KM 수식, font-rs(Apache-2.0) signed-area, perfect-freehand(MIT), webgl-noise(MIT)/OpenSimplex2(CC0) | 허용(개념·수식만) |
| 개념만(코드 미복제) | Blend2D(Zlib), Skia(BSD-3), GPUPrefixSums(MIT, 특허 주의), Ciallo 논문 | 허용(study-only) |
| **금지** | mixbox·Rebelle Pigments(CC BY-NC), LYGIA(Prosperity), Krita·GIMP·MyPaint 앱·Drawpile·harmony·Milton·Darkly·Ciallo 코드(GPL/AGPL), 경쟁 제품 브러시 파일·UI 에셋(.abr/.brush/.sut/톤) | 유입 시 경계 테스트·리뷰 거부 |
| 특허 주의 | NVIDIA look-back scan(기본 경로 제외), Adobe 절차적 벡터 수채·가상 붓모→벡터(미채택) | 법무 검토 전 미도입 |

세부 판정과 고지 의무(Apache NOTICE·BSD 저작권·Zlib 수정 표기)는 [참고 문헌 원장](../../../../docs/engines/labs-brush-engine-references-2026-10-01.md) §2·§5와
[ADR-0008](../../../../docs/adr/0008-license-isolation-policy.md)을 따른다.

## 13. 베타·실험 항목

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| shader-f16 누적 | 실험(target) | 기능 off 모드에서 골든 패리티 통과가 조건 |
| compatibility 모드(4096 텍스처) | 실험(target) | 타일 아틀라스 자동 축소 |
| wet GPU 습식 패스(`wet_*`·`oil_*`) | 베타(current, SwiftShader 패리티 측정·실 GPU 미검증) | CPU `wet-reference`와 패리티 |
| Kubelka-Munk 혼색 | 베타(current CPU) | 자체 합성 계수, UI 토글 "KM 베타" |
| smudge / pickup | 베타(current CPU) | 질량 보존 지표 |
| 임파스토 높이맵·릴리프 조명 | 베타(current CPU) | GPU 조명은 확장 |
| 안정화 > 0.6 spring 팔로워 | 미구현 | 같은 1€ 매핑 사용(패널 표시) |

## 14. 미구현 한계와 후속 계획

- 이 컨테이너에는 GPU가 없다. webgpu-compute·canvas2d의 실기기 픽셀은 **브라우저 미검증**이며 `scripts/browser-probe.mjs`(Playwright Chromium
  `--enable-unsafe-webgpu`, swiftshader) 게이트가 확장 범위로 예정돼 있다. 소프트웨어 렌더러 리포트는 성능 증거로 쓰지 않는다.
- MVP 캔버스 상한 2048², 대형 dab(타일 4096개 초과)은 overflow로 기록될 뿐 계층 타일 경로는 없다.
- 확장 우선순위: (1) 브라우저 프로브 → 첫 인증 리포트 커밋, (2) wasm-cpu 레인(INTEGRITY), (3) wet GPU, (4) webgpu-instanced·webgl2-instanced,
  (5) hybrid, (6) f16·subgroups·timestamp 실측, (7) 10⁵ dab·2048² 벤치, (8) `engine/` → `packages/studio-brush-engine-sumi` 추출 시범 PR.
- 랩 UI는 브러시 테스트만 한다: undo·레이어·문서·저장·서버 연동은 범위 밖이다(기존 [workbench 문서](../../../../docs/brush-lab-workbench.md)의
  제품 내 `/studio/brush-lab`과는 다른 앱이다).
