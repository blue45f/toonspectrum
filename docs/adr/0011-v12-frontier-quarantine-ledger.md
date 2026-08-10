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
5. **제품 배선과 후보 증거 분리**: package/benchmark surface의 통과는 `/studio` 비테스트 호출부
   승격과 별개다. 아래 레인 2의 초기 `2.6~2.8ms` 문구는 후속 동일 하니스 재실측
   **2.9~3.0ms/128²**로 대체한다. Kurbo/Parley/Glifo 역할 cache/Velato/WESL/OpenCV/libmypaint는
   해당 package·provider·하니스 범위로 분류하고 실제 제품 caller가 확인된 범위만 제품 활성으로 본다.
   Linebender Color는 Vello/Peniko 내부 의존이며 `/studio`의 CSS·광색역 색관리 제품 오너는
   Color.js/Culori 및 기존 고비트 경로다. `vello_svg` 제품 호출부도 CPU RGBA asset preview일 뿐
   interactive GPU Scene Fragment가 아니다.

## 레인 원장 (2026-08-08 실측)

| # | 레인 | 상태 | 실측 근거 | 승격(해제) 조건 | 폴백 |
| --- | --- | --- | --- | --- | --- |
| 1 | Vello GPU 네이티브 (Metal) | **활성 검증됨** | `tests/benchmarks/results/vello-gpu-native.json`: 7장면 중 6장면 GPU↔CPU 퍼지 불일치 0.0000%, `03-curves` 0.0366%(게이트 0.6%의 1/16), p50 1.54~1.62ms/128²(readback 포함). 하니스 `crates/studio-engine-vello/tests/gpu_parity.rs` | ~~(유지 게이트) 대형 장면 처리 상한 실측~~ → **2026-08-08 충족**: `tests/benchmarks/results/large-scene.json` — vello_cpu는 결정적 기준선 역할(30k 경로@1024² p50 31.88s, 전 조합 픽셀 sha 결정성), 인터랙티브 상한은 GPU 레인이 담당(레인 2 실측 참조). 다음 관측점 = 실기기 매트릭스 | vello_cpu 0.2.0 결정적 기준선 / CanvasKit |
| 2 | Vello GPU WebGPU wasm | **활성 검증됨** | 2026-08-08 실브라우저 실측 `tests/benchmarks/results/vello-gpu-browser.json`(Chromium 140.0.7339.186 headless, wgpu `BrowserWebGpu` 어댑터 획득, 하니스 `packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts` `VELLO_GPU_BROWSER_PROBE=1`): 7장면 중 6장면 GPU↔CPU 퍼지 불일치 0.0000%, `03-curves` 0.0366% — 레인 1 네이티브 Metal과 동수치(게이트 0.6%), 최신 재실측 p50 2.9~3.0ms/128²(readback+JS 경계 포함). 산출물 `crates/studio-engine-vello/pkg-gpu/`(`wasm-pack build --target web --release --out-dir pkg-gpu -- --features gpu`, wasm 4,256,707B≈4.26MB, INTEGRITY.sha256 핀 + `verify:studio-engine` 게이트 편입). 어댑터 `render_scene_gpu_json`/`probe_webgpu`(crates `src/gpu_web.rs`, 인코딩은 네이티브 하니스와 공용 `src/gpu_scene.rs`) + TS `packages/studio-engine-vello/src/gpu-browser.ts`(`vello-gpu-browser` descriptor, WebGPU 부재 시 명시 에러 계약 — `gpu-browser.test.ts` 고정) | ~~(유지 게이트) `toon-vello` fork 2트랙 개설 조건 충족(착수는 별도 트랙)~~ → **2026-08-08 개설 완료**: 벤더 트랙 `crates/vendor/wgpu-toon`(crates.io wgpu 29.0.4 + TOON-PATCH 0001, 6파일·`toon-fabric` 피처 게이트), 2트랙 = Track A `cargo test`/`cargo check --features lottie`(패치 cfg-out, 상류 API 동일) · Track B `--features fabric`(커밋된 `pkg-gpu/`가 Track B 산출물). 드리프트 게이트 `crates/studio-engine-vello/tests/vendor_patch_parity.rs`. 상세 `docs/engines/vello-baseline.md` §3. ~~대형 장면 성능 실측~~ → **2026-08-08 충족**(`large-scene.json` gpuBrowser): 5k 경로@512² GPU p50 73.7ms vs 동일 wasm 내 vello_cpu 2,471.7ms(**33.5×**), 15k 경로 205.0ms vs 7,410.3ms(**36×**), 퍼지 불일치 0.0000%/0.0004%(게이트 0.6%) — node CanvasKit 대비로도 15k@512²에서 5.6×(1,146ms). JSON 경계 비용 분리 실측(15k: parse 54.8ms/stringify 32ms). 잔여 = 실기기 매트릭스 | vello_cpu wasm(기본 wasm-pack 산출물, gpu 피처 제외) — `loadVelloGpuBrowser`/`probeWebGpu`가 WebGPU 부재를 명시 에러/`supported:false`로 보고해 폴백 라우팅 강제 |
| 3 | Google Ink C++ 벤더링 | **빌드 게이트 통과·PoC 실측** | **2026-08-08 emsdk 구축 후 1차 범위(ink-stroke-modeler 단독 PoC) 완료**: 커밋 핀 `f2388813b0b25bc3e33d143d369a8367ab2e30c8`(depth-1, `~/toolchains/ink-stroke-modeler`), emcc 6.0.6 `emcmake cmake -DINK_STROKE_MODELER_BUILD_TESTING=OFF`(abseil 20250512.0 FetchContent) + 자체 C 브리지 `ism_bridge.cc` em++ 링크 → **wasm 99,256B**(+mjs 12KB, MODULARIZE/ES6, web+worker+node) — 산출물 `packages/studio-brush-platform/src/ink-modeler/`(INTEGRITY.sha256 핀, `verify:studio-engine` 게이트 편입), TS 경계 `ink-modeler.ts`(`loadInkStrokeModeler`/`modelStroke`, Predict 미노출 = 결정적 재생 계약, 계약 테스트 12케이스). **4지표 실측** `tests/benchmarks/results/ink-modeler-poc.json`(시드 1234, 합성 3코퍼스: 직선+지터·급커브 V·속도 램프, vs `stabilizer.ts` ema/spring 0.35·0.7): (a) 지터 억제 **87.4%** vs 52.4(ema.35)/83.0(ema.7)/74.4(spring.35)/92.5%(spring.7) (b) 코너 오차 **5.70px** vs 3.02/8.31/9.04/14.98px (c) 종점 수렴 **0.07~0.20px 진수렴**(끝-2점 0.27~0.48px) vs 자체는 최종점 스냅 0px이나 끝-2점 6.1~168.2px wet trailing (d) 처리량 **2,028pts/ms**(wasm 경계 포함) vs 9,084~15,383pts/ms — 4.5~7.6× 느리지만 125Hz 펜 실요구(0.125pts/ms)의 1.6만 배 여유. 수치만 기록 — 게이트 판정은 블라인드 랩 몫(ADR-0009), 프로덕션 잉킹은 폴백 체인 유지. **2026-08-08 2차 범위(§11.2 ink 본체 mesh 레인) 빌드 게이트 통과·실측**: google/ink 커밋 핀 `1d0daba661f3035f42f3649b8e6a0061b47aa759`(module 1.1.0, depth-1 `~/toolchains/ink`) — 상류는 **Bazel 전용**(CMakeLists 부재, rules_go/LLVM/dawn git_override/skia 체크아웃급 툴체인 그래프) 실측 후 Bazel-wasm 레인 기각, libmypaint 방식 **직접 em++ 서브셋 컴파일** 채택: `ink/{types,color,geometry,brush,strokes}` 76 TU(테스트·JNI·tessellator.cc 제외 — 의존 실측: 서브셋에 libtess2/Skia/protobuf/Dawn **0건**, libtess2는 geometry tessellator+Android JNI 유틸만 사용 = §11.2 규칙 2로 배제되는 표면) + abseil-cpp 20260526.0 별도 emcmake 빌드(ink-modeler 레인의 20250512.0은 `status_macros.h` 부재로 불충분 실측) → **76/76 TU 소스 패치 0·1차 링크 성공**(absl 22.4s + ink 12.9s + 링크 3.5s), **wasm 538,378B** — 산출물 `packages/studio-brush-platform/src/ink-mesh/`(INTEGRITY.sha256 핀 + `verify:studio-engine` 게이트 편입), 브리지 `imk_bridge.cc`: pre-modeled 입력(stride-4 f64)을 `BrushFamily::PassthroughModel`로 접속(이중 스무딩 차단; ink 1.1.0은 ink-stroke-modeler 비의존 — 자체 input model 내장 실측), noise_seed=0 고정 = 결정적 재생, BrushTip(scale/corner_rounding/pinch/rotation)+압력→kSizeMultiplier behavior 노출, 산출 = positions f32+surface-UV texCoords f32+triangle indices u32. TS 경계 `ink-mesh.ts`(`generateInkStrokeMesh`+`inkMeshBoundaryLoops` §11.3 편집 프록시용 경계 루프 추출) 계약 테스트 10케이스(결정성 바이트 동일·삼각형 면적>0/인덱스 범위·압력→폭 증가·modeler 레인 체이닝·에러 매핑) + vello 스모크 `tests/visual/ink-mesh-vello-smoke.test.ts`(경계 루프→PathIR fill→vello_cpu 렌더, 잉크 커버리지+결정성 — §11.3 원칙대로 프로덕션 mesh→Vello 프레임 테셀레이션 아님을 명기). **실측** `tests/benchmarks/results/ink-mesh-attempt.json`: 240포인트 스트로크 mesh 생성 p50 **0.48ms**/p95 0.54ms(wasm 경계 포함, 120Hz 프레임 예산 8.3ms의 1/17) | 승격 조건(잔여): Brush Fidelity Lab 실코퍼스 + 블라인드 선호 랩에서 perfect-freehand 레인 대비 우위 입증(ADR-0009 게이트) — **브라우저 실구동은 2026-08-08 실측 완료**(`tests/benchmarks/results/ink-modeler-browser.json`: Chromium 140 crossOriginIsolated, per-update p95/p99 5µs, 240Hz 예산 대비 833×·125Hz 1,600× 여유, node 대비 ~1.4×, 브라우저↔node 비트 패리티; provider seam `stabilizer-provider.ts` ema/spring/ink 3백엔드 옵트인 출하, 틸트=원본 패스스루 확정, 배럴 노출은 컷오버 슬라이스 몫), 라이브 스트로크 통합 시 레이턴시 게이트(§13) 통과 | perfect-freehand 1.2.3 + Kurbo 편집 프록시(`packages/studio-brush-platform` + `fit_polyline_json`) — package/provider 결정성·교차 렌더 검증 완료; 비테스트 제품 caller 확인 전 기본 출하 오너로 표시하지 않음 |
| 4 | Skia Graphite + Dawn WASM | **격리 유지 — 빌드 시도 실측 완료(2026-08-08), 격리 사유를 "파이프 부재"에서 "상류 emsdk 4.0.7 고착"으로 대체** | ~~파이프라인 부재~~ → **파이프라인 구축·재현 빌드 3회 실측** `tests/benchmarks/results/graphite-build-attempt.json`: Skia 핀 `33e64a812c0b`(depth-1, `~/toolchains/skia`) + 선별 DEPS 24핀(전체 git-sync-deps 배제) + emsdk 6.0.6 심링크 — 체크아웃 91s·gn gen 통과·3시도 합 476s(상한 내). 공식 경로 `compile.sh webgpu`(skia_enable_graphite=true·skia_use_dawn=true·ganesh off)로 **1,774/1,783 타깃 emcc 6.0.6 컴파일 성공**(Skia core·SkSL·skottie·paragraph·바인딩 전부). 실패 지점 실측: (1) emcc 6.0.6은 `-sUSE_WEBGPU=1` 제거(직접 프로브: "replaced by --use-port=emdawnwebgpu"), Skia는 emsdk **4.0.7 핀**(bin/activate-emsdk) — 전 graphite/dawn 16 TU가 `'webgpu/webgpu_cpp.h' file not found`. (2) emdawnwebgpu 포트(dawn v20260423) 우회 시 9 TU가 **webgpu.h API 드리프트**로 실패 — `#if defined(__EMSCRIPTEN__)` 레거시 분기 ~63곳이 구스펙 API(ShaderModuleWGSLDescriptor·SupportedLimits·ImageCopyTexture·ErrorCallback·TimestampWrites·VertexBufferNotUsed 등) 고정. (3) 구조 결함 추가 실측: dawn_cmake가 target_os=wasm에서 **호스트 clang(arm64-apple-macosx26 트리플 실측)으로 dawn_native 컴파일** → libdawn_combined.a는 wasm 링크 불능 Mach-O; **`CK_ENABLE_WEBGPU`를 정의하는 gn 규칙 0건**(전 .gn/.gni grep) — 공식 webgpu 구성에서도 JS-facing WebGPU 바인딩은 데드코드; webgpu.js는 제거된 JsValStore 인터롭 의존. wasm 산출물 없음(링크 미도달) | 재시도 조건(갱신): 상류가 graphite/dawn `__EMSCRIPTEN__` 분기·CanvasKit 바인딩을 emdawnwebgpu로 이관하고 CK_ENABLE_WEBGPU 배선을 복원할 때(관측점: modules/canvaskit·third_party/dawn의 emdawnwebgpu 채용). emsdk 4.0.7(EOL) 재현은 리포 emsdk 6.0.6 표준과 상충 + CK_ENABLE_WEBGPU 미배선·Mach-O 포이즌이 그대로라 기각. 통과 후 게이트는 기존대로: V12 매트릭스 CanvasKit Ganesh/Vello 대비 20% 우위, compile/device-loss/visual gates | CanvasKit Ganesh (생산 기준선) |
| 5 | WESL / wesl-rs (V12 플래그 `WESL_SHADER_PLATFORM`) | **package/provider/하니스 도전자 검증 — 제품 기본은 정적 WGSL·자체 생성기** | (a) `cargo search wesl --limit 5` (2026-08-08 실측): crates.io에 `wesl 0.4.2`·`wesl-cli 0.4.2`·`wesl-c 0.4.0`·`wesl-quote 0.4.2`·`wesl-metadata 0.0.5` 존재 — V12 매트릭스 표기 0.4.1보다 상류가 한 패치 진행. (b) 리포 grep 실측: `wesl` 문자열은 런타임 코드(src·crates·packages·server·tests) 0건 — V12 문서에만 존재. EffectGraphIR·컴파일러 v1(`packages/studio-project-model/src/ir/effect.ts`, `packages/studio-engine-registry/src/effect-compiler.ts`)은 provider 서브체인 그룹핑까지만 하고 커스텀 WGSL variant 생성 표면이 없음(WGSL은 정적 커널 고정). wesl-rs는 Rust측 WGSL 모듈화 툴체인이라 소비할 입력 자체가 아직 없다. **(c) 2026-08-08 재개 조건 1단계 충족 실측**: `packages/studio-engine-registry/src/wgsl-variants.ts`가 EffectGraphIR→융합 WGSL variant 생성·열거(`enumerateVariantsForGraph`+variantKey dedup) 표면을 출하 — 브라우저 전수 검증 `tests/benchmarks/results/wgsl-variants-browser.json`(Chromium 140 headless, metal-3): **variant 35개 `createShaderModule`+`getCompilationInfo` 컴파일 에러 0·경고 0**, 대표 5연산 풀체인 컴퓨트 디스패치가 CPU 참조 대비 최대 채널 오차 0/255(허용 ±2). 이제 wesl-rs가 소비할 입력이 존재한다. **(d) 2026-08-08 wesl(wesl-js) 실도입 실측**: wesl-js 0.7.28(루트 devDep) `link()` 로 연산별 WESL 모듈(`packages/studio-engine-registry/src/wesl/` — common·brightness_contrast·hsl·levels·curves·colorbalance·main, `@if` 조건명은 연산 키와 1:1)을 조건 세트로 링킹하는 `compileWeslVariant`(`packages/studio-engine-registry/src/wesl-compile.ts`) 출하 — variantKey·uniform/LUT 레이아웃은 기존 생성기 규칙 재사용(composeWgslVariant 위임)이라 기존 패커(pack/patch)를 그대로 쓴다. 실측 소견: 불리언 `@if` 조건 컴파일로는 스테이지 **순서·반복**(bc.bc, hsl→bc vs bc→hsl)을 표현할 수 없어, 실행 스케줄은 wesl-js `virtualLibs` 가상 모듈(`studio_schedule`, ops 시퀀스의 순수 함수)로 보완하고 @if 는 스테이지 포함/제외 하드 게이트(조건 누락 시 링크 명시 실패·과잉 시 마커 가드 명시 실패)를 담당. 검증: 코퍼스 동일 35종 전 조합 컴파일+구조 단언(활성 스테이지 시그니처 포함·비활성 부재·순서/반복 보존·결정성 — `wesl-compile.test.ts` 12계약, naga 코퍼스와 텍스트 비교는 링킹이 공백/순서를 바꿔 비대상), 브라우저 실측 `tests/benchmarks/results/wesl-variants-browser.json`(Chromium 140.0.7339.186 headless·metal-3, `WESL_VARIANT_BROWSER_PROBE=1`): **WESL 링크 산출 35종 `createShaderModule`+`getCompilationInfo` 에러 0·경고 0**, 대표 5연산 풀체인 디스패치가 CPU 참조 대비 최대 채널 오차 0/255(허용 ±2)·알파 정확 일치 | 재개 조건(갱신): ~~생성 표면 부재~~ → 충족. ~~Naga(네이티브) validation 매트릭스~~ → **2026-08-08 충족 실측**: 브라우저 게이트와 동일 35 variant 를 커밋 코퍼스로 방출(`tests/corpus/wgsl-variants/` + manifest, 드리프트 게이트 `wgsl-variants-corpus.test.ts`, `REGEN_WGSL_VARIANT_CORPUS=1` 재생성)하고 `crates/studio-engine-vello/tests/wgsl_variant_validation.rs`가 naga 29.0.4(`wgsl-in` 파싱 + `Validator` ValidationFlags::all·기본 Capabilities)로 전수 검증 — **35/35 valid·실패 0**, 매니페스트↔파일 집합 일치(누락/고아 0). **파이프라인 수/jank 결합 승격 게이트는 부분 충족·승격 보류**: `tests/benchmarks/results/wgsl-variants-pipeline.json`에서 파이프라인 수 5→1, `createComputePipeline` 15.0→2.5ms, GPU 패스 p50 0.142→0.037ms, 픽셀 오차 0은 입증됐다. 그러나 벽시계 jank stddev는 0.093→0.104ms로 악화됐고 p99/p50은 1.077 동률이다. 따라서 모든 필수 하위 게이트를 결합한 판정은 `passed=false`이며, WESL은 도전자/하니스에 남고 제품 기본 오너로 승격하지 않는다. 재측정에서 벽시계 jank 감소까지 입증해야 재검토한다. | 정적 WGSL(`src/domains/creator/studio-gpu-filter-kernels.ts` 계열 커널) + 자체 생성기(`wgsl-variants.ts`, 병행 유지 — WESL 경로와 variantKey·레이아웃 등가 계약을 테스트로 고정) |
| 6 | Xilem/Masonry CanvasWidgetIsland | **빌드 게이트 통과 — 승격 게이트(§8 input latency A/B·IME·AccessKit 투영) 잔여** | ~~웹 타깃 실험 단계, 리포 내 PoC 0건~~ → **2026-08-08 빌드·실구동 실측 완료**(`tests/benchmarks/results/xilem-wasm-attempt.json`, PoC `~/toolchains/xilem-poc`, 조사 `docs/candidates/canvas-widget-island/xilem-masonry-wasm-survey.md`): (a) **xilem 0.4.0 view 레이어는 wasm 불가** — 비옵션 tokio rt-multi-thread가 `tokio src/lib.rs:479` compile_error로 하드 차단. (b) **masonry 0.4.0 발행판도 wasm 컴파일 불가** — masonry_core wasm 경로가 미선언 크레이트 참조+코드 부패(상류 main엔 수정 존재), 벤더 2의존/2행 패치로 전 스택(vello 0.6·wgpu 26·parley·accesskit_winit) 컴파일 성공, wasm 2,990,509B(폰트 제외 순 ≈2.5MB). (c) **masonry_winit은 웹 구동 불가**(`event_loop_runner.rs:965` pollster::block_on 서피스 init) → **masonry_core RenderRoot 직접 구동 = §8.2 아일랜드 형태로 Chromium 140 headless WebGPU 실구동**: Button+Slider+커스텀 페인트 위젯, 클릭 왕복 1.4ms(픽셀 검증 200,40,40→24,160,88), 슬라이더 드래그 0.3→0.935(원 x 135.5→339), pointer_move 왕복 p50 0.1/p95 0.3/p99 0.9ms, AccessKit TreeUpdate 초기 8노드·증분 2노드 wasm 생성 동작, 콘솔 에러 0. **정합 주의**: masonry는 vello ^0.6 고정 — 리포 핀 0.9와 3마이너 격차라 Scene/Renderer 공유 불가(공존 시 이중 vello), accesskit **웹 투영 어댑터 부재**(TreeUpdate 데이터만 확보) | 승격 게이트(§8 그대로): React+Vello 오버레이 대비 pointer latency 동률 이상 A/B 하니스, focus·IME·screen reader 무회귀(AccessKit→DOM 미러 자체 구축 필요), 120Hz repaint budget, 결정적 이벤트 리플레이. 이기면 Pen Display Surface Mode 기본값 승격 | React 19 + Vello 오버레이 (현행) |
| 7 | bevy_vello 인터랙티브 스테이지 | **격리** | V12 매트릭스 baseline: bevy_vello 0.13.1은 Vello 0.7 계열 — 본 리포 핀 vello 0.9.0 대비 상류 지연. web compute 제한 risk 병기 | bevy_vello의 Vello 0.9/Hybrid 대응 + WebGPU browser gate 통과 | Three.js (+ Vello 오버레이) |
| 8 | CSP 블라인드 벤치 | **실행 하니스 완료·결과 차단 (사람 개입 필요)** | `tests/benchmarks/harness/csp-blind-lab.ts`가 evaluator별 deterministic A/B·과제 순서, 분리 sealed key, 완전 응답·중복/누락 탐지, 5범주+전체 95% Wilson 하한 비열위 판정을 구현하고 16개 계약 테스트가 통과했다. 단, 최신 안정 Clip Studio Paint 소프트웨어 + 실기기(펜 태블릿) + 평가자가 필요한 실제 응답은 자동화할 수 없어 현재 `insufficient-data`다 | 사람이 운영하는 블라인드 선호/레이턴시 랩 세션 확보 후, 전체와 `inking`·`natural-media`·`comic-flow`·`animation`·`text` 각각의 하한이 사전등록 임계 이상. 그 전까지 보류로 표기하고 다른 레인은 진행 | 자동 패리티·pressure-fidelity 회귀 + CSP lab protocol; 실제 결과 없이는 승격 금지 |
| 9 | 8h/24h soak | **8h 통과 — 24h 미완료·격리 유지** | 1차 8h 런(2026-08-08 KST 00:31 기동)이 22분/32,735 cycles 만에 **실결함을 색출하고 중단**: RSS 223.7→1,851.8MB 선형 증가 후 cycle 32,735에서 CanvasKit 128×128 CPU 서피스 할당 실패 11연속(`tests/benchmarks/results/soak-leak-regression-2026-08-08.json` 보존). 원인 실측: canvaskit-wasm `MakeSurface`는 픽셀 버퍼를 JS측 `_malloc`으로 잡고(`surface.Te`) `delete()`는 이를 해제하지 않음 — `dispose()`만 `_free(Te)` 수행(canvaskit.js 소스 확인). 렌더당 정확히 65,536B(=128×128×4) 누수로 관측 기울기와 일치. 수정: 어댑터 `renderSceneToPixels`/`renderSceneToPng`와 quality-lab 하니스를 `dispose()`로 전환 + 힙 크기 무관 판별형 회귀 게이트(`render-memory.test.ts`, 동적 루프로 누수 시 힙 성장 강제) — 뮤테이션 체크로 `delete()` 복원 시 2테스트 실패 확인. **수정판 8h 런 통과 실측(2026-08-08 KST 00:59~08:59)**: 727,739 cycles / 29,109,560 commands / 1,455,478 renders, **errors 0**, RSS 225.1→344.8MB — 전반 +98MB·후반 +21MB로 감속 수렴(선형 누수 부재), `tests/benchmarks/results/soak.json` | 24h 시도는 결과 artifact를 남기지 못해 통과로 산입하지 않는다. 병렬 빌드 부하는 원인 추정일 뿐 증거가 아니며, 별도 사용자 승인 없이 8h 결과로 24h 요건을 면제하지 않는다. 재개 조건: 출하 전 야간 무인 시간대에 `SOAK_MINUTES=1440`을 완주하고 raw result·오류 0·메모리 수렴을 기록할 것 | 스모크 soak(분 단위)+누수 회귀 테스트(render-memory)로 방어 유지 |
| 10 | Velato Lottie→Vello 장면 편입 | **package/provider/하니스 활성 검증 — 제품 기본 caller 미배선** | velato 0.11.0 채용(crates.io 인덱스 실측: 0.9/0.10은 vello ^0.7이라 비호환, 0.11.0이 vello ^0.9·kurbo ^0.13·peniko ^0.6로 본 리포 핀과 유니파이). 네이티브 Metal 게이트 `crates/studio-engine-vello/tests/lottie_parity.rs` 8테스트: 직접 저작 픽스처 2종(이동 사각형·회전 바, `tests/fixtures/lottie/`)에서 프레임 0/30/60 바이트 동일 결정성(fnv64 동일), 위치 키프레임 선형 중간값(96px) 실보간, 0°→90° 회전, 캔버스 밖 완전 클리핑(전 픽셀 0), 자유 스케일(64²/256²) 통과. 실브라우저 실측 `tests/benchmarks/results/velato-lottie-browser.json`(Chromium 140 headless WebGPU, 하니스 `lottie-browser-probe.test.ts` `VELLO_LOTTIE_BROWSER_PROBE=1`): 2픽스처×3프레임 결정성+클리핑 재현, p50 3.1~3.3ms/128². 경계: `src/lottie.rs`(velato importer의 todo!/unimplemented! 패닉 구성 — 회전 부재/분리·분리 위치·이미지 에셋·Add/HardMix 블렌드 — 을 스키마 사전 검증으로 `{"code":"lottie-*"}` 명시 에러화) + `render_lottie_gpu_json`(SceneIR 레인과 공용 GPU 경로) + TS `renderLottieToPixelsGpu`/`LottieRenderError`(`render.lottie.frame` capability). 산출물: pkg-gpu `--features lottie` 재빌드(wasm 4,256,707→4,595,864B, +8.0%), INTEGRITY 재핀, §2 SceneIR 브라우저 패리티 프로브 동수치 재확인 | (유지 게이트) 실세계 Lottie 코퍼스(LottieFiles급 다층·마스크·트림패스) 커버리지 실측 + 미지원 구성 비율 계량 → 초과 시 velato 상류 기여 또는 lottie-web 폴백 라우팅 자동화 | 기존 Lottie 플레이어 레인(lottie-web/CSS) — WebGPU 부재·`lottie-unsupported` 에러 시 TS 계약이 명시 에러로 폴백 라우팅 강제, 조용한 빈 프레임 금지 |
| 11 | libmypaint WASM benchmark reference / Hokusai challenger | **하니스 게이트 종결 — Hokusai 자동 제품 승격 차단** | **benchmark reference**: libmypaint **v1.6.1**(`2768251dacce3939136c839aeca413f4aa4241d0`)을 emcc 6.0.6으로 직접 컴파일한 핀(`packages/studio-brush-platform/src/libmypaint/`, wasm 82,503B; json-c 바이패스·주입 API 전용·INTEGRITY 게이트)이며, Hokusai는 hokusai-core 0.3.0 고정 도전자다. 기존 `libmypaint-parity.test.ts`의 192×96 표준/180px proxy는 빠른 CI로 **그대로 유지**한다. **2026-08-09 KST 실제 풀사이즈 실측**: 비단위 하니스 `tests/benchmarks/harness/libmypaint-fullsize.ts`, 원시 증거 `tests/benchmarks/results/libmypaint-fullsize.json` — MYB wash-soft·ink-crisp 각각을 양엔진에서 base dab **1000px**, 1792×1536(프레임 10.5MiB), 32샘플 실제 압력 스트로크로 렌더; 엔진/브러시별 격리 프로세스를 순차 실행(V8 old-space 512MiB), 워밍업 2 + 측정 9, fresh brush/surface→finish→RGBA8 readback 전체를 측정했다. p50/p95: wash libmypaint **64.946/81.489ms** vs Hokusai **204.147/264.021ms**, ink libmypaint **25.321/27.573ms** vs Hokusai **261.066/282.685ms**. 전 4레인 2회 SHA 결정성, source setting/input 무누락·unknown/unmapped 전량 명시(`unaccountedDimensions=[]`), 메모리 상한 통과(maxRSS **162.4~180.7MiB**, 한도 768MiB; libmypaint 노출 wasm heap 32.31MiB, Hokusai wasm-bindgen heap은 추정하지 않고 null)했다. 압력 5단계 실제 이동 램프의 교차 응답 상관(total-alpha/inked-px)은 wash **0.989845/0.955365**, ink **1.0/1.0**으로 통과했다. 그러나 풀프레임 품질은 ink가 profile/coverage **1.0/1.0**인 반면 wash는 profile **0.920452**, libmypaint/Hokusai coverage **2.867748**로 동률 게이트를 실패했다. 처리량도 Hokusai/libmypaint **0.318134×(wash), 0.096991×(ink)**로 요구 1.2×에 크게 미달한다. 따라서 `allDeterministic=true`, `allPressureFidelityPass=true`, `allNoSilentLossPass=true`, `allMemoryWithinBound=true`이나 `allQualityParityPass=false`, `hokusaiPasses20pctGate=false`; **Hokusai automatic route 0·explicit experimental only; libmypaint는 benchmark-reference-only-not-product-fallback** | ~~진짜 1000px 처리량 실측~~ → **충족·종결**. 잔여 관측점은 (1) 레인 14와 결합한 RGB/색공간 parity 축, (2) Hokusai 최적화가 생긴 경우 동일 비단위 하니스 재실측뿐이다. 180px proxy는 CI 회귀용으로 계속 유지하며 풀사이즈 결과로 대체하지 않는다 | 기존 검증 vector/CanvasKit 제품 route. Hokusai는 explicit experimental only, libmypaint는 benchmark reference only이며 제품 fallback이 아니다 |
| 12 | G'MIC + GEGL 필터 생태계 | **격리 경계 구현 완료 — 실제 provider는 계속 격리** | GPL/CeCILL 바이너리를 앱 번들에 섞지 않는 `ExternalFilterBridge`를 `packages/studio-engine-registry/src/external-filter-bridge.ts`에 출하했다. 엄격한 origin/source/protocol/schema 검증, transferable RGBA 소유권, request quota·in-flight byte quota, progress, timeout, cancellation, provider crash, late/duplicate response 폐기를 22계약 테스트로 고정했다. 결정적 가상 postMessage 하니스 `tests/benchmarks/results/external-filter-bridge.json`의 1,000회 protocol-only 결과는 p50/p95/p99 **0.110/0.135/0.135ms**, peak in-flight 8,192B, 누수 request/byte 0이다. 이는 브리지 회계·라우팅 증거일 뿐 브라우저 벽시계, 네트워크, G'MIC/GEGL 엔진 실행, 시각 품질 또는 엔진 메모리 증거가 아니다 | 실제 G'MIC/GEGL 실행 파일을 별도 origin/프로세스에 배치하고 버전·license/NOTICE·sandbox를 핀한 뒤, golden corpus visual/CSP 비열위·p50/p95/p99·CPU/엔진 메모리·tile seam·NaN/overflow·취소 시 프로세스 회수 게이트를 통과해야 provider 승격. 그 전에는 브리지에 mock/in-memory provider만 연결하며 “필터 지원 완료”를 표시하지 않는다 | CanvasKit/OpenCV/자체 EffectGraph — 실측 출하. 외부 브리지 실패는 기존 레인으로 fail-closed |
| 13 | Vello-native SVG / ThorVG.Web 챌린저 | **vello_svg CPU asset preview 활성 — ThorVG는 조사 단계** | `vello_svg 0.10.0`이 현재 vello 0.9.0·kurbo 0.13.1·peniko 0.6.1과 단일화됨을 Cargo build로 검증했다. engine/provider 하니스의 strict SVG subset은 raw XML 보안 audit→usvg 0.46 tree audit→vello_svg Scene→WebGPU와 독립 vello_cpu reference를 검증한다. 실제 `/studio` caller는 CPU RGBA asset thumbnail만 소비하며 interactive GPU Scene Fragment를 소유하지 않는다. resvg 2.6.2 기준 curves/gradients/clip의 native SSIM **0.995936/0.995692/0.997639**, fuzzy **0.036621/0/0.006104%**; GPU↔CPU fuzzy 최대 **0.030518%**, 20회 브라우저 GPU p50/p95/p99 약 **3.0/3.1~3.4/3.2~3.6ms**. 기존 SceneIR 경로와 평균 SSIM은 0.9964223333 vs 0.996422로 사실상 동률이며 우위를 과장하지 않는다. 채택 이유는 품질 동률 상태의 Vello Scene 직접 편입이다. 비용은 pkg-gpu wasm 4,627,278→**5,744,423B**(+1,117,145B, +24.143%)라 lazy provider로만 로드한다 | text/font, raster image/data URL, pattern, mask, filter, marker, use/symbol, nested SVG, external URL/event/DOCTYPE, objectBoundingBox·복합/even-odd clip은 렌더 전에 `svg-native-unsupported`로 거부하고 SceneIR/resvg tournament로 라우팅. 실제 대형 SVG와 CSP 전체 workflow blind는 미검증. ThorVG는 동일 corpus에서 feature completeness·품질 또는 번들/성능 우위를 입증할 때만 편입 | 편집 가능 import=custom SVG→SceneIR, asset preview=strict vello_svg CPU RGBA; interactive 제품 island는 미배선, final/reference=resvg; Lottie=Velato |
| 14 | 색관리 deltaE 랩 (OCIO/LCMS 역할) | **활성 검증됨 — 자체 참조로 충족** | 2026-08-08 엔진 독립 참조 랩 실측 `tests/benchmarks/results/color-lab.json`(하니스 `tests/benchmarks/harness/color-lab.ts`: IEC 61966-2-1 EOTF/OETF + CSS Color 4 유리수 D65 행렬 + CIEDE2000 완전 구현 — Sharma 2005 공식 벡터 34쌍 max 오차 4.95e-5). 729색 그리드 판정: **스튜디오 자체 변환(studio-highbit-*)은 참조와 f64 잡음 수준 동일(max ΔE00 9.4e-14)**, canvaskit 8888 경로 오차(max 0.509)는 8비트 양자화 바닥과 정확히 일치(변환 자체는 정확), F32 실측 skcms 진짜 오차 max 0.0267(지각 한계 1.0의 1/37). P3 표면 3종(readPixels dst 변환·F32 판독·MakeRasterDirectSurface P3) 실측 확정. 회귀 게이트 `tests/visual/color-management.test.ts` 6케이스 | 외부 OCIO/LCMS 도입 불요 판정 — 자체 참조가 기준. 잔여: 인쇄 CMYK는 별도 파이프(매트릭스 명기), 실기기 wide-gamut 디스플레이 검증은 실기기 매트릭스에 병합 | 현행 skcms+자체 고비트 경로(참조 랩·회귀 게이트로 방어) |
| 15 | Krita 엔진 (제품 오너 질의 2026-08-08) | **엔진 기각 유지 — 검증된 포맷 표면은 제품 편입 완료** | 캔버스/브러시 코어(KisPainter·타일 스왑)는 Qt 결합 GPL-3.0 애플리케이션 내부 구현이고 공식 재사용 라이브러리·wasm 타깃이 없어 웹 렌더 엔진으로는 기각한다. 대신 clean-room FormatGateway가 bounded ZIP32/XML/PNG/MD5, `.bundle` manifest·rights·resource inventory, KPP와 bundle 내 MYB lowering을 구현했다. 제품 import는 모든 검증된 `BrushProgramIR`을 `openProductBrushLibraryRepository().repository.putMany()`로 공유 `studio-local-v12.db`에 무제한 batch commit하며 preserve-only 결과는 성공으로 표시하지 않는다. authored bundle 실제 Hokusai 렌더는 alpha mass 169,219, inked 1,700px, SHA-256 고정; 3,339B all-deflate bundle 파싱 p50/p95/p99 **0.4598/0.7690/0.9962ms**. 원본 bundle·미매핑 필드·권리 정보는 보존한다 | 실제 Krita 앱 재개방/획 parity, permissioned 사용자 bundle corpus, bitmap mask·미지원 sensor·Krita 고유 엔진 파라미터는 미검증이므로 “Krita 완전 호환”은 false. 렌더 코어는 Krita가 독립 라이브러리와 격리 가능한 경계를 제공할 때만 재검토 | libmypaint(benchmark reference only)·Hokusai(explicit experimental only)·기존 검증 브러시 제품 경로; 포맷 실패는 원본 preserve-only |
| 16 | StudioGpuFabric / GpuInteropBroker zero-copy interop (V12 §6) | **활성 검증됨 — L4 zero-copy + 필터 체인 컷오버 완료** | 2026-08-08 TS측 단일 GPUDevice 소유권 브로커 출하 `src/domains/creator/studio-gpu-fabric.ts`: lease 참조카운트(마지막 해제≠파기, 보존 정책)·device-loss 리스너 허브(epoch당 1회 통지, 명시 dispose 비통지)·기능 프로브 캐시(maxTextureDimension2D·timestamp-query 등 epoch당 1회) + 필터 런타임 배선 `acquireStudioGpuFilterRuntimeOnFabric`(기존 `acquireStudioGpuFilterRuntime({gpu})` 공개 주입 표면에 destroy→lease 해제 파사드 — 공유 디바이스 비파괴 계약, 16계약 테스트 `studio-gpu-fabric.test.ts`). **vello 디바이스 주입 실측 불가**(`tests/benchmarks/results/gpu-fabric-probe.json`, 하니스 `gpu-fabric-browser-probe.test.ts` `GPU_FABRIC_BROWSER_PROBE=1`, Chromium 140 headless metal): pkg-gpu export 전수 스캔 10개 중 주입 진입점 0, 소스 근거 = `gpu_web.rs acquire_context()`가 자체 wgpu Instance(BROWSER_WEBGPU)로 어댑터/디바이스 생성 + wgpu 29.0.4(vello 0.9 핀)의 `src/lib.rs mod backend` private·`backend::webgpu::WebDevice.inner` pub(crate)·JS GPUDevice 공개 생성자 부재(`Device::from_custom`은 채택이 아니라 백엔드 전체 재구현) → **toon-vello 패치 백로그 첫 실항목 확정: 외부 브라우저 GPUDevice/Queue adoption(+`Texture` 핸들 무복사 래핑) 노출 — fork 2트랙 개설 트리거**(V12 §6.1의 "wgpu 30 handle API"는 현행 핀에서 부재, vello의 wgpu 언핀 시 재실측). 교환 비용 실측: 별개 GPUDevice 간 텍스처 직접 공유는 검증 오류로 거부("is associated with [Device], and cannot be used with [Device]" — 브로커 same-device 확인의 실증 근거), 현행 L0 교환(vello 내부 디바이스 렌더+readback+JS 경계→fabric writeTexture) p50 5.7/5.8/7.5ms @256²/512²/1024² vs 같은 디바이스 GPU copy(L3) 2.6ms(=submit→완료 왕복 플로어 수준) — 1024²에서 **2.9×**, fabric 디바이스 위 자체 WGSL 커널은 vello 산출 픽셀에 결정적(2회 적용=항등, 바이트 일치). fabric 프로브: maxTextureDimension2D 8192·timestamp-query 지원. **2026-08-08 후속 — 상류 차단 돌파 실측** `tests/benchmarks/results/toon-vello-fork.json`(하니스 `packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts` `TOON_VELLO_FORK_PROBE=1`, Chromium 140 headless metal): 상류 조사 결론 = **wgpu 30.0.0은 export 절반만 제공**(`pub mod webgpu`·`Device/Texture::as_webgpu`·`create_texture_from_webgpu_handle`)이고 **adoption(`Device::from_webgpu_handle`)은 30에도 부재**, 게다가 vello 0.9.0이 `wgpu ^29.0.3`을 핀해 30 승격 자체가 불가(crates.io 인덱스 실측) → **벤더 대상은 wgpu 29.0.4**로 확정하고 `crates/vendor/wgpu-toon`에 6파일 패치(export 3건은 wgpu 30 백포트, adoption 1건은 상류 PR 후보 — 웹 백엔드 전 `Drop`이 no-op이라 소유권 이전 위험 0). 실증: `adopt_gpu_device(fabricDevice)` 후 `fabric_device_handle() === fabricDevice`(**JS 객체 참조 동일성**), `render_scene_gpu_texture_json`이 반환한 `GPUTexture`를 fabric 디바이스 바인드그룹에 직접 투입해 컴퓨트 패스 소비 성공(**검증 오류 0** = L4 성립, L3 copy도 통과), 공유 텍스처 바이트가 기존 L0 경로 픽셀과 **완전 일치**(패치가 렌더를 바꾸지 않음). 교환 비용 p50(같은 실행 내 L0 동시 측정): 256² 5.10→2.70ms(**1.89×**) · 512² 5.50→2.60ms(**2.12×**) · 1024² 7.30→3.00ms(**2.43×**) — adopted 경로가 submit→완료 왕복 플로어(≈2.4ms)에 붙어 1024²의 readback 4.4ms+업로드 2.9ms가 0이 됐다. **2026-08-09 필터 체인 컷오버 실증**: `applyGpuFilterChain`의 기본 production 경로를 `acquireStudioGpuFilterRuntimeOnFabric()`으로 전환하고, 명시적 `options.gpu`만 기존 독립 런타임을 호출별로 소유·폐기하도록 유지했다. 집중 Vitest(`studio-gpu-filter-apply.test.ts` + `studio-gpu-fabric.test.ts`) **2파일 53/53 통과**: 기본 2회 호출이 adapter/device/runtime을 1회만 획득하고 파이프라인을 공유, per-apply cleanup의 `GPUDevice.destroy()` 0회, 명시적 override는 2회 독립 획득·2회 폐기, fabric dispose와 device loss 뒤 각각 새 adapter/device/runtime 재획득을 고정했다. 루트+API typecheck 통과, 변경 2파일 ESLint `--max-warnings=0` 통과. 렌더 체인·error scope·버퍼 수명·최종 1회 readback 코드는 무수정 | 승격 조건: ~~(1) wgpu 상류 handle API 릴리스 또는 toon-vello fork 패치로 vello가 fabric 디바이스를 채택하고 same-device 텍스처 공유(L4)/GPU copy(L3) 실측 통과~~ → **2026-08-08 충족**(fork 패치 경로, 위 실측 근거), ~~(2) 필터 체인 호출부 컷오버(`studio-gpu-filter-apply.ts` 기본 acquire → fabric 경유)~~ → **2026-08-09 충족**(위 53테스트·typecheck·lint 증거) | 기본 필터 체인은 공유 fabric 경로를 사용하고, 명시적 `options.gpu` 하니스/embed만 독립 런타임을 사용한다. fabric 미지원·획득 실패·device loss·validation/OOM은 계속 `null`로 fail-closed되어 CPU/Worker 경로로 폴백한다. 분리 디바이스 render island는 L4 불가 시에만 저빈도 L0 교환(§6.3 — provider 객체별 L2/L1 수행 금지) |
| 17 | 정확 100k/1M Vello 대형 장면 | **package/harness exact gate 통과 — bounded 제품 caller와 분리** | **package/harness 증거** `tests/benchmarks/results/large-scene-million.json`과 `tests/visual/large-scene-million-contract.test.ts`: 100,000/1,000,000개의 비공선 cubic path를 축소 없이 전량 생성·4,096 shard JSON 직렬화·파싱·재생성 SHA-256 검증. 정확 100k 전체 512² overview를 Chromium 140 Metal WebGPU Vello로 렌더(p50/p95/p99 **383.165/386.250/386.250ms**, 100,000 path, repeat fuzzy 0%). 1M 문서는 37개 deterministic pan/zoom에서 최대 visible 17,162, 준비 p50/p95/p99 **8.207/38.963/47.875ms**, 중앙 3,904-path viewport GPU p50/p95 **18.110/20.485ms**. CPU/GPU 256-path subset fuzzy 100k **0.0225%**, 1M **0.0320%**(게이트 0.6%). sampled Node peak RSS 1M **387,579,904B**; 브라우저 GPU/WASM 메모리는 API 미노출이라 `null`로 보존 | `1m-all-visible-overview-vello-gpu`만 격리: monolithic 1M-node SceneIR JSON은 측정한 공간 샤딩 하니스 경로를 우회하고 무제한 JS→Wasm serde 할당을 만든다. retained/sharded GPU scene ingestion이 단일 거대 JSON 없이 전체 overview를 제출할 수 있을 때 동일 품질·메모리 게이트로 재개 | exact 100k/1M corpus를 소비하는 비테스트 `/studio` caller는 확인되지 않았다. 제품의 bounded tiled surface와 selection island는 별도 경계이며 reference/failure fallback은 vello_cpu·CanvasKit |
| 18 | 브라우저 OPFS SQLite 카탈로그 권위 | **활성 검증됨 — 브러시·필터 각 10,000개 제품 경로** | Vite production bundle·COOP/COEP/CORP 아래 Chromium 140 Dedicated Worker에서 SQLite 3.53.0-build1 SAH-pool과 제품 repository를 그대로 실행했다. 두 하니스 모두 OPFS directory `toonspectrum-studio-sqlite`, 논리 파일 **`studio-local-v12.db`**, memory VFS/localStorage 사용 0, close 후 동일 OPFS reopen을 증명한다. 브러시(`brush-library-opfs-browser.json`): 정확 10,000개, 50×200 batch p50/p95/p99 **44.580/53.580/55.985ms**, reopen 0.800ms, 39 keyset page p50/p95/p99 **21.170/43.375/44.020ms**, ID p50/p95/p99 **0.280/0.410/0.495ms**, 누락·중복·정렬 불일치 0. 필터(`filter-library-opfs-browser.json`): 정확 10,000개, 40×250 batch **50.305/80.810/90.215ms**, reopen 0.695ms, 39 page **4.825/26.000/30.690ms**, 누락·중복·정렬 불일치 0. `StudioBrushLibraryPanel`과 `StudioFilterDialog`는 각각 256/128행 bounded keyset page, SQL 검색·분류·고정 필터와 명시적 더 불러오기를 사용하며 전체 카탈로그를 React 메모리에 올리지 않는다. 기존 Studio localStorage envelope/migration marker를 자동 읽지 않는다 | Worker/WASM linear memory는 브라우저 API가 직접 노출하지 않아 null. macOS Metal/Chromium 외 브라우저·OS와 quota eviction은 장치 매트릭스 관측 항목. SQLite unavailable은 사용자에게 명시하고 제품 데이터로 보이지 않는 메모리 세션만 허용한다 | 명시적 외부 파일 import와 개발/테스트 seam만 허용. 레거시 Studio 키 자동 마이그레이션은 없음(`LEGACY_DATA_MIGRATION=FALSE`) |
| 19 | 정확 100레이어 타일 WebGPU 제품 surface | **활성 검증됨 — 두 문서 크기 exact workload 통과** | `tests/benchmarks/results/tiledoc-webgpu-browser.json`: Chromium 140 Metal WebGPU에서 `/studio` 제품 island가 8,192×8,192 및 2,048×30,720 문서 각각 **100레이어·200개 512² RGBA 타일·209,715,200B**를 proxy/reduction 없이 사용했다. one-primary-surface와 StudioGpuFabric 공유 device를 유지하며 201회 pan/zoom p95 **18.505/18.435ms**, edit p95 **34.600/35.135ms**, reorder p95 **35.495/34.975ms**. interactive hot-path GPU→CPU readback 0; 검증 readback은 타이밍 이후 2회뿐이다. rgba16float 결정성 SHA 일치, 최대 linear channel delta **0.00036147**(gate 0.002), device destroy 후 epoch 1→2 및 3→4 복구, console/page/network/CSP 오류 0. 관측 peak JS heap 423,065,675/476,118,529B, tracked GPU peak 218,103,808/371,195,904B; 브라우저가 실제 총 GPU allocation을 노출하지 않아 해당 값은 null로 유지한다 | Windows D3D12·Linux Vulkan·통합 GPU·모바일 WebGPU 장치 매트릭스, 장시간 VRAM pressure/eviction, P3/HDR 실기기 품질은 미측정. 이 범위를 넘어 “모든 장치 완료”로 승격하지 않는다 | WebGPU/device-loss/admission 실패 시 기존 CRDT raster surface가 단독 owner로 복귀; Vello island는 selection overlay 범위 유지 |
| 20 | 창작 문서 SQLite/OPFS 권위 (Animatic/TM/Production Bible) | **활성 검증됨 — 제품 factory·실제 Dedicated Worker·close/reopen 통과** | 세 제품이 동일 `toonspectrum-studio-sqlite` SAH-pool과 `/studio-local-v12.db`를 사용하고 memory/localStorage fallback 0을 실측했다. 애니매틱(`animatic-sqlite-opfs-browser.json`)은 799,973B·120 save/load에서 p95 **24.520/5.135ms**와 SHA equality. Translation Memory(`translation-memory-sqlite-opfs-browser.json`)는 512개·296,700B에서 p95 **13.860/9.915ms**, 재개방 뒤 exact/fuzzy 검색과 언어쌍 의미 보존. Production Bible(`production-bible-sqlite-opfs-browser.json`)은 strict canonical save/load p95 **2.885/0.385ms**, 정상 close/reopen뿐 아니라 `close()` 없는 실제 `worker.terminate()` 뒤 새 Worker 복구, owner/work 격리, corrupt/non-canonical fail-closed를 통과했다. 세 제품 모두 legacy key 자동 읽기 0 | Windows/Linux와 Safari/Firefox capability, 브라우저 프로세스 crash·전원 손실·OS disk-full, 실제 browser-enforced quota, 다중 탭 conflict는 장치/fault 매트릭스로 유지한다. OPFS는 cloud backup이 아니므로 외부 복구 패키지/CAS와 opt-in cloud 정책이 별도 필요 | SQLite unavailable은 내구성 실패를 명시하고 메모리 편집을 “저장됨”으로 표시하지 않는다. 외부 파일 import/export만 명시적 복구 경로로 허용 |
| 21 | Parley/Skrifa CJK text-shape cache (Glifo 역할) | **package/harness bounded cache gate 통과 — all-unique 상주는 기각** | `text-cache-cjk.json`: 실제 AppleGothic TTF + 커밋 Vello WASM, 100개 고유 100-glyph 문구 ×10회 = 정확 100,000글리프. cold p50/p95/p99 24.586/29.238/125.409ms, steady hit p50/p95/p99 0.004792/0.011583/0.020834ms, hit 100%, 총시간 472.6×, 캐시 118,299,072B/256MiB·eviction 0, 표본 6개 shape SHA/픽셀 byte-exact. `text-cache-cjk-all-unique-rejected.json`: 1,000개 all-unique run은 768MiB에서도 cold eviction 311, 재순회 hit 0, RSS 3.74GiB라 기각 | 세로쓰기·금칙·루비와 CanvasKit Paragraph 전체 의미 비교는 계속 잔여. 비테스트 `/studio` 기본 caller는 확인되지 않았다. 향후 제품 채용 시 반복 문구 bounded LRU만 허용하고 100k all-unique outline 상주를 광고하거나 시도하지 않는다 | CanvasKit Paragraph 기준선; 예산 초과 시 LRU eviction 후 재shape |
| 22 | WGSL 구조 기반 pipeline cache | **bounded production-browser gate 통과 — 제품 전체 기본 승격은 보류** | `packages/studio-engine-registry/src/wgsl-pipeline-cache.ts`와 `tests/benchmarks/results/wgsl-pipeline-cache.json` schema v2. Chromium 140/Apple Metal production build에서 uncached/cached 각 61회: p50/p95/p99 **3.115/3.315/3.545ms → 0.075/0.120/0.180ms**(**41.533×/27.625×/19.694×**), pipeline creation **61→1**, long task 0, resident estimate 22,040B. 값 변경은 같은 pipeline 참조를 재사용하고 구조 변경·LRU·in-flight dedupe·remote/manual kill·compile failure 계약을 고정했다. strict `script-src 'self'`, 실제 Chromium argv 48개에 JIT-disable 0, 별도 fresh-context eval 대조군 `EvalError`/`script-src: eval` 1건, release console/page/network/CSP 오류 0 | 실제 제품 EffectGraph caller의 구조 분포·device-loss/remote-kill/장시간 churn과 Windows D3D12/Linux Vulkan/통합 GPU 매트릭스를 측정하고, cache가 정적 WGSL/자체 variant 생성기의 픽셀 의미를 바꾸지 않음을 제품 corpus에서 유지할 때만 기본 승격한다 | cache miss/compile failure/kill 시 직접 pipeline 생성 또는 기존 정적 WGSL 경로; bounded LRU budget 초과는 eviction/bypass |
| 23 | VRM surface brush (Three.js + three-mesh-bvh) | **제품 round-tip 레인 활성 검증 — 사람 품질·실 GPU 메모리 격리** | `tests/benchmarks/results/vrm-surface-brush-browser.json` schema v2. 실제 `public/vrm/sample.vrm` 5,307 vertices/8,864 triangles/2,048² atlas를 Three→BVH→surface provider→texture runtime으로 실행하고 두 commit **15.235/14.780ms**와 atlas byte equality를 고정했다. 31 warm samples의 full raycast→commit p50/p95/p99: 256² **1.905/3.980/4.205ms**, 512² **5.050/5.360/6.535ms**, 1,024² **14.810/17.775/18.310ms**. 후속 제품 배선에서 비테스트 `/studio` caller `StudioVrmPoser`가 R3F pointer down/move/up, 실제 `Intersection.faceIndex`, 압력·틸트, analytic camera scale을 bounded transaction(최대 2,048 samples·50,000 projected operations)으로 모아 기존 `BrushProgramIR`/`StrokeIR`→surface adapter→`StudioVrmTexturePaintRuntime` 단일 atlas commit을 정확히 1회 호출한다. pointercancel/leave/lost-capture/window blur/tool change/device loss/unmount는 실행 전 discard 또는 실행 중 atomic rollback으로 닫고, deterministic undo/replay와 seam-safe chart 분할을 7파일 **127/127** 집중 테스트 및 제품 boundary로 고정했다. UV delta 0, 필압 비양자화, cancel/upload rollback, interactive hot-path GPU readback 0. production-browser CSP artifact도 runtime event 0이다 | 권리 확보된 다중 실제 VRM corpus에서 사람 시각 품질/손맛 blind gate, 실제 resident GPU memory 또는 동등한 driver-budget 관측, Safari/Firefox·Windows/Linux·통합 GPU 장치 매트릭스와 장시간 texture churn을 통과할 때만 범용 기본 브러시로 승격한다. stamp/image tip과 smudge/wet mixing은 명시적 unsupported로 유지한다 | faceIndex/texel-density 근거가 없거나 V12 round capability를 충족하지 못하면 기존 texture-paint round-tip/2D brush 경로. provider·upload·cancel 실패는 atlas rollback 후 마지막 검증 texture 유지 |

