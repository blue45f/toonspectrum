# SVG Vello 제품 benchmark 계획과 gate

## 이미 확보한 engine 증거

원시 파일 `tests/benchmarks/results/vello-svg-native-browser.json`은 macOS arm64, Node 24.16.0, Chromium 140.0.7339.186, WebGPU Metal에서 직접 작성한 curves/gradients/clip 128² 코퍼스를 측정했다.

- resvg 대비 Vello CPU: SSIM 0.995692~0.997639, 퍼지 불일치 0~0.036621%
- GPU↔CPU: 퍼지 불일치 0~0.030518%, 반복 byte-equal
- Node end-to-end Vello CPU: p50/p95/p99 3.552/3.712/3.866ms
- Node resvg: p50/p95/p99 0.642/1.008/1.031ms
- GPU: fixture별 p50 3.0ms, p95 최대 3.4ms, p99 최대 3.6ms

## 제품 acceptance gates

| Gate | Threshold | Failure action |
| --- | --- | --- |
| strict source/tree audit | 모든 의미 허용 목록 내 | SceneIR 또는 resvg fallback |
| per-asset visual equivalence | symmetric 3×3 δ48 mismatch ≤2% | resvg winner |
| source preservation | click/drag가 original SVG와 byte-equivalent data URL 사용 | release blocker |
| silent-loss ledger | SceneIR editable route는 warnings=0, unsupported=0 | resvg + ledger surface |
| interactive GPU readback | 정확히 0B | release blocker |
| cache/backpressure | ≤24 entries, ≤8MiB RGBA, concurrency ≤2 | fail test |
| deterministic routing | 같은 source/dimensions → 같은 digest와 cached decision | fail test |

## 자동 검증

- `studio-svg-vello-product-router.test.ts`: audit/gate/fallback/security/cache 계약
- `StudioElementsPanel.test.tsx`: 실제 tile이 tournament를 호출하고 원본 item을 배치하는 계약
- `studio-svg-vello-product-wiring.test.ts`: `/studio` lazy popover부터 preview, placement authority, CPU-only API 연결
- `studio-interchange-capabilities.test.ts`: UI보다 과장되지 않은 partial/available truth

브라우저 제품 artifact를 새로 만들지 못하더라도 engine Chromium artifact를 제품 caller 실측으로 오인하지 않는다. 제품 UI 브라우저 gate는 production preview에서 provider data attribute, mismatch, 0B readback, 원본 placement를 함께 수집할 때만 별도 승격한다.
