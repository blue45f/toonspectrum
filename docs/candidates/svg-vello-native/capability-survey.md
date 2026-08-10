# SVG Vello-native 후보 역량 조사

- 범위: V12 `vello_svg` 기반 정적 SVG → Vello Scene → 브라우저 WebGPU island
- 판정 기준일: 2026-08-09 KST
- 원시 결과: `tests/benchmarks/results/vello-svg-native-browser.json`
- 품질 우선 원칙: 속도가 빨라도 resvg 기준 품질·명시적 미지원 게이트를 통과하지 못하면 승격하지 않는다.

## 버전 호환성 조사

`crates/studio-engine-vello/Cargo.lock`의 기준선은 Vello 0.9.0, vello_cpu 0.2.0,
Kurbo 0.13.1, Peniko 0.6.1, wgpu 29.0.4다. crates.io의 실제 메타데이터를 비교한 결과:

- `vello_svg 0.9.x`는 Vello 0.7 계열이라 현재 핀과 불일치한다.
- **`vello_svg 0.10.0`은 `vello = 0.9.0`, `usvg = 0.46.0`을 요구**하므로 현재
  스택과 정확히 단일화된다. `cargo check --features svg`, 네이티브 테스트, wasm32 빌드가 모두 통과했다.
- 따라서 버전 비호환 격리는 필요 없다. 다만 upstream이 SVG 완전 구현이 아니며 resvg 사용을
  권장하므로, 지원 표면은 source audit와 정규화 tree audit가 허용한 strict subset으로만 제한한다.

## 후보 비교

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **vello_svg 0.10.0 + usvg 0.46 + Vello 0.9 WebGPU** | SVG를 Vello Scene으로 직접 내려 동일 GPU scene/island에 합성한다. SceneIR 재직렬화와 raster handoff가 없다. 현재 Vello 핀과 정확히 단일화 | text, image, pattern, mask, filter, marker, use/symbol, nested SVG, 외부 참조, objectBoundingBox/복합 clip은 사전 거부 | resvg 대비 SSIM **0.995692~0.997639**, PSNR **36.841~42.790dB**, 퍼지 불일치 최대 **0.036621%**. GPU↔동일 tree CPU 최대 **0.030518%** | 브라우저 GPU @128²: curves **3.0/3.2/3.2ms**, gradients **3.0/3.1/3.2ms**, clip **3.0/3.4/3.6ms** | 브라우저 JS heap 관측 증가 0B; 픽셀+readback 각 65,536B. WebGPU heap peak는 API 부재로 미실측 | 기존 GPU wasm 4,627,278B → **5,744,423B**, +1,117,145B(+24.143%). 별도 lazy-load GPU 번들 | 반복 GPU readback byte-equal. 장치 간에는 δ48 tolerance 계약 | vello_svg/usvg/Vello: MIT OR Apache-2.0 | **낮음**: Vello island 내부 scene 직결. hot path readback 없음 | 중간: Vello alpha 상태와 vello_svg 사양 공백. strict scanner와 버전 핀으로 제한 | **strict subset의 조건부 WebGPU preview/island 승격.** final correctness는 resvg가 소유 |
| **기존 custom SVG → SceneIR → vello_cpu/CanvasKit** | 안정적인 ToonStudio IR로 편집·저장·renderer 전환 가능. warnings/unsupported를 제품 UX에 연결 가능 | text/use/image/symbol/pattern/filter/mask/style 등 미지원. objectBoundingBox clip과 일부 gradient 의미는 경고/근사 | 같은 코퍼스 resvg 대비 평균 SSIM **0.996422**; native와 사실상 동률. curves PSNR 36.828dB로 native 36.841dB보다 아주 근소하게 낮음 | Node end-to-end gradients **3.844/3.994/4.188ms** | 관측 RSS delta **278,528B**(20 samples; true peak 아님) | 기존 코드/CPU pkg 사용으로 이번 증분 0B | 동일 입력 반복 byte-equal | ToonStudio internal; 소비 엔진별 고지 | 중간: SVG→IR 변환 후 renderer별 재하강. 대신 편집 상호운용성이 가장 높음 | 중간: 자체 XML/path/gradient 의미를 계속 유지해야 함 | **편집 가능한 SVG import의 주 경로.** strict native 미지원 또는 편집 요구 시 선택 |
| **resvg-wasm 2.6.2 / tiny-skia reference** | 정적 SVG 정확도와 넓은 사양 커버리지. 독립 기준 renderer로 두 후보의 공통 오류를 탐지 | ToonStudio IR/Vello Scene을 만들지 않으며 직접 편집·동적 island 합성에 부적합 | 본 실험의 품질 심판. 반복 출력 결정적 | Node end-to-end gradients **0.642/1.008/1.031ms** | 관측 RSS delta **65,536B**(20 samples; true peak 아님) | wasm **2,478,606B**. final/export Worker lazy load 적합 | 동일 입력 반복 byte-equal | npm package: **MPL-2.0** | raster 결과를 texture/image로 넘겨야 하므로 native scene보다 높음 | 낮음~중간: 성숙한 reference 역할, 다만 npm 핀은 2.6.2 | **정적 SVG final/reference 소유자.** native 승격·회귀의 심판 |

## 품질 판정

세 후보 중 resvg가 정적 SVG final/reference에 가장 적합하다. vello_svg native와 기존 custom SceneIR의
현재 코퍼스 품질은 사실상 동률이며, native가 평균 SSIM에서 0.00000033, curves PSNR에서 0.013dB
앞선 정도다. 이 차이를 과장하지 않는다. native의 채택 이유는 품질 손실 없이 Vello Scene에 직접
들어가 GPU island 합성 비용을 줄인다는 점이며, 편집 의미가 필요한 자산은 계속 SceneIR 경로가 맡는다.

## 명시적 격리 목록

다음 의미는 렌더 전에 `svg-native-unsupported`로 거부한다. vello_svg의 기본 빨간 오류 박스나 clip
bbox 근사는 성공으로 취급하지 않는다.

- text 및 폰트 의존 의미
- raster image/data URL/external URL
- pattern, mask, filter, marker
- use, symbol, nested SVG
- 외부 참조·스크립트/event attribute·DOCTYPE
- objectBoundingBox clip, 다중/중첩 clip geometry, even-odd clip rule