## Vello-native SVG 제품 CPU preview 배선 (2026-08-09)

레인 13의 engine PoC를 실제 `/studio` Elements asset preview로 연결했다. 이 제품 표면은
`vello-svg-native`의 CPU RGBA thumbnail을 소비하며 interactive GPU Scene Fragment의 surface
ownership을 갖지 않는다.
`StudioElementsPanel`의 각 SVG tile은 `StudioSvgAssetPreview`를 거쳐 자산별
`StudioSvgProductTournament`를 실행한다. source/tree strict audit와 resvg 기준 symmetric 3×3 δ48
불일치 **≤2%**를 모두 통과한 경우에만 `vello-svg-native` CPU reference preview를 채택한다.
strict subset 밖이지만 FormatGateway warnings/unsupported가 0이면 editable SceneIR+CanvasKit,
의미 손실이 있으면 resvg, 신뢰된 font-dependent bundled source는 browser-native preservation으로
명시 라우팅한다. active/external SVG는 엔진 로드 전에 거부한다.

preview decision cache는 24 entries·8MiB RGBA·동시 2개로 bounded하고, 배치/drag는 변환된 frame이
아니라 원본 SVG asset을 계속 사용한다. 제품 preview API에는 GPU readback이 없고 기록값은 0B다.
관련 52개 제품/engine/visual 테스트와 루트 typecheck가 통과했다. 품질 수치는 기존 실제 Chromium
engine artifact `vello-svg-native-browser.json`(resvg SSIM 0.995692~0.997639,
GPU↔CPU fuzzy ≤0.030518%, GPU p50 약 3.0ms)을 재사용하되 이를 새 제품 UI 브라우저 실측으로
오표기하지 않는다. 실제 production UI browser artifact는 후속 장치 gate다.

