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
  남은 게이트: 실브라우저 WebGPU 구동(디바이스 획득·렌더·패리티·성능) —
  `docs/adr/0011-v12-frontier-quarantine-ledger.md` 레인 2.

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
