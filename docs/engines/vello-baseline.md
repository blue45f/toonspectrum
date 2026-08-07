# Vello Baseline Pin (V12 §4.1)

- 요구 근거: `docs/architecture/ToonStudio_Codex_Vello차세대엔진_공격적활용_기존Studio전면교체_V12_2026-08-08.md` §4.1
  — "정확한 commit, Cargo.lock, source URL, license를 `docs/engines/vello-baseline.md`에 기록한다."
- 핀의 단일 진실 원천: `crates/studio-engine-vello/Cargo.lock` (아래 버전 전부 이 파일에서 실측).
  직접 의존 선언은 `crates/studio-engine-vello/Cargo.toml`.
- 라이선스는 로컬 crates.io 레지스트리 캐시의 각 크레이트 `Cargo.toml` `license` 필드 실측값이며,
  `docs/architecture/ToonStudio_V12_차세대엔진_승격게이트_매트릭스.csv`(이하 V12 매트릭스)의 라이선스 열과 대조했다.

## 1. 핀 표 (Cargo.lock 실측, 2026-08-08)

| 크레이트 | 핀 버전 (Cargo.lock) | 라이선스 (manifest 실측) | 소스 URL | V12 역할 (매트릭스 v12_role 요약) |
| --- | --- | --- | --- | --- |
| vello (Classic) | 0.9.0 | Apache-2.0 OR MIT | https://crates.io/crates/vello · https://github.com/linebender/vello | 경로 수가 많고 매 프레임 변경되는 벡터 아일랜드. `gpu` 피처 뒤의 optional 의존(wasm PoC 레인)이자 네이티브 검증용 dev-dependency |
| vello_cpu | 0.2.0 | Apache-2.0 OR MIT | https://crates.io/crates/vello_cpu · https://github.com/linebender/vello/releases | 결정적 기준 렌더·썸네일·시각 회귀·GPU 장애 복구 (기준 백엔드) |
| vello_common | 0.2.0 | Apache-2.0 OR MIT | https://crates.io/crates/vello_common | Sparse Strips 공통 하부 — vello_cpu가 소비하는 경로·페인트·타일 공통층(Hybrid 장면 허브 후보의 공통 기반) |
| kurbo | 0.13.1 | Apache-2.0 OR MIT | https://crates.io/crates/kurbo · https://github.com/linebender/kurbo | ToonStudio 공통 2D 기하 언어 (Bezier·stroke outline·trim·guides) |
| peniko | 0.6.1 | Apache-2.0 OR MIT | https://crates.io/crates/peniko · https://github.com/linebender/peniko | Paint·Gradient·Image·Blend 공통 표현 |
| color (Linebender Color) | 0.3.3 | Apache-2.0 OR MIT | https://crates.io/crates/color · https://github.com/linebender/color | 광색역·CSS Color 4·ACES/ProPhoto 색 변환 |
| parley | 0.11.0 | Apache-2.0 OR MIT | https://crates.io/crates/parley · https://github.com/linebender/parley | 다국어 문단·말풍선·줄바꿈·편집 레이아웃 (Vello glyph layout source) |
| fontique | 0.11.0 | Apache-2.0 OR MIT | https://crates.io/crates/fontique (parley 저장소) | 폰트 탐색·fallback (Parley 하위 기반) |
| harfrust | 0.10.0 | MIT | https://crates.io/crates/harfrust | 텍스트 shaping (Parley 하위 기반) |
| skrifa | 0.42.1 / 0.43.2 / 0.44.0 (3중 핀) | MIT OR Apache-2.0 | https://crates.io/crates/skrifa | 폰트 outline·metrics. 0.42.1=vello 0.9.0·vello_encoding 소비, 0.43.2=직접 의존(`skrifa = "0.43"`)·parley 소비, 0.44.0=glifo 소비 |
| ICU4X (icu_* 11종) | 2.2.0 (전부 동일) | Unicode-3.0 | https://crates.io/crates/icu_segmenter 외 | 언어 분절·정규화·속성 (Parley 하위 기반). icu_collections·icu_locale·icu_locale_core·icu_locale_data·icu_normalizer(+data)·icu_properties(+data)·icu_provider·icu_segmenter(+data) |
| wgpu (+ wgpu-core/hal/types) | 29.0.4 (전부 동일) | MIT OR Apache-2.0 | https://crates.io/crates/wgpu · https://github.com/gfx-rs/wgpu | 단일 GPUDevice·Queue·자원·프로파일링 허브. 현재 핀은 **upstream-compatible 트랙(wgpu 29)** — 매트릭스의 wgpu 30 experimental track은 next 트랙(§3 참조) |
| naga | 29.0.4 | MIT OR Apache-2.0 | https://crates.io/crates/naga | WGSL validation·reflection·backend translation (vello_shaders 경유) |

