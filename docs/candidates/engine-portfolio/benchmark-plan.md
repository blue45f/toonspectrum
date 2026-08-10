# ToonStudio V11→V12 벤치마크 계획 및 실행 원장 (Benchmark Plan)

- 기준일: 2026-08-09
- 실행 위치: `/tests/benchmarks/harness` (하니스), `/tests/benchmarks/results` (raw data), `/tests/corpus` (입력 corpus), 기존 `/studio` 브라우저 검증 스크립트(제품 실측)
- 결과 저장: `ProviderBenchmarkRegistry` — HybridExecutionPlanner의 라우팅 근거 데이터
- 현재 상태: **자동화 범위 실행됨.** Vello CPU/GPU, CanvasKit 교차 diff, Google Ink, 1000px libmypaint/Hokusai, OpenCV, libvips, WESL/Naga, Velato, GPU fabric, color, 실제 Chromium OPFS SQLite, 정확 100k/1M path, 8K·100-layer/30,720px exact WebGPU product surface, 8h soak는 raw artifact가 있다. 자동화할 수 없는 CSP 실기기 blind와 물리 P3/HDR·다중 OS 장치 매트릭스는 외부 release gate로 남는다. 1M 단일 all-visible overview는 retained/sharded GPU ingestion 도입 전까지 격리하며, 24h soak는 ADR 0011에 따라 선택 야간 재검증이다.

## 0. 실행 상태와 증거 우선순위

1. `tests/benchmarks/results/*.json` 및 corpus golden이 단일 수치 진실이다.
2. `capability-survey.md` §2.0은 raw artifact의 판정을 색인하며 숫자를 임의 보간하지 않는다.
3. 브라우저 GPU 측정은 adapter·Chromium·플래그·해상도·readback 포함 여부를 함께 기록한다.
4. `passed: false`, `*Reduced: false`, `unsupported`, `skipped`를 문서 요약에서 성공으로 바꾸지 않는다.
5. CSP 비교는 최신 안정 CSP, 같은 PC/GPU/태블릿/해상도/색공간과 사람 blind session이 없으면 자동화 하니스 결과와 분리해 `외부 미검증`으로 남긴다.

### 완료된 자동화 묶음

| 묶음 | raw evidence | 상태 |
| --- | --- | --- |
| Cross-renderer quality | `cross-renderer-diff.json`, `vello-gpu-browser.json`, SVG visual corpus | 통과 범위 고정 |
| Brush feel/pressure | `tests/visual/pressure-fidelity.test.ts`, `libmypaint-fullsize.json`, `libmypaint-parity.json`, `ink-mesh-incremental.json`, raster goldens | 1000px 품질·압력·처리량 실측; libmypaint 유지 판정. Google Ink 증분 final mesh byte parity와 pressure/tilt/orientation 전달 통과; 물리 태블릿 blind는 잔여 |
| Filter quality/performance | `quality-lab.json`, `filter-candidates.json`, `filter-lanes.json`, `vips-export-cutover.json` | provider별 우승 역할 고정; 4K 60fps 미통과 |
| Shader platform | `wgsl-variants-browser.json`, `wgsl-variants-pipeline.json`, WGSL corpus + Naga test | compile/정합성 통과; wall-clock jank 미통과 |
| Reliability | `soak.json`, device-loss/worker-crash/quota/network fault tests, SQLite recovery tests | 8h 통과; 물리 탭 종료를 포함한 통합 fault matrix는 잔여 |
| Browser OPFS SQLite | `brush-library-opfs-browser.json`, `filter-library-opfs-browser.json`, `animatic-sqlite-opfs-browser.json`, `translation-memory-sqlite-opfs-browser.json`, `production-bible-sqlite-opfs-browser.json` | Dedicated Worker SAH-pool의 exact `studio-local-v12.db`: 브러시·필터 각 10,000개, 최대 799,973B 애니매틱, TM 512개, strict Bible을 저장·close/reopen·무손실 검증. Bible은 강제 Worker 종료 후 재개방까지 통과; memory/localStorage fallback 0 |
| Large scene | `large-scene.json`, `scene-sharding.json`, `large-scene-million.json` | 정확 100k 전체 Vello GPU overview와 정확 1M 생성·전체 JSON 왕복·37-view bounded interaction 통과. 1M 단일 all-visible JSON frame만 명시 격리 |
| Sparse large document | `tiledoc-scale.json`, `tiledoc-webgpu-browser.json` | 8192²·100 layer와 2048×30,720·100 layer를 exact 200 tile/200MiB로 Chromium Metal WebGPU 제품 surface에 표시. pan p95≤18.505ms, edit/reorder p95≤35.495ms, hot readback 0, device-loss 복구·rgba16float 품질 통과 |
| CSP blind protocol | `tests/benchmarks/harness/csp-blind-lab.ts` + 16 contract tests | deterministic A/B·sealed key·완전성·Wilson 비열위 판정 구현; 사람/동일 태블릿 결과는 `insufficient-data` |