## Google Ink 증분 메시 브리지 (2026-08-09)

레인 3의 다음 단계였던 upstream `InProgressStroke` 증분 API를 실제 Emscripten WASM 경계에
연결했다. `toon-ink-mesh-delta-v1`은 revision, append/update/noop, retained vertex/triangle prefix와
교체 tail만 전송하며 `applyInkStrokeMeshDelta()`가 stale revision, typed-array 길이, NaN/overflow,
index 범위를 검증한다. pressure·tilt·orientation을 stride-6 입력으로 보존하고 cancel/reset/dispose와
fault 시 C++ handle 파기를 고정했다. hot path GPU readback은 0이다.

`tests/benchmarks/results/ink-mesh-incremental.json`의 실제 커밋 WASM 240-point workload에서:

- 업데이트 p50/p95/p99: **0.069750/0.085750/0.108125ms**
- 기존 단발 remesh p50/p95/p99: 0.590625/1.110459/1.194333ms
- stroke p95: **2.401958ms** vs 18.728375ms
- WASM→JS payload: **11,336B** vs 80,396B(-85.90%)
- 40/40회 및 chunk 1/7/31/160에서 final vertex/UV/index가 단발 기준과 byte-identical
- final mesh SHA-256 `546e27bb72f7420d38c94ab0230793e22cf108bdd4b21c134079fb3b9cdde6cc`
- linear heap peak 16,973,824B, 최대 delta 564B, GPU readback 0