보조 핀(같은 Cargo.lock 실측, 위 크레이트가 끌어오는 Vello 생태계 내부 크레이트):

| 크레이트 | 핀 버전 | 라이선스 | 역할 |
| --- | --- | --- | --- |
| glifo | 0.3.0 | Apache-2.0 OR MIT | 글리프 아틀라스·반복 텍스트 캐시 (vello_cpu 텍스트 경로) |
| vello_encoding | 0.9.0 | Apache-2.0 OR MIT | vello 0.9.0 장면 인코딩 내부 크레이트 |
| vello_shaders | 0.9.0 | Apache-2.0 OR MIT | vello 0.9.0 WGSL 셰이더 번들 (naga 소비자) |

라이선스 대조 결과: Linebender 계열·wgpu·naga는 V12 매트릭스의 `MIT OR Apache-2.0` 표기와 일치한다
(manifest 표기 순서만 `Apache-2.0 OR MIT`로 다른 경우 있음 — 동일 듀얼 라이선스).
매트릭스 11행(Fontique + HarfRust + Skrifa + ICU4X)의 `각 프로젝트 고지`는 본 표의 실측값으로 구체화된다:
fontique `Apache-2.0 OR MIT` / harfrust `MIT` / skrifa `MIT OR Apache-2.0` / icu_* `Unicode-3.0`.

## 2. 이미 실측된 증거

- **Vello GPU(Classic) 네이티브 패리티** — `tests/benchmarks/results/vello-gpu-native.json`
  (하니스 `crates/studio-engine-vello/tests/gpu_parity.rs`, vello 0.9.0 wgpu Metal headless vs vello_cpu 0.2.0):
  7개 장면 중 6개 퍼지 불일치 **0.0000%**, `03-curves`만 0.0366%(≈0.037%, 게이트 0.6%의 1/16).
  GPU p50 1.54~1.62ms / 128²(readback 포함, 테스트 전용 증거 수집).
- **vello_cpu 골든 코퍼스** — `tests/corpus/vector/golden`
  (8개 장면 `*.vello-cpu.png`, 01-solid-shapes~08-dense-lineart).
- **cross-renderer diff 게이트** — `tests/visual/cross-renderer-diff.test.ts` +
  `tests/benchmarks/results/cross-renderer-diff.json`: CanvasKit 0.41.1(CPU surface) vs vello_cpu 0.2.0,
  대칭 3×3 근방·채널당 δ≤48 퍼지 비교, 게이트 0.5%. 최악 장면 `03-curves` 0.0732%로 통과,
  평탄 영역 장면(04~07)은 0 유지.
- **wasm32 + vello(GPU) + wgpu 빌드 성공 (2026-08-08)** —
  `crates/studio-engine-vello`에서 `cargo build --release --target wasm32-unknown-unknown --features gpu`
  → `` Finished `release` profile [optimized] target(s) in 21.28s `` (빌드 로그 실측).
  산출물 `target/wasm32-unknown-unknown/release/studio_engine_vello.wasm` = 4,406,493바이트(≈4.4MB,
  opt-level="s"+LTO). 컴파일 목록에 vello 0.9.0·wgpu 29.0.4·wgpu-types 29.0.4·wasm-bindgen-futures 0.4.76
  포함 — Vello GPU 레인이 wasm32 타깃에서 링크됨을 실증. `gpu` 피처는 기본 wasm-pack 산출물에서 제외되는
  optional lane이다(`crates/studio-engine-vello/Cargo.toml` 주석).
