# Tiled document WebGPU 후보 역량 조사

- 서브시스템: 대형 래스터 문서의 sparse tile residency, 합성, 브라우저 presentation
- 권위 원칙: `SPARSE_STRIPS_FIRST`, `ONE_PRIMARY_SURFACE_OWNER`, hot-path GPU→CPU readback 금지
- 제품 경로: `StudioTiledDocumentStore` → `StudioTileDocCompositePlanner` →
  `studio-tiledoc-webgpu-bridge` → retained WebGPU compositor → `StudioGpuFabric`
- 실측 원시 데이터: `tests/benchmarks/results/tiledoc-webgpu-browser.json`
- 실측 환경: Chromium 140.0.7339.186, Apple WebGPU adapter `vendor=apple`,
  `architecture=metal-3`, `--use-angle=metal`, software rasterizer disabled

## 후보 비교

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Product tiledoc WebGPU + shared `StudioGpuFabric` | 실제 512² sparse tile만 업로드하고 RGBA16F retained texture를 viewport별 재사용한다. 필터와 동일 `GPUDevice` epoch를 lease로 공유하며 Canvas presentation까지 한 queue에서 끝낸다. | 브라우저가 총 GPU allocation을 노출하지 않는다. 이번 물리 실측은 Apple Metal 3 한 프로파일이며 Windows/D3D12·Linux/Vulkan은 별도 장치 매트릭스가 필요하다. | 두 문서 모두 사후 RGBA16F probe SHA-256 2회 일치. CPU 산식 대비 최대 linear delta **0.00036147**(게이트 0.002), 투명 probe 0. hot path readback 0 | **8K** pan 16.645/18.505/21.120ms, edit 33.345/34.600/35.030ms, reorder 33.245/35.495/36.530ms. **Webtoon** pan 16.685/18.435/27.595ms, edit 33.295/35.135/36.345ms, reorder 33.345/34.975/35.655ms. 각 201 samples | 제품 추적 GPU peak: **208MiB(8K)**, **354MiB(webtoon)**. 브라우저 JS heap 관측 peak: **403.5MiB**, **454.1MiB**. 원본 Store는 정확 200MiB | 신규 번들/Worker 없음. 기존 Vite 제품 코드와 브라우저 WebGPU API만 사용. production evidence bundle은 JS 1개 | 같은 final texture의 사후 digest 2회 byte-identical. GPU 부동소수는 RGBA16F 허용 오차로 감시 | 내부 코드. WebGPU 표준 API 사용. Chromium/Playwright는 실행 하니스에만 사용(Apache-2.0) | **낮음**: 같은 `StudioGpuFabric` device에 직접 upload/composite/present. CPU readback·ImageBitmap 왕복 없음 | 중간: device-loss, canvas resize, GPU budget, 브라우저 구현 차이를 지속 감시해야 함 | **선정 — 제품 대형 raster document island의 primary surface.** `/studio`의 CRDT raster replay를 bounded island로 연결하고 Vello는 selection overlay로 제한 |
| 기존 Canvas2D `StudioRasterCrdtCanvas` | WebGPU 없는 브라우저에서도 동일 CRDT immutable tile을 표시한다. 디버깅과 안전 폴백이 단순하다. | GPU retained residency와 100-layer GPU 합성이 없다. 대형 full-stack 처리량·GPU 공유·shader blend 확장에 불리하다. | 기존 제품 기준선. 이번 정확 workload에서 별도 CPU 픽셀 diff는 실행하지 않았으며, WebGPU probe는 premultiplied-sRGB→linear 참조 산식으로 검증했다. | 정확 200MiB/201-sample 브라우저 workload **미실측**. WebGPU 실패 후 기능 보전용이지 승격 후보가 아니다. | 정확 workload 미실측. Canvas backing store와 JS tile이 중복될 수 있다. | 추가 번들 없음 | 브라우저 Canvas2D 구현 의존. 같은 입력 replay는 결정적 | 브라우저 내장 API | CPU canvas put/draw 경계. GPU island로 재진입하면 복사 비용이 높음 | 낮음 | **명시적 폴백.** WebGPU 준비 실패·device-loss 반복·flipX 미지원 경로에서 wrapper가 소유권을 넘긴 뒤에만 mount |
| CanvasKit/Skia raster surface | 성숙한 blend/filter/text 생태계와 Skia reference/export를 한 엔진에서 제공한다. | 현재 제품 CRDT replay와 sparse tiledoc bridge를 직접 공유하지 않으며 별도 WASM/Skia surface와 GPU context가 필요하다. | Skia reference 품질은 강점이나 이번 200-tile 브라우저 presentation corpus에는 아직 비교 산출물이 없다. | 이번 exact browser workload **미실측** | 이번 exact workload 미실측 | `canvaskit-wasm` 0.41.1 대형 WASM lazy-load 비용 | software surface는 기준화 가능, GPU는 backend 의존 | BSD-3-Clause | 별도 context일 때 texture copy 또는 CPU 경계가 필요 | 낮음~중간 | **reference/export·필터 후보 유지.** tiledoc primary surface를 대체하지 않음 |
| Vello GPU document primary | 복잡한 벡터 scene에서 높은 상한과 Kurbo/Peniko 직결. 기존 V12 브라우저 품질 실측도 통과했다. | 512² RGBA tile 100-layer document store의 mutation/residency authority가 아니며, 현행 wgpu 내부 device를 JS fabric에 주입할 수 없다. | SceneIR corpus 브라우저 diff는 최대 0.0366%로 통과했으나 raster tiledoc 품질 역할은 다르다. | 128² SceneIR 기준 p50 약 2.6~2.8ms; 이번 exact tiledoc workload와 직접 비교 불가 | 별도 wgpu device·WASM 메모리로 중복 가능 | GPU WASM 약 4.6MB(현행 Velato 포함 pkg-gpu) | CPU reference와 fuzzy gate로 감시 | MIT / Apache-2.0 | 현재 JS fabric과 물리 device 공유 불가. island texture 교환 필요 | 중간~높음 | **selection/vector island.** raster document primary 소유권을 가져가지 않음 |

## 선택 판정

제품 tiledoc WebGPU 레인을 선정했다. 이유는 단순한 microbenchmark 우위가 아니라 다음 네 가지가
한 실행에서 동시에 입증됐기 때문이다.

1. 두 문서 모두 정확히 100 layers, 200개 512² tile, 209,715,200 resident bytes였다.
2. pan/zoom·edit·reorder가 모두 100개 visible layer를 유지한 채 각각 201회 실제 Canvas present를
   완료했다.
3. source upload, source/retained/composite cache hit, queue completion, resize와 device epoch 교체가
   제품 bridge에서 관측됐다.
4. 인터랙티브 경로 readback은 0이고, 품질 검증용 두 readback은 모든 timing 이후 별도 실행됐다.

Canvas2D는 기능 보전 폴백, CanvasKit은 reference/export, Vello는 selection/vector island로 역할을
분리한다. 객체별 renderer 전환은 하지 않는다.

## 남은 장치 매트릭스

Apple Metal 3 실측은 release gate를 닫았지만 모든 GPU를 대표하지 않는다. Windows D3D12와 Linux
Vulkan은 **미검증 장치 lane**으로 남는다. 해당 장치에서 같은 raw contract를 통과하기 전에는
remote promotion 대상이 아니며 Canvas2D 폴백을 유지한다. 승격 조건은 동일한 exact workload,
quality delta ≤0.002, hot-path readback 0, device-loss 복구, diagnostics 0이다.
