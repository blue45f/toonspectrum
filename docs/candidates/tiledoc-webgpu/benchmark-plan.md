# Tiled document WebGPU benchmark 계획과 실측

## 목표

Node planner-only 결과로 남아 있던 V12 release blocker를 실제 제품 브라우저 경로에서 닫는다.
측정 대상은 mock GPU가 아니라 production Vite bundle에서 실행되는
`StudioTiledDocumentStore`·`StudioTileDocWebGpuRuntime`·`StudioGpuFabric`·Canvas presentation이다.

## 재현

```bash
pnpm exec tsx tests/benchmarks/harness/tiledoc-webgpu-browser.ts
pnpm exec vitest run tests/visual/tiledoc-webgpu-browser-contract.test.ts
```

하니스는 임시 source/dist를 만들고 Vite production build를 한 뒤, Chromium을 다음 핵심 옵션으로
시작한다.

```text
--enable-unsafe-webgpu
--enable-features=WebGPU
--use-angle=metal
--disable-software-rasterizer
--enable-precise-memory-info
```

HTTP preview는 CSP, COOP `same-origin`, COEP `require-corp`, CORP `same-origin`을 적용한다. raw 결과는
새 파일 `tests/benchmarks/results/tiledoc-webgpu-browser.json`에 기록한다.

## 정확 workload

| Case | Dimensions | Layers | Sparse coordinates | Tiles | Resident bytes |
| --- | ---: | ---: | --- | ---: | ---: |
| 8K | 8192×8192 | 100 | 모든 layer의 `(0,0)`, `(15,15)` | 200×512² | 209,715,200 |
| Webtoon | 2048×30720 | 100 | 모든 layer의 `(0,0)`, `(i%4, (i×17)%59+1)` | 200×512² | 209,715,200 |

이는 `tests/benchmarks/harness/tiledoc-scale.ts`와 동일한 writer와 좌표다. 각 tile은 실제
1,048,576-byte `Uint8ClampedArray`이며 proxy, downscale, compressed placeholder를 사용하지 않는다.
pan/zoom, edit, reorder 모두 100 layer를 visible로 유지한다.

## 측정 시나리오와 게이트

| Scenario | Samples | Timing scope | Gate |
| --- | ---: | --- | --- |
| Pan/zoom | 201/case | requestFrame부터 queue completion까지 | p95 ≤250ms, p99 ≤500ms |
| Edit | 201/case | store write + 100-layer recomposite + present | 동일 |
| Reorder | 201/case | 100-layer stack reorder + recomposite + present | 동일 |
| Resize | 6/case | backing resize + frame replay + present | 최종 512×512, 실패 0 |
| Device loss | 1/case | timing 표본 밖 | epoch 증가, frame replay, status ready |
| Quality | 2 readbacks/case | 모든 interactive timing 뒤 | digest 동일, linear delta ≤0.002 |

validator는 raw sample을 nearest-rank-ceil로 다시 정렬해 p50/p95/p99를 재계산한다. sample 누락,
축소 표기, hot-path readback 증가, 100 visible layer 미충족, upload/cache counter 0, Metal flag 부재,
console/page/network/CSP 오류가 하나라도 있으면 artifact status는 fail이다.

## 실측 결과

| Case / Scenario | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| 8K pan/zoom | 16.645ms | 18.505ms | 21.120ms | 29.240ms |
| 8K edit | 33.345ms | 34.600ms | 35.030ms | 35.900ms |
| 8K reorder | 33.245ms | 35.495ms | 36.530ms | 39.135ms |
| Webtoon pan/zoom | 16.685ms | 18.435ms | 27.595ms | 29.395ms |
| Webtoon edit | 33.295ms | 35.135ms | 36.345ms | 36.640ms |
| Webtoon reorder | 33.345ms | 34.975ms | 35.655ms | 36.600ms |

각 행은 201 raw samples다. 최악 p95는 35.495ms, 최악 p99는 36.530ms로 자동화 gate보다 각각
7.0배, 13.7배 낮다.

| Evidence | 8K | Webtoon |
| --- | ---: | ---: |
| Source upload count | 501 | 451 |
| Payload / physical upload bytes | 525,336,576 | 472,907,776 |
| Source cache hits | 40,099 | 40,099 |
| Retained hit ratio | 99.5146% | 91.8110% |
| Composite cache reuse | 203 | 171 |
| Peak tracked GPU bytes | 218,103,808 | 371,195,904 |
| Peak browser JS heap | 423,065,675 | 476,118,529 |
| Hot-path readbacks | 0 | 0 |
| Post-timing validation readbacks | 2 | 2 |
| Quality max linear delta | 0.00036147 | 0.00036147 |

브라우저는 총 GPU allocation API를 제공하지 않으므로 `peakTrackedGpuBytes`는 제품이 생성한
source/retained/pool/active texture의 명시적 byte ledger다. `performance.memory`의 JS heap은 실제
브라우저 노출값이다. `measureUserAgentSpecificMemory`는 이 Chromium에서 SecurityError로 노출되지
않아 reason을 raw에 보존했다. 이 경로는 WASM을 사용하지 않아 WASM memory는 0으로 명시했다.

## fault·품질·진단 결과

- adapter: Apple, Metal 3, Chromium 140.0.7339.186.
- device loss: 두 case 모두 1회 관측, epoch 증가 후 ready 복구.
- canvas resize: 6개 크기/DPR 조합 후 512×512 복귀.
- one-primary-surface: 두 case 모두 owner count 1.
- 품질 digest: 두 case 모두
  `d932c948cf874dcb61d28fdec4d3f3e2bc4ab85f98c9b7e3e0f37330044fddf1` 2회 일치.
- console errors/warnings, page errors, request failures, HTTP ≥400, CSP violations: 전부 0.

## replacement condition

다른 renderer가 같은 두 exact workload에서 품질 delta와 복구/readback 계약을 모두 유지하면서
worst-case p95 또는 peak tracked GPU bytes를 20% 이상 개선하면 tournament challenger로 등록한다.
한 지표만 개선하거나 CPU readback·proxy를 사용하는 결과는 교체 근거가 아니다.