증분 경로를 기본 후보로 두되 현재 제품 renderer의 GPU buffer subrange upload와 predicted-input
replacement/multi-coat은 미배선이다. 기존 single-shot 경로는 강제 가능한 품질 기준·fallback으로
유지한다. 물리 태블릿/CSP 블라인드 결과 전에는 프로덕션 자동 승격으로 확대하지 않는다.

## Renderer tournament 릴리스 판정 (2026-08-10)

`tests/benchmarks/results/renderer-tournament-browser.json` schema v4의 최상위 판정은
`technicalPass=true`, `boundedHarnessPass=true`, `pass=true`, `status=pass`다. `pass`는
하위 호환용 bounded-harness 별칭일 뿐 제품 릴리스 승격을 뜻하지 않는다. 이전 실행의
`script-src: eval` event는 fresh Chromium page/context마다 Zod 4.4.3의 `new Function` 기능 탐지가
한 번 실행되면서 발생함을 재현했다. 제품 `/bootstrap-compat.js`와 production Vite 하니스가 모두
애플리케이션 module graph 평가 전에 Zod의 공식 `__zod_globalConfig.jitless=true` pre-bootstrap을
설정하도록 고정한 뒤, Chromium 140/Apple Metal WebGPU 재실행에서 CSP event **0건**,
console/page/request 오류 **0건**을 기록했다. schema v4는 CDP가 반환한 실제 Chromium argv에
JIT-disable flag가 없음을 검사하고, 별도 fresh context에서 `new Function`을 시도해 `EvalError`와
`script-src: eval` 1건을 관측하는 양성 대조군, bootstrap→dynamic page import를 고정한 Vite manifest
digest receipt, Zod core의 `globalConfig.jitless=true`와 `allowsEval.value=false` 런타임 receipt를 함께
요구한다. schema v4는 이 제한된 결과가 제품 릴리스 통과로 오인되지 않도록 최상위
`releasePass`를 제거하고 `boundedHarnessPass`로 대체한다. CSP를 완화하거나 Chromium `--jitless`를 사용하지 않았으며
`script-src 'self' 'wasm-unsafe-eval'`을 유지했다. 이 판정은 bounded renderer tournament의
strict-CSP 기술 게이트만 닫는다. artifact의 `cspNonInferiority=not-measured`,
`boundedCorpusOnly=true`, `productWidePromotion=false`는 유지하며, 외부 최신 CSP·동일 물리 태블릿의
사람 블라인드 품질 판정과 24h shadow/soak 전에는 제품 전체 승격이나 CSP 비열위를 주장하지 않는다.