## 1. 코퍼스 구성

모노레포의 `/tests/corpus` 하위에 하위 시스템별 corpus를 둔다(마스터 프롬프트 모노레포 절).

| Corpus | 경로 | 구성 | 용도 |
| --- | --- | --- | --- |
| 브러시 corpus | `/tests/corpus/brushes` | Golden Master 128개 이상(확장 가능, 아키텍처 §6.4). 대표 잉킹(G펜·매핑펜·붓펜)·래스터·자연매체(연필·수채·유화·smudge) preset + 기록된 입력 스트림(pressure/tilt/azimuth/twist, coalesced 포함) | 브러시 손맛·처리량·parity lab(libmypaint↔Hokusai) |
| 필터 corpus | `/tests/corpus/filters` | Core Interactive~Creative Extensions 대표 recipe, ROI/halo/temporal 의존이 있는 EffectGraph 샘플 | preview/final 그래프 검증, provider 간 동일 효과 비교 |
| 벡터 corpus | `/tests/corpus/vector` | 대규모 선화·가변 폭 path·컷·말풍선·효과선 장면, path boolean 회귀 케이스 | Vello Classic/Hybrid/CPU vs CanvasKit cross-renderer diff |
| 텍스트 corpus | `/tests/corpus/text` | 한중일 말풍선·세로쓰기·bidi·금칙·루비 문단 | Parley 스택 vs CanvasKit Paragraph 검증 |
| 포맷 corpus | `/tests/corpus/formats` | SUT/SUTG/ABR/MYB/KPP/Krita bundle, SVG/Lottie 기능 스펙트럼 파일 | FormatGateway·feature scanner·엔진 라우팅 검증 |
| 문서 corpus | `/tests/corpus` 공용 | 8K·100 layer 문서, 30,000px 웹툰 스트립, 소·중·대형 대표 문서 | 대형 문서 처리량·soak·복구 시험 |

모든 corpus 항목은 provider·version·license·원본 payload·resource hash를 함께 고정한다(아키텍처 §6.4).

## 2. 측정 지표

### 2.1 지연 (p50/p95/p99)

| 지표 | 정의 | 측정 방법 |
| --- | --- | --- |
| 입력→첫 preview | pointer 이벤트 수신부터 해당 dab/세그먼트가 화면 합성에 반영되기까지 | 하니스가 기록된 입력 스트림을 재생하고 프레임 타임스탬프와 대조. p50/p95/p99 백분위 기록 |
| 프레임 시간 | 스트로크 중·필터 조작 중 프레임 간격 | rAF/GPU timestamp query. 드롭 프레임 수 병기 |
| 필터 interaction | 파라미터 변경→preview 반영 | 4K 문서 기준 슬라이더 스크럽 시나리오 |
| final 처리 시간 | final graph 제출→완료 | 취소 응답 시간(제출→취소 확인)도 함께 기록 |

### 2.2 메모리

| 지표 | 정의 |
| --- | --- |
| Peak Memory | 시나리오 실행 중 CPU heap·GPU 추정치·WASM linear memory 각각의 최고치. Provider별로 분리 기록(승인 PR 요구: "peak CPU/GPU/WASM memory") |
| Residency | worker 종료 후 회수량 — lazy load/해제 계약 검증 |
| Cache hit rate | dirty tile·scene fragment·glyph·tip·LUT·pipeline cache 각각의 적중률(아키텍처 §9.3) |

### 2.3 정합성

| 지표 | 정의 |
| --- | --- |
| readback 횟수 | 일반 편집 시나리오 중 GPU→CPU pixel readback 계수. 게이트 값 0 |
| 픽셀 diff | golden image 대비 차이(아래 §3) |
| tile seam / NaN·overflow | 타일 경계 이음새·수치 안정성 시험(승인 PR 요구 항목) |
| 결정성 | 동일 입력 2회 실행의 비트 일치 여부(결정적 경로), 시드 고정 재현성(확률적 경로) |

## 3. 픽셀 diff 임계

> 아래 임계는 **측정값이 아니라 정책 제안값**이다. Phase 1 cross-renderer diff 캘리브레이션에서 실제 분포를 확인한 뒤 확정하고, 확정 전에는 회귀 "경보" 기준으로만 사용한다.