- **실브라우저 WebGPU 구동 패리티 (2026-08-08)** — `tests/benchmarks/results/vello-gpu-browser.json`
  (하니스 `packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts`):
  Chromium 140.0.7339.186(playwright headless shell, `--enable-unsafe-webgpu --enable-features=WebGPU
  --use-angle=metal`)에서 wgpu `BrowserWebGpu` 어댑터 획득·렌더·readback 성공. 7개 장면 중 6개 퍼지
  불일치 **0.0000%**, `03-curves` 0.0366% — 네이티브 Metal 레인(§2 첫 항목)과 동수치, 게이트 0.6%.
  GPU p50 2.6~2.8ms / 128²(readback + wasm-bindgen JSON 경계 포함, 프로브 전용 증거 수집).
  재실행 커맨드:
  `VELLO_GPU_BROWSER_PROBE=1 pnpm exec vitest run packages/studio-engine-vello/src/__tests__/gpu-browser-probe.test.ts`
  (repo를 로컬 HTTP로 서빙하고 Playwright Chromium → 시스템 Chrome headless → headed 순서로
  WebGPU 어댑터를 탐색한다).
- **pkg-gpu 산출물 파이프라인 (2026-08-08)** — GPU 레인은 별도 배포물
  `crates/studio-engine-vello/pkg-gpu/`로 커밋된다(기본 CPU `pkg/`는 바이트 불변 유지). 재현 절차:
  1. `wasm-pack build --target web --release --out-dir pkg-gpu -- --features gpu`
     (wasm-opt 포함, 산출 wasm 4,256,707B≈4.26MB, 빌드 19.76s/전체 33.21s 실측)
  2. `pkg-gpu/.gitignore` 삭제 + 생성 JS(`studio_engine_vello.js`) 머리에
     `// @generated by wasm-pack …` + `/* eslint-disable */` 배너 2줄 선두 삽입
     (루트 eslint flat config가 `pkg/`만 ignore하므로 생성물 배너로 게이트 통과 — 배너 포함 상태가 핀 대상)
  3. `shasum -a 256 package.json studio_engine_vello.d.ts studio_engine_vello.js
     studio_engine_vello_bg.wasm studio_engine_vello_bg.wasm.d.ts > INTEGRITY.sha256`
  `scripts/verify-studio-engine.mjs`가 `pkg/`와 `pkg-gpu/` 두 매니페스트를 모두 검증한다.
  JS 경계: `packages/studio-engine-vello/src/gpu-browser.ts`(`loadVelloGpuBrowser`·`probeWebGpu`·
  `renderSceneToPixelsGpu`·`compareGpuVsCpu`, 동적 import로 CPU 번들 무영향), Rust 경계:
  `src/gpu_web.rs`(wasm32+`gpu` 전용), 장면 인코딩은 네이티브 패리티 하니스와 공용 `src/gpu_scene.rs`.

## 3. vendor/fork 전략 (V12 §6) — 승격 게이트 통과 전 미개설

V12 Codex §6은 `toon-vello` fork를 현 저장소 안에서 다음 구조로 관리하도록 규정한다.

```text
vendor/vello-upstream
patches/vello
engines/vello-adapter
```

그리고 두 CI 빌드 트랙을 유지한다.

```text
upstream-compatible: Vello upstream + wgpu 29
next:                toon-vello patches + wgpu 30
```

**현재 상태: 미개설.** 위 디렉터리와 next 트랙은 아직 만들지 않으며, 현재는 §1의 crates.io 핀
(= upstream-compatible 트랙, wgpu 29.0.4)만 사용한다. fork는 "숨은 임시 패치"가 아니라 정식 제품
자산이어야 하므로, 유지 비용을 정당화할 실측 근거가 생기기 전에는 개설하지 않는다.

**개설 조건**: 레인 2(Vello GPU WebGPU wasm)가 **실브라우저 WebGPU 실구동 패리티 게이트를 통과**했을 때
(네이티브 패리티와 동일한 퍼지 게이트 + 성능 실측을 브라우저에서 재현). 그 시점부터 §6의 patch backlog
(external texture import/export, `as_webgpu` PoC, scene fragment cache, device-loss recreation 등)를
독립 커밋 + upstream 가능성 메모 규율로 착수한다. 그 전까지의 실패·격리 기록은 ADR-0011 원장이 담당한다.

**조건 충족 (2026-08-08)**: §2의 실브라우저 WebGPU 패리티 실측(Chromium 140, 7장면 게이트 통과,
`tests/benchmarks/results/vello-gpu-browser.json`)으로 개설 조건이 충족되었다. fork 디렉터리·next 트랙
개설 자체는 별도 트랙으로 착수한다(ADR-0011 레인 2 유지 게이트) — 본 문서 §1 핀은 그때까지
upstream-compatible 트랙 단일 소스로 유지된다.