## Vello Hub 제품 아일랜드 승격 (2026-08-09)

레인 2의 브라우저 패리티와 레인 16의 동일 `GPUDevice` 채택 증거를 실제 `/studio` 호출부에
연결했다. `StudioCanvasViewport`의 기존 renderer-neutral selection overlay seam을 첫 bounded
SceneIR 제품 아일랜드로 정하고, `StudioVelloHubSurface`가 기본 surface owner가 된다. Hub는
selection bounds만 별도 SceneIR로 낮춰 최대 2,048 CSS px·16,777,216 backing pixel 안에서
렌더한다. admission 초과 또는 CPU reference까지 실패한 경우에만 이유를 노출하고 Pixi가 단독
fallback owner로 복귀한다. Konva는 문서·입력·브러시 픽셀 권위를 계속 보유하므로 이 승격을
whole-canvas 완료로 확대 해석하지 않는다.

- `vello-classic-browser-gpu`: StudioGpuFabric의 `GPUDevice`를 객체 동일성으로 채택하고,
  Vello 산출 `GPUTexture`를 WebGPU canvas current texture로 GPU copy한다. 제품 표시 경로에는
  `getImageData`·`readPixels`·GPU→CPU readback이 없다.
- `vello-cpu-reference`: 초기 품질 권위와 WebGPU/device-loss/visual-gate 실패 fallback이다.
  완성된 CPU 프레임이 준비되기 전에는 현재 primary canvas를 지우거나 숨기지 않는다.
