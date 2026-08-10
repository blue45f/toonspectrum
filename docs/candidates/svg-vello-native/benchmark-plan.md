# SVG Vello-native 벤치마크 계획과 실행 결과

## 코퍼스

다운로드 자산 없이 직접 작성한 128×128 SVG 세 개를 사용한다.

| Fixture | 핵심 의미 |
| --- | --- |
| `curves.svg` | cubic/quad, closed fill, round stroke cap, opacity |
| `gradients.svg` | object-bounding-box linear/radial gradient, stops, rounded shape |
| `clip.svg` | local gradient reference, single-path clip, group opacity, stroke |

unsupported gate는 별도 생성 문자열로 text, image, pattern, mask, filter, 복합 clip을 각각 검사한다.

## 지표와 게이트

- quality reference: resvg-wasm 2.6.2의 RGBA8 결과
- PSNR 및 8×8 luma SSIM
- 기존 cross-renderer와 동일한 대칭 3×3 neighborhood, 채널 δ48 퍼지 불일치
- 반복 byte equality로 결정성 확인
- 20회 warm timing의 nearest-rank p50/p95/p99
- Node RSS 관측 delta, 브라우저 JS heap 관측 delta, 명시적 pixel/readback allocation
- GPU heap peak는 WebGPU 표준 telemetry 부재로 수치를 만들지 않는다.

| Gate | 기준 | 결과 |
| --- | --- | --- |
| native CPU vs resvg SSIM | ≥ 0.95 | **0.995692~0.997639 PASS** |
| native CPU vs resvg fuzzy | ≤ 2% | **최대 0.036621% PASS** |
| browser GPU vs sibling CPU fuzzy | ≤ 0.8% | **최대 0.030518% PASS** |
| 반복 결정성 | byte-equal | **CPU/GPU 모두 PASS** |
| unsupported 의미 | render 전에 typed rejection | **12종 PASS** |

## 실측 결과

### resvg 품질 비교

| Fixture | Native PSNR / SSIM / fuzzy | Custom SceneIR PSNR / SSIM / fuzzy |
| --- | --- | --- |
| curves | **36.841dB / 0.995936 / 0.036621%** | 36.828dB / 0.995935 / 0.036621% |
| gradients | **39.836dB / 0.995692 / 0%** | 39.836dB / 0.995692 / 0% |
| clip | **42.790dB / 0.997639 / 0.006104%** | 42.790dB / 0.997639 / 0.006104% |

### Node end-to-end gradients (audit/parse/render 포함)

| Candidate | p50 | p95 | p99 | 관측 RSS delta |
| --- | ---: | ---: | ---: | ---: |
| vello_svg native CPU sibling | **3.552ms** | **3.712ms** | **3.866ms** | 147,456B |
| custom SVG→SceneIR→vello_cpu | 3.844ms | 3.994ms | 4.188ms | 278,528B |
| resvg reference | 0.642ms | 1.008ms | 1.031ms | 65,536B |

### Chromium 140 WebGPU (BrowserWebGpu/Metal, 20 samples)

| Fixture | GPU p50/p95/p99 | embedded CPU p50/p95/p99 | GPU↔CPU fuzzy |
| --- | --- | --- | ---: |
| curves | **3.0 / 3.2 / 3.2ms** | 2.1 / 2.3 / 2.4ms | 0.030518% |
| gradients | **3.0 / 3.1 / 3.2ms** | 3.0 / 3.2 / 3.2ms | 0% |
| clip | **3.0 / 3.4 / 3.6ms** | 3.5 / 3.7 / 3.8ms | 0% |

소형 128² 장면은 GPU readback과 JS 경계 비용이 지배하므로 이 수치만으로 대형 scene 처리량 우위를
주장하지 않는다. interactive 채택 근거는 품질 동률과 Vello Scene 직결이며, 대형 SVG는 별도 corpus가
생길 때 재측정한다.

## 재현

```bash
cargo test --features svg --test svg_native -- --nocapture
pnpm exec vitest run tests/visual/svg-vello-native.test.ts
VELLO_SVG_BROWSER_PROBE=1 pnpm exec vitest run \
  packages/studio-engine-vello/src/__tests__/svg-vello-browser-probe.test.ts
```

브라우저 프로브 전에는 다른 WebGPU benchmark 프로세스가 없는지 확인해 GPU 경합을 피한다. 원시 JSON은
`tests/benchmarks/results/vello-svg-native-browser.json`에 고정한다.