## 4. Velato Lottie 레인 (ADR-0011 Velato 레인, 2026-08-08)

- **핀**: velato 0.11.0, `Apache-2.0 OR MIT`,
  https://crates.io/crates/velato · https://github.com/linebender/velato.
  crates.io 인덱스 실측(2026-08-08): 0.9.x/0.10.x는 `vello ^0.7.0` 의존이라 본 리포 핀(0.9.0)과
  비호환, **0.11.0이 `vello ^0.9.0`·`kurbo ^0.13`·`peniko ^0.6` 의존**으로 §1 핀과 단일 버전으로
  유니파이된다(rust-version 1.88 ≤ 로컬 rustc 1.97.1). Cargo.toml 피처:
  `lottie = ["gpu", "dep:velato"]` — gpu 피처의 strict superset.
- **경계**: Rust `crates/studio-engine-vello/src/lottie.rs`
  (velato Composition 파싱→frame 시점 vello 0.9 Scene 하강, `src/gpu_web.rs`
  `render_lottie_gpu_json`이 SceneIR 레인과 공용 텍스처/readback 경로 재사용),
  TS `packages/studio-engine-vello/src/lottie.ts`(`renderLottieToPixelsGpu`,
  `LottieRenderError`). 에러 계약: 파싱 실패·미지원 구성·범위 밖 프레임·비정상 크기는 전부
  `{"code":"lottie-*","reason":"..."}` JSON 명시 에러 — 조용한 빈 프레임 없음.
- **패닉 격리 (velato 0.11.0 소스 실측)**: velato importer(`Composition::from_slice`)는
  레이어 회전(`ks.r`) 부재/분리, 셰이프 트랜스폼 분리 위치/회전, 비-precomp 에셋(이미지),
  Add(16)/HardMix(17) 블렌드에서 `todo!()`/`unimplemented!()`로 패닉한다(wasm abort).
  `src/lottie.rs`의 스키마 사전 검증이 이 구성 전부를 importer 도달 전에
  `lottie-unsupported` 명시 에러로 변환한다(네이티브 게이트로 고정:
  `tests/lottie_parity.rs` `parse_rejects_*`).
- **실측 증거**:
  - 네이티브(Metal): `crates/studio-engine-vello/tests/lottie_parity.rs` 8테스트 —
    직접 저작 픽스처 2종(`tests/fixtures/lottie/translating-square.json`·`rotating-bar.json`,
    외부 다운로드 없음)에서 프레임 0/30/60 바이트 동일 결정성, 위치 키프레임 중간값(선형 96px)
    실보간, 0°→90° 회전 실측, 캔버스 밖 완전 클리핑(전 픽셀 0), 자유 스케일(64²≈256px²·
    256²≈4096px² 커버리지) 검증.
  - 실브라우저(WebGPU): `tests/benchmarks/results/velato-lottie-browser.json`
    (하니스 `packages/studio-engine-vello/src/__tests__/lottie-browser-probe.test.ts`,
    `VELLO_LOTTIE_BROWSER_PROBE=1`): Chromium 140.0.7339.186 headless, wgpu `BrowserWebGpu`
    어댑터에서 2픽스처×3프레임 전부 결정성 통과, 프레임 상호 상이 + 클리핑 재현,
    p50 3.1~3.3ms / 128²(JSON 파싱+velato 하강+렌더+readback+JS 경계 포함).
- **산출물 갱신**: `pkg-gpu/`는 이제
  `wasm-pack build --target web --release --out-dir pkg-gpu -- --features lottie`로 빌드한다
  (lottie ⊃ gpu — SceneIR GPU 레인 동일 포함, 재빌드 후 §2 실브라우저 패리티 프로브 재실행으로
  7장면 동수치 재확인). wasm 4,256,707B → **4,595,864B**(+339,157B, +8.0% — velato 하강 비용).
  §2 재현 절차 2단계(수동 배너 삽입)는 더 이상 필요 없다: 루트 eslint flat config가
  `crates/studio-engine-vello/pkg-gpu/**`를 ignore하므로 wasm-pack 생성물 원본이 그대로 핀 대상이다.
  INTEGRITY.sha256은 §2와 동일한 shasum 절차로 재생성.