- 승격 정책: CPU 결과를 winner로 보존한 비동기 δ48 3×3 shadow gate(≤0.6%)를 통과하고,
  **해당 SceneIR 자체가** 통과했으며 실제 warm render p50이 12% 이상 우세할 때만 Classic으로
  전환한다. 같은 fingerprint bucket의 다른 장면은 이전 장면의 시각 승인을 빌리지 않는다.
  pen-down 중에는 이득과 무관하게 전환하지 않는다. shadow divergence/error와 device loss는
  winner cache를 퇴출하고 last-good-frame→CPU fallback transaction을 실행한다. 이때 CPU
  reference까지 실패하면 오류를 삼키지 않고 Hub 소유권을 종료해 Pixi fallback으로 명시 전환한다.
- 이 Classic 전환 영수증은 `admissionMode=scene-local-shadow-candidate`,
  `persistentWinnerStorage=false`, `productWidePromoted=false`다. 해당 장면의 in-memory 후보 판정일 뿐
  PromotionRegistry 승인이나 내구 winner가 아니며, 24h/shadow soak 없이 제품 전체 승격으로 바꾸지 않는다.
- Hybrid/Sparse GPU: 현 Vello 0.9 browser API에는 Classic만 있고 sparse strips는 vello_cpu
  레인뿐이므로 `unavailable-upstream-api` 후보로 명시한다. GPU Hybrid로 위장하거나 CPU
  descriptor 이름을 Hybrid 구현 증거로 사용하지 않는다.

