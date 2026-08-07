# ToonStudio V11 — stroke-brush 서브시스템 후보 조사 (capability survey)

- 기준일: 2026-08-07
- 권위 소스: `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`, `docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv`
- 관련 매트릭스 행: **E05(Kurbo)** · **E09(Google Ink)** · **E10(Perfect Freehand + Lyon)** · **E28(wgpu/ToonGpuExtensions)**
- 담당 범위: 입력 파이프라인(raw/coalesced/predicted) → 장치 교정 → 스태빌라이저 → 스트로크 지오메트리 생성 → 렌더 핸드오프

## 0. 선행 결론

**1차 구현은 perfect-freehand 기반 `StrokeGeometryProvider` + 커스텀 스태빌라이저다.** perfect-freehand는 이미 리포 직접 의존성(`package.json` 기준 `1.2.3`)으로 검증돼 있고, 순수 함수형이라 결정성·폴백·테스트가 즉시 가능하다. **Google Ink는 PoC 게이트(WASM 포팅·고정 commit·품질/지연 벤치마크 통과)를 넘긴 뒤의 주력 승격 후보**이며, 1차 구현의 대체가 아니라 경쟁 Provider로 편입한다. Kurbo는 스트로크 결과를 편집 가능한 PathIR로 정리하는 기하 폴백·후처리 계층이다. 이는 V11 §5 "전문 G펜·매핑펜" 행의 폴백 정책("Google Ink 포팅 실패 시 Perfect Freehand+Kurbo+Vello로 자동 폴백")과 순서만 다를 뿐 동일한 구성이다 — 검증된 쪽을 먼저 출하하고, PoC를 통과한 쪽이 벤치마크로 승격을 다툰다.

## 1. 후보 비교표

성능 수치는 전부 **미실측**이다. 수치를 단정하지 않으며, `tests/benchmarks` 하니스(Phase 0 benchmark harness)로 동일 corpus에서 측정한 뒤 이 표를 갱신한다. Visual Quality·Missing Features는 공개 문서·소스 기준의 정성 평가다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Perfect Freehand 1.2.3 (리포 기존 의존성) | 압력 기반 가변 폭 outline 폴리곤을 단일 순수 함수로 생성. 의존성 0에 가깝고 이미 프로덕션에서 검증된 코드 경로. thinning/streamline/easing 옵션으로 손맛 튜닝 여지 있음 | tilt/azimuth/twist 미반영, 브러시 텍스처·팁·혼색 없음, 자체 예측·스태빌라이저는 streamline 한 축뿐(전문 스태빌라이저는 별도 필요), outline이 자기교차할 수 있어 후처리 필요 | 잉킹·기술 펜 계열에서 깔끔한 가변 폭 실루엣. 자연매체·복합 브러시는 표현 불가(E10 위험 항목 그대로) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | JS 소형 라이브러리로 번들 부담 미미. 순수 함수라 Worker 이전도 자유 | 높음 — 동일 입력·옵션이면 동일 폴리곤(순수 함수). export 지오메트리 기준으로 적합 | MIT | 낮음 — 폴리곤 → Kurbo fitting → PathIR → Vello/CanvasKit 렌더로 자연 연결 | 낮음 — 단일 저자 프로젝트라 업데이트 빈도는 낮지만 코드가 작아 fork 유지 가능 | **1차 주력 StrokeGeometryProvider·영구 안정 폴백** |
| Google Ink (Stroke Modeler + BrushBehavior + mesh) | 원시 입력 모델링(속도·가속 기반 스무딩·예측)과 BrushBehavior 그래프, mesh 기반 vector stroke까지 한 계보로 제공. pressure/tilt/speed 동역학 표현이 후보 중 최상 | 공식 웹 SDK 아님 — WASM 포팅·바인딩을 우리가 만들어야 함(E09 위험 항목). ToonStudio BrushProgramIR과의 매핑 계층 부재. 자연매체(습식·혼색)는 범위 밖 | 전문 잉킹(G펜·매핑펜·붓펜·캘리그래피)에서 이론상 최고 후보. 실측 전이므로 판정 유보 | 미실측 — tests/benchmarks 하니스로 측정 (PoC 게이트 항목) | 미실측 — tests/benchmarks 하니스로 측정 (PoC 게이트 항목) | C++ → WASM 포팅 산출물이 커질 수 있어 lazy-load + 전용 Worker 격리 전제. 크기는 포팅 후 실측 | mesh 생성은 결정적 설계이나 포팅·부동소수 경로 검증 필요. 기준 출력은 CanvasKit으로 이중화(E09 하이브리드 조합) | Apache-2.0 | 중간 — mesh→렌더러 연결, mesh→중심선(Kurbo) 역변환, BrushBehavior↔BrushProgramIR 매핑 비용 | 중간~높음 — API 안정성 비보장, 고정 commit 운용 필수(E09) | **PoC 게이트 통과 후 전문 잉킹 주력 승격 후보** |
| Kurbo | Rust Bézier 곡선·경로 기하(fitting, arc-length, split)가 Vello 생태계와 직결. 스트로크 중심선을 편집 가능한 PathIR로 정리하는 유일한 공통 통로 | 스트로크 생성기가 아님(입력 모델·동역학 없음). 강건 boolean은 단독 보장 안 함 — Skia PathOps·Clipper2와 결합(E05 위험 항목) | 해당 없음(기하 계층). fitting 허용 오차 설정이 최종 곡선 품질을 좌우 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Rust→WASM. project-model/vello-adapter crate에 동승하므로 한계 비용 낮음 | 높음 — 동일 입력·허용 오차면 동일 fitting 결과 | MIT / Apache-2.0 | 낮음 — PathIR·Vello·CanvasKit 3방향 모두 기존 계획 경로(E05) | 낮음 — Linebender 활발 유지보수 | **중심선 fitting·outline 후처리 핵심 기하 계층** |
| Lyon | Rust path tessellation 특화. 폴리곤/패스를 GPU 친화 mesh로 변환 | 스트로크 모델·스태빌라이저 없음. 렌더러 아님 | 해당 없음(테셀레이션 품질은 렌더러 설정에 종속) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Rust→WASM, 필요 시에만 링크(Vello 자체 래스터화로 충분하면 미탑재) | 높음 — 동일 입력이면 동일 mesh | MIT / Apache-2.0 | 낮음 — perfect-freehand 폴리곤→mesh→wgpu 직결 경로 | 낮음 | **선택적 테셀레이션 보조(E10 패키지의 절반, 필요 시 활성)** |
| 커스텀 입력 파이프라인 + 커스텀 스태빌라이저 (자체 구현) | Pointer Events raw/`getCoalescedEvents`/`getPredictedEvents` 통합, 장치 교정(압력 커브·tilt 정규화·Wacom/Apple Pencil/S Pen/Surface Pen/Huion/XP-Pen 프로필), palm rejection, 지연-품질 트레이드오프를 제품이 직접 통제. V11 §6.3이 명시적으로 비교 대상으로 허용하는 항목(custom stabilizer) | 처음부터 전부 구현 — 검증된 참조 구현 없음. 장치 프로필은 실기기 수집 필요(§6.4 장치별 시험) | 스태빌라이저 품질이 곧 손맛 — CSP 손떨림 보정과 블라인드 비교 대상 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | TypeScript(+ 필요 시 Rust/WASM 커널). 번들 비용 미미. 입력 스레드는 메인, 지오메트리는 Worker 분리 가능 | 설계로 보장 — InputIR에 raw 샘플·seed를 보존해 재생 시 동일 결과 | internal (proprietary) | 없음 — IR 소유자이므로 통합 지점 그 자체 | 중간 — 전적으로 자체 유지보수. 대신 외부 API 파손 위험 0 | **1차 필수 구현 — InputIR 소유자, 모든 StrokeGeometryProvider의 공통 전단** |
| wgpu/WebGPU + ToonGpuExtensions (E28) | 스탬프 브러시 batch dab·mesh 스트로크 렌더·sparse tile residency 같은 제품 특화 pass를 검증 엔진 frame graph에 얇게 삽입 | 범용 렌더러가 아님 — 부족한 pass만 채우는 정책(E28). WebGPU 미지원 환경 폴백 필수 | 해당 없음(렌더 보조). wet-ink preview 품질에 기여 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 자체 WGSL 모듈이라 소형. wgpu는 Vello adapter와 공유 | 셰이더 결정성은 장치별 편차 가능 — 기준 출력은 항상 CPU/CanvasKit 경로로 이중화 | internal + wgpu (MIT / Apache-2.0) | 낮음 — Vello와 동일 wgpu 컨텍스트·texture interop(§9.2 복사 비용 순위 준수) | 낮음~중간 — 작게 유지하는 것이 정책 | **얇은 GPU 확장 — wet-ink preview·mesh 렌더 pass 한정** |