| 비교 쌍 | 제안 임계(초기 정책) | 근거 |
| --- | --- | --- |
| 결정적 CPU 기준끼리 (Vello CPU vs resvg/tiny-skia vs CanvasKit SW) | per-channel 차이 ≤ 1/255, 불일치 픽셀 비율 ≤ 0.01% | 결정적 렌더 간에는 라운딩 차이만 허용 |
| GPU vs CPU 기준 (Vello Classic/Hybrid vs Vello CPU, CanvasKit GPU vs SW) | 지각 diff(ΔE 계열 또는 SSIM) 기반 — AA·보간 차이를 허용하되 구조 변화는 실패 | GPU 래스터화는 비트 일치를 보장하지 않음 |
| 자연매체 parity (Hokusai vs libmypaint, 동일 preset·동일 입력) | 스트로크 커버리지·에너지 보존 지표 + 지각 diff. 완전 픽셀 일치는 요구하지 않고 "동일 preset의 의도 재현"을 채점 | 서로 다른 구현의 dynamics 차이를 인정하되 품질 회귀는 차단 |
| SVG/Lottie 라우팅 (vello_svg/ThorVG vs resvg reference) | 지원 선언 feature에 한해 구조 diff 실패 시 해당 파일을 다른 provider로 라우팅 | feature scanner와 연동 |
| 색관리 (cross-engine color chart) | 색 패치별 허용 오차를 색공간 단위로 정의, ColorPipeline 단일 소유 검증 | 아키텍처 E20 위험 항목 |

diff 실패는 "provider 탈락"이 아니라 CapabilityRegistry의 불안정 구간 등록 → 라우팅 우회 → 원인 분석 순서로 처리한다.

## 4. 통과 게이트 (release blocker)

아키텍처 §9.3·§10을 게이트로 옮긴다. 게이트 미통과 기능은 완료 처리 금지(마스터 프롬프트 절대 규칙 10).

| 게이트 | 기준 |
| --- | --- |
| 입력 지연 | 입력→첫 preview p50 ≤ 4ms, p95 ≤ 8ms |
| readback | 일반 편집 GPU→CPU readback 0회 |
| 대형 브러시·필터 | 1,000px 브러시와 4K 필터 interaction을 CSP와 동일 장치에서 비교해 동률 이상 |
| 대형 문서 | 8K·100 layer 문서와 30,000px 웹툰 스트립 편집 유지 |
| 장시간 안정성 | 8h soak 통과(ADR 0011로 필수 게이트 종결), context-loss·worker-crash 복구 성공. 24h는 선택 야간 재검증 |
| 폴백 | provider fallback 발동 시 데이터 손실 0, IR 재컴파일로 시각 동등성 유지 |
| 기록 의무 | Provider별 p50/p95/p99·peak memory·cache hit rate를 ProviderBenchmarkRegistry에 기록 |

## 5. CSP 비열위 비교 방법

1. **동일 장치·동일 작업.** CSP와 ToonStudio V11을 같은 하드웨어(장치 매트릭스: Wacom·Apple Pencil·S Pen·Surface Pen·Huion·XP-Pen, 아키텍처 §6.4)에서 같은 태스크 스크립트로 실행한다.
2. **블라인드 브러시 테스트.** Phase 7의 CSP blind test — 동일 preset 의도의 스트로크 결과를 출처를 가리고 평가자에게 제시해 손맛·품질을 채점한다. 대표 브러시는 최소 통과 조건(단순 가중치 아님, 아키텍처 §3.2)을 적용한다.
3. **태스크 플로우 비교.** 엔진 데모가 아니라 연결된 제작 흐름(컷 생성→말풍선→톤→출력, 아키텍처 §10.2)의 완료 시간·조작 수를 비교한다.
4. **비열위 판정.** 각 게이트 항목에서 "동률 이상"을 요구한다. 우위가 아니라 열위가 아님을 입증하는 구조이므로, 측정 조건(해상도·문서·장치)을 CSP 쪽에 유리하게도 불리하게도 조작하지 않고 raw data를 `/tests/benchmarks`에 보존한다.
5. **재현성.** 모든 비교는 기록된 입력 스트림 재생으로 수행해 사람 손 편차를 제거하고, 사람 평가는 블라인드 채점으로만 반영한다.

## 6. 자체 구현·fork 승격 벤치마크 경로

custom 후보(ToonWet, custom stabilizer 등)는 기존 provider와 동일 corpus·동일 하니스에서 실행하며, 승격 PR에는 다음 raw data를 첨부한다(마스터 프롬프트 승인 조건).

```text
reference images
benchmark raw data
p50/p95/p99
peak CPU/GPU/WASM memory
tile seam test
NaN/overflow test
deterministic reference
owner / license / fallback / replacement condition
```

차이가 없으면 유지보수 비용을 줄이기 위해 검증 엔진을 선택한다(아키텍처 §6.3). 승격 후에도 기존 provider를 폴백으로 유지하고, replacement condition에 명시된 조건이 깨지면 자동 재검토한다.