자동 증거는 `studio-vello-hub.test.ts`, `studio-vello-hub-surface.test.tsx`,
`studio-vello-hub-canvas-target.test.ts`, `studio-vello-hub-product-wiring.test.ts`와 갱신된
`verify-studio-vello-candidate.mts`가 고정한다.
기존 기록형 whole-canvas 후보의 미통과 gate는 그대로 남지만, bounded 제품 seam을 blanket
`research-only`로 금지하던 검증 정책은 제거했다.

## 제품 저장 권위·파괴 인벤토리 정합성 (2026-08-10)

- 제품 기본 SQLite 연결은 Window가 아니라 단일 module Dedicated Worker가 소유한다. Window에서
  `FileSystemFileHandle.createSyncAccessHandle`이 실제 `false`인 Chromium production build에서도
  Worker의 `opfs-sahpool`은 정상 개방됐다. 제품 bootstrap은 sqlite-wasm의 불필요한 SharedArrayBuffer
  proxy VFS(`opfs`, `opfs-wl`) 설치를 끄고 SAH-pool만 유지한다. allowlist RPC 37개, protocol v1,
  request correlation, timeout, close-before-terminate를 계약으로 고정했다.
- 실제 빌드 same-origin 브라우저 증거에서 값을 write/read한 뒤 DB close·Worker terminate·문서 reload,
  새 Worker reopen/read가 byte-exact였고 delete 후 `null`, console error 0이었다. 이로써 이전의
  Window capability false-negative와 quick-slot 오류 banner를 해소했다. 다만 정상 close/reload
  증거이므로 process crash·전원 손실·browser-enforced quota·다중 탭 장기 contention은 레인 18/20의
  관측 항목으로 유지한다.