## 2. 행별 판정 근거 (공개 정성 사실)

- **E10 / Perfect Freehand**: 매트릭스가 "안정 폴백"으로 판정하고 "자연매체·복합 브러시 전체를 대신하지는 않는다"를 위험으로 명시한다. 본 조사에서는 여기에 더해 **이미 리포 의존성(1.2.3)이라는 실측 사실**을 근거로 1차 주력으로 앞당긴다 — V11 §0.1 "기존 엔진이 목표를 만족하면 재사용·확장한다"의 직접 적용이다.
- **E09 / Google Ink**: 매트릭스 판정이 "PoC 후 주력 후보"이고, 위험 항목이 "공식 웹 SDK가 아니며 API 안정성을 강하게 보장하지 않는다. 고정 commit·WASM 포팅이 필요하다"이다. 따라서 1차 출하 경로에 두지 않고 PoC 게이트(benchmark-plan.md §5) 뒤에 배치한다.
- **E05 / Kurbo**: "핵심 기하 계층" 판정. 스트로크 서브시스템에서는 Google Ink/Perfect Freehand 결과를 편집 가능한 PathIR로 정리하는 역할(매트릭스 원문)로 한정하고, boolean은 Skia PathOps·Clipper2에 위임한다.
- **E28 / ToonGpuExtensions**: "필수 얇은 확장" 판정. 스트로크 서브시스템에서는 wet-ink preview 합성과 (Google Ink 승격 시) mesh 렌더 pass에만 사용하고, 범용 기능은 기존 엔진 우선 원칙을 지킨다.
- **Vello 알파 상태**: Vello 저장소가 알파 상태를 명시한다(매트릭스 E02 위험 항목). 스트로크 overlay/선택 표시를 Vello에 맡길 때 CapabilityRegistry로 불안정 구간을 CanvasKit으로 우회한다(V11 §8).

## 3. 미결 조사 항목

1. Google Ink WASM 포팅 실공수 산정(빌드 체인·바인딩 표면·번들 크기) — PoC Phase 2 선행 과제.
2. perfect-freehand outline 자기교차 케이스의 Kurbo/PathOps 정리 비용 — corpus의 hairpin·급회전 트레이스로 측정.
3. `getPredictedEvents` 장치·브라우저별 제공 품질 편차 — 장치 프로필 수집과 병행.
4. Lyon 탑재 여부 — Vello 자체 래스터화로 충분한지 Phase 1 cross-renderer 비교 후 결정.