- AI 이미지 참조 메타데이터는 ProjectFile·snapshot·autosave·save payload에 포함되고, 실제 이미지
  바이트는 asset/CAS 참조로 분리된다. Creator Pack palette와 brush quick slot은 SQLite 권위를
  사용하며 legacy 자동 마이그레이션은 하지 않는다. 최종 병합 `main`에서 비테스트 caller 배선을
  다시 검증한다.
- Unsplash key, AI recent prompt/session setting, pose/full-poser clipboard는 sessionStorage 또는
  memory-only다. 이 항목을 SQLite 영구 창작 권위나 localStorage 장기 보관으로 승격하지 않는다.
- destructive cutover 인벤토리는 OPFS `studio-recovery`와 dotted exact key
  `toonspectrum.studio-marketplace-library.v1`, `toonspectrum.studio-creator-filter-presets.v1`,
  `toonspectrum.studio-filter-library.v12.fallback`, `toonspectrum.studio.bg3d.lt-presets.v1`,
  `toonspectrum.studio.bg3d.lt-presets.corrupt.v1`을 포함한다. 플랫폼 데이터 오삭제를 막기 위해
  광범위한 `toonspectrum.studio` prefix는 금지한다.

## Retained GPU 필터 표시 컷오버 (2026-08-10)

`StudioKonvaImageNode`의 interactive filter preview는 `presentGpuFilterChain()`이 반환한 GPU buffer를
동일 `GPUCanvasContext`에 직접 표시한다. 계산과 표시가 끝난 frame은 CPU staging buffer를 만들지
않으며, superseded frame은 `dispose()`로 해제한다. 조작이 settle된 최신 frame만
`readbackFinal()`을 한 번 호출해 canonical CPU 픽셀 권위를 인계한다. GPU 미지원, validation/OOM,
device loss 또는 presentation 실패는 Worker/Konva 경로로 fail-closed한다. 원본/결과의 정확한
마스킹 합성이 필요한 filter mask는 retained GPU 결과를 중간 readback하지 않고 기존 Worker 경로를
계속 사용한다.

`tests/benchmarks/results/gpu-filter-retained-presentation.json`의 Chromium 140 Metal WebGPU
512×512·6연산·40-frame 실측은 interactive `mapAsync` **0회**, settle canonical `mapAsync`
**정확히 1회**, retained canvas identity 40/40을 기록했다. GPU 제출+표시 p50/p95/p99는
**1.10/3.90/4.30ms**, 다음 rAF까지 포함한 visible p50/p95/p99는
**16.70/17.90/18.50ms**, 표시 canvas와 canonical readback의 RGB/alpha 최대 오차는 모두
**0/255**였다. 품질 검증용 `getImageData`는 simulated drag 종료 후 하니스에서만 실행했고 제품
interactive 코드에는 없다. 실제 CSP 비교·Windows/Linux/통합 GPU/mobile WebGPU는 이 결과로
통과 처리하지 않는다.

## Living Ink 투명 표면·양 backend 품질 승격 (2026-08-10)

Living Ink는 문서 전체를 불투명 paper로 덮지 않고 straight-alpha wash surface를 출력한다. WebGL2는
RGBA8 staging FBO readback 하나를 receipt와 `ImageBitmap`의 공통 권위로 사용하고, WebGPU도 같은
surface를 브라우저 source-over로 명시적 문서 위에 합성한다. 부분 alpha의 straight RGB는 Canvas
premultiply/unpremultiply 왕복에서 보존될 수 없으므로 새 receipt는 browser-preserved
`premultiplied-rgba8-v2`를 해시한다. encoding 없는 기존 v1 receipt는 읽기 호환만 유지한다.

WebGL2의 저밀도 침전 응답은 `centerDensity <= 0.035`에서 추가 4.6×를 적용하고 0.2까지 smoothstep으로
기준 1×에 복귀한다. 따라서 isolated granulation은 **1.50459**로 gate 1.5를 통과하면서 continuous
stroke max jump/min-to-median은 **0.18487/0.71008**로 유지된다. WebGPU는 bottom-left page space와
top-down field의 모든 방향 벡터를 같은 basis로 변환하고 capillary tensor determinant를 보존한다.
결과 aspect/granulation/continuous max jump는 **1.32857/1.51745/0.13288**이며 WebGL2의
**1.31884/1.50459/0.18487**와 모두 기존 임계 안이다.

`tests/benchmarks/results/living-ink-probe.json`의 실제 Chromium 140 Dedicated Worker + OffscreenCanvas
dual-lane 결과는 양 backend `failures=[]`, WebGPU parity `reached`, 81-operation deferred endpoint exact,
ACK readback/ImageBitmap 0/0, journal reload·crash recovery·near-black parity exact를 기록한다. 이는 자동
물성 품질·복구 승격이며 최신 CSP와 동일 태블릿의 사람 손맛 블라인드 판정을 대체하지 않는다.

## 결과

- 프런티어 실패가 은폐되지 않고 레인 단위로 기록·강등되며, 전체 phase 진행이 유지된다(§10/§15 충족).
- 완료 보고의 `Known failures and quarantined providers` 항목은 본 원장을 인용하는 것으로 표준화된다.
- 폴백 레인(vello_cpu·CanvasKit·perfect-freehand+Kurbo·정적 WGSL·React 19·Three.js)이 명시적으로
  고정되어, 프런티어 레인의 성패가 출하 품질을 흔들지 않는다.
- 최종 release blocker는 유효한 24h soak raw artifact와 외부 최신 CSP·동일 물리 태블릿의 사람 운영
  blind lab이다. 모든 변경을 합친 `main` 커밋 후보의 엔진·아키텍처·라이선스·production build·브라우저
  gate는 통과했으며 push hook에서 같은 HEAD의 `verify:push`를 반복한다. 앞의 두 외부 게이트는 완료로
  표시하지 않는다.

## 재검토 조건

- 레인 2: ~~실브라우저 WebGPU 구동 패리티 실측이 나올 때(통과 → fork 트랙 개설, 실패 → 원인과 함께 강등 기록)~~ → 2026-08-08 패리티 통과 후 **fork 트랙 개설 완료**(`crates/vendor/wgpu-toon`, 2빌드 트랙, `docs/engines/vello-baseline.md` §3). 다음 재검토 = (a) vello가 wgpu 핀을 30 이상으로 올릴 때(패치 1~3은 상류 백포트라 즉시 폐기, 4만 남는다), (b) `Device::from_webgpu_handle` 상류 PR 결과가 나올 때, (c) V12 §5.3 patch backlog 2번(외부 GPUTexture import 실사용)·4번(scene fragment 증분 compile) 착수 시. §5.4 90일 규칙 기산일 = 2026-08-08.
- 레인 3: ~~emsdk/Bazel 재현 빌드가 구축되거나 상류가 공식 WASM/웹 배포를 제공할 때~~ → 2026-08-08 emsdk 재현 빌드·PoC 실측 완료(1차 stroke-modeler + 2차 §11.2 mesh 레인, 레인 행 참조). 다음 재검토 = 블라인드 선호 랩 세션 확보 시(레인 8과 공유), 상류 커밋 핀 변동 시, 또는 §11.2 다음 단계 착수 시(3단계: mesh delta 증분 API — 현행 브리지는 single-shot 전체 mesh, `InProgressStroke` 증분 표면은 wasm에 이미 포함되어 브리지 확장만 필요; 4단계: Emdawnwebgpu 동일 디바이스 buffer/texture 공유 — 레인 16의 toon-vello adoption 백로그와 합류).
- 레인 5: ~~BrushGraph/EffectGraph가 커스텀 WGSL variant를 생성하기 시작할 때(재개)~~ → 2026-08-08 재개, wesl-js 0.7.28 실도입 완료(도전자). 이후 재검토는 wesl 상류 버전 변동(핀 `^0.7.28` 재조사), wesl-rs(Rust측) 채용 검토, 또는 도전자 승격 판정(실사용 표면 우위 실측) 시.
- 레인 6: ~~격리(웹 타깃 실험 단계)~~ → 2026-08-08 빌드 게이트 통과·실구동 실측 완료(레인 행 참조). 이후 재검토는 (a) masonry 차기 릴리스가 wasm 패키징 수정을 발행해 로컬 패치가 불필요해질 때, (b) masonry가 vello 0.9+ 로 추격해 이중 vello 없이 리포 파이프라인과 정합될 때, (c) §8 승격 게이트 A/B(오버레이 대비 latency·IME·AccessKit 투영) 하니스 실측이 나올 때.
- 레인 7: bevy_vello가 Vello 0.9+ 대응을 릴리스할 때.
- 레인 9: 8h soak는 통과 완료했다. 다음 재검토는 `SOAK_MINUTES=1440` 24h 런이 raw artifact와
  함께 완주될 때이며, 그 전에는 24h 통과를 주장하지 않는다.
- 공통: 각 레인의 게이트 실측 결과가 나올 때마다 본 원장을 갱신하며, 상태 전이는 §결정 3에 따른다.
