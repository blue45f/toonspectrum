# ToonStudio V11 엔진 후보 역량 조사 (Capability Survey)

- 기준일: 2026-08-07
- 대상 하위 시스템: V11 엔진 포트폴리오 전체 (Phase 0 후보 검증 기반)
- 권위 소스:
  - `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`
  - `docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv` (E01~E28)

## 1. 조사 원칙

- **Verified-first**: 검증된 엔진·라이브러리를 먼저 평가하고 장점별로 분해한다. 자체 구현은 금지 대상이 아니라 "비교를 통과한 하나의 후보 Provider"다(아키텍처 §3.3).
- **성능 수치는 전부 미실측이다.** 이 문서의 p50/p95/p99와 Peak Memory 컬럼은 절대 수치를 기재하지 않는다. 모든 후보는 `/tests/benchmarks` 하니스와 `/apps/benchmark-lab-v11`에서 동일 corpus·동일 장치로 측정한 뒤에만 수치를 채운다.
- **정성 사실은 근거와 함께 기재한다.** 예: Vello 공식 저장소가 알파 상태를 명시한다(매트릭스 E02 위험 항목), Google Ink는 공식 웹 SDK가 아니다(매트릭스 E09), G'MIC은 공식 GUI 기준 640개 이상의 필터를 제공한다(매트릭스 E18).
- 라이선스·안전성 하드 게이트(상용 배포, copyleft 격리, sandbox, 데이터 손실 가능성)를 통과한 후보만 품질 점수 대상이 된다(아키텍처 §3.1).

## 2. 후보 역량 매트릭스

> 아래 표에서 `미실측`은 "미실측 — tests/benchmarks 하니스로 측정"의 축약이 아니라 전체 문구를 그대로 적는다. Visual Quality는 실측 전 정성 평가이며, cross-renderer diff와 golden image로 확정한다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Skia / CanvasKit (0.41.1 핀 예정) | Path·Canvas·Paint·Paragraph·ImageFilter·RuntimeEffect·Skottie를 하나의 성숙한 그래픽 코어로 제공. 레이어 합성·마스크·텍스트·기준 출력의 안전한 기준선 | 대량 동적 벡터 장면 처리 상한(Vello 대비), 자연매체 dynamics 없음, sparse tile residency 없음 | 높음(정성) — Chrome/Android에서 검증된 Skia 코어. golden image로 확정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — WASM 번들·객체 수명·독립 GPU context 관리 필요(매트릭스 E01 위험) | GPU backend는 장치별 편차, Software backend는 CPU 교차 기준으로 사용 가능 | BSD 계열 | 낮음 — 이미지/텍스처 island 수신이 표준 경로 | 낮음 — 활발한 상류 유지보수 | 생산 기준선(기본 페인팅 Surface 주 소유자) |
| Vello Classic | Rust/wgpu GPU compute 중심으로 복잡한 path가 많고 자주 바뀌는 장면의 처리 상한이 높음. Kurbo·Peniko 직접 결합 | 공식 저장소가 알파 상태 명시(매트릭스 E02). 일부 마스크·복합 필터·글리프 캐시 성숙도 미확정 | 목표 높음(정성) — 알파 상태이므로 vello_cpu·CanvasKit과 diff로 검증 필요 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — Rust→WASM+wgpu, WebGPU 필요 | GPU 실행이라 비트 결정성 미보장 → Vello CPU와 교차 diff | MIT / Apache-2.0 | 낮음(Linebender 생태계 내부), CanvasKit과는 texture island 경유 | 중간 — 알파·API 변동 | 조건부 가속기(capability probe 후 단계 도입) |
| Vello Hybrid | CPU 경로 준비 + GPU 래스터·합성 분담, 이미지 atlas·texture binding 결합 가능. 혼합 장면·저전력 균형형 | API·기능 동등성이 계속 변함(매트릭스 E03). 마스크·필터 지원은 capability probe로 확인 필요 | 목표 높음(정성) — Classic과 문서별 벤치마크로 비교 후 선택 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — Classic 대비 GPU 요구 낮음(정성 기대치, 실측 필요) | GPU 합성 구간은 비트 결정성 미보장 | MIT / Apache-2.0 | 낮음(Linebender 생태계 내부) | 중간 — 기능 표면 유동 | 조건부 가속기 |
| Vello CPU (vello_cpu 0.2.0 핀 예정) | GPU와 분리된 결정적 CPU 기준 결과. 시각 회귀·썸네일·장애 복구·서버 렌더 | 대형 실시간 장면에서 GPU보다 느릴 수 있음(매트릭스 E04) | 기준선 품질 — cross-renderer diff의 결정적 참조로 사용 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — GPU 의존 없음 | 높음 — 결정적 CPU 기준선이 존재 목적 | MIT / Apache-2.0 | 낮음 | 중간 — Vello 계열과 동반 변동 | 필수 기준선(cross-renderer diff·GPU 장애 복구) |
| Kurbo | Rust Bézier curve·vector path 구조와 연산. Vello 생태계와 자연 결합 | 강건 boolean 연산 단독 해결 아님 — Skia PathOps·Clipper2 보완 필요(매트릭스 E05) | 해당 없음(기하 계층) — 결과는 렌더러 품질에 종속 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — 순수 Rust 라이브러리 | 높음 — 순수 CPU 기하 연산 | MIT / Apache-2.0 | 낮음 | 낮음 | 핵심 기하 계층(PathIR 정리·중심선·guide) |
| Peniko + Linebender Color | Vello 계열의 색·그라데이션·이미지·혼합 공통 언어 | 엔진별 alpha·gamma·색공간 차이를 명시적으로 보정해야 함(매트릭스 E06) | 해당 없음(스타일 계층) — cross-renderer 색상 diff로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) | 높음 — 선언적 표현 계층 | MIT / Apache-2.0 | 중간 — CanvasKit 색 모델과 ColorIR 매핑 필요 | 낮음 | 핵심 스타일 계층(PaintIR) |
| Parley + Fontique + HarfRust + Skrifa + ICU4X | shaping·line breaking·bidi·selection/editing을 Rust 계층에서 조합, 복잡한 다국어 문단 처리 | CJK 세로쓰기·금칙·루비는 제품 전용 확장 필요 가능(매트릭스 E07) | 높음 목표(정성) — CanvasKit Paragraph를 기준선·폴백으로 교차 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — 폰트·ICU 데이터 포함 시 증가 | 높음 — CPU 레이아웃 | permissive | 중간 — glyph run→Vello/Glifo 전달 경로 구축 필요 | 중간 | 조건부 핵심(한중일 말풍선·세로쓰기 기반) |
| Glifo | 반복 glyph outline/image/hint 캐시로 텍스트 많은 캔버스 렌더 비용 절감 | 실험적 — GlyphCacheAdapter 뒤에서 교체 가능하게 유지(매트릭스 E08) | 미검증 — CanvasKit Paragraph와 비교 필수 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) | 캐시 계층이므로 원 렌더러에 종속 | permissive | 낮음(Parley→Vello 경로 내) | 높음 — 실험적 | 실험적 보조(glyph atlas) |
| Google Ink | 원시 입력 모델링 + BrushBehavior로 mesh 기반 vector stroke 생성. pressure·tilt·speed 동역학에 강함 | 공식 웹 SDK 아님, API 안정성 미보장, WASM 포팅 필요(매트릭스 E09) | 높음 목표(정성) — 잉킹 손맛은 blind test로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — 자체 WASM 포팅·고정 commit 관리 비용 | 고정 commit 전제 시 재현 가능(검증 필요) | Apache-2.0 | 중간 — mesh→Kurbo proxy→Vello/CanvasKit 변환 경로 필요 | 높음 — 상류 보장 없음, fork 유지 가능성 | PoC 후 주력 후보(게이트 통과 시 승격) |
| Perfect Freehand (1.2.3 핀 예정) + Lyon | 압력 기반 outline 생성이 단순·안정, Lyon은 Rust path tessellation에 강함 | 자연매체·복합 브러시 전체를 대체하지 못함(매트릭스 E10) | 중간~높음(정성) — 기술 펜·경량 스트로크에 충분, 전문 잉킹 손맛은 게이트로 판정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — 소형 JS 라이브러리 + Rust crate | 높음 — 순수 함수형 outline 생성 | MIT / Apache 계열 | 낮음 | 낮음 | 안정 폴백(1차 출하 잉킹 경로, ADR 0005) |
| libmypaint | MyPaint 계열이 실사용으로 검증한 brush dynamics·tiled surface·smudge·.myb 생태계 | 습식 현상(backrun·granulation·건조 타임라인) 부재 → ToonWet 확장 영역. C 기반 WASM 포팅·메모리 경계·업데이트 정체(매트릭스 E11) | 높음(정성) — 자연매체 기준선. preset corpus로 픽셀 동등성 확인 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — C→WASM 포팅 및 worker 격리 필요 | 시드 고정 시 결정적 실행 검증 필요 | ISC | 중간 — dab/tile을 CanvasKit tile surface로 합성 | 중간 — 상류 업데이트 정체 | 자연매체 기준선(parity lab 기준 축) |
| Hokusai (리포 기보유 studio-hokusai-wasm, hokusai-* =0.3.0 고정) | libmypaint에서 영감받은 순수 Rust 브러시 엔진, WASM/native 목표, .myb 호환 지향. 리포에 결정적 렌더러 크레이트 기보유 | 신규 프로젝트 — 기능·픽셀 동등성과 장기 유지보수 검증 필요(매트릭스 E12) | 목표 높음(정성) — libmypaint와 동일 입력·동일 preset corpus로 비교 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음~중간(정성) — Rust→WASM 단일 툴체인, 이미 사내 릴리스 계약 스크립트 존재 | 높음 목표 — 사내 크레이트 설명이 "deterministic" 명시(packages/studio-hokusai-wasm) | MIT / Apache-2.0 | 낮음 — 사내 크레이트 재사용 | 중간 — 상류 신생 + 사내 어댑터 유지 | 품질 게이트 후보(NaturalMediaProvider 1차 후보, ADR 0006) |
| ThorVG | retained scene·blending·masks·text·effects·Lottie·partial rendering, CPU/WebGL/WebGPU backends | SVG/Lottie 완전 사양 커버리지 아님 — 파일별 feature scanner 필요(매트릭스 E13) | 높음(정성) — resvg 정적 기준과 diff로 확정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — C++→WASM | backend별 편차 가능 — 기준선 diff 필요 | MIT | 중간 — frame cache/texture island 경유 | 낮음~중간 | 생산 보조(SVG/Lottie asset·animated tip) |
| vello_svg + Velato | SVG/Lottie를 Vello scene fragment로 직접 편입 — 편집 overlay와 동일 renderer 합성 | 미지원 사양은 scanner가 사전 분리해야 함(매트릭스 E14) | 목표 높음(정성) — resvg reference와 diff | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — Vello 채택 시 한계 비용 | Vello 계열과 동일(GPU 미보장, CPU 기준 병용) | MIT / Apache-2.0 | 최저 — Vello scene 내부 | 중간 — Vello 동반 변동 | 조건부 보조(Vello-native asset island) |
| resvg + tiny-skia | 정적 SVG 렌더·CPU 기준 이미지에 강함. 서버·테스트의 결정적 기준 | 동적 편집기 전체 renderer가 아님 — reference/export 역할 집중(매트릭스 E15) | 기준선 품질 — SVG 정합성 참조로 사용 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) | 높음 — 결정적 CPU 렌더 | MIT / Apache-2.0 | 낮음 | 낮음 | 필수 기준선(golden image·export 검증) |
| OpenCV / OpenCV.js | threshold·morphology·gradients·Canny·contours·transforms 등 검증된 CV/이미지 처리 폭 | 실시간 합성 렌더러 아님. 번들·메모리·CPU 비용을 worker/lazy-load로 통제 필요(매트릭스 E16) | 분석 정확도 높음(정성) — 마스크 품질은 corpus로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — OpenCV.js 번들 대형, lazy-load 필수 | 높음 — CPU 알고리즘 결정적 | Apache-2.0 | 중간 — mask 결과를 CanvasKit/Vello로 전달 | 낮음 | 생산 분석 계층(마술봉·선 추출·먼지 제거) |
| libvips / wasm-vips | demand-driven·horizontally threaded 대형 이미지 처리, 낮은 메모리 목표 | 실시간 편집 preview 용도 아님. 일부 코덱 별도 라이선스(매트릭스 E17) | 높음(정성) — export 품질은 기준 인코더 diff로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — WASM 크기·스레드 요구 관리 필요 | 높음 — 파이프라인 결정적 | LGPL-2.1-or-later | 중간 — final export 경계에서만 접촉 | 중간 | 대형 처리 주력(8K/초장축 export·batch) |
| G'MIC / libgmic | 공식 GUI 기준 640개 이상 필터 + 자체 확장 언어 + multi-threaded library(매트릭스 E18) | 브라우저 직접 번들 곤란(CeCILL 계열 + 크기) — 격리 실행 전제. 취소/진행률은 ToonStudio가 통제 | 높음(정성) — 창작·복원 필터 성숙 생태계 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — Local ToonBridge/격리 provider 인프라 필요 | 필터별 상이 — recipe 고정 시 재현성 검증 | CeCILL 계열 | 높음 — proxy preview와 final 결과 재주입 파이프 필요 | 중간 | 동적 확장(격리 final provider) |
| GEGL | operation graph + loadable operation API — 비파괴 이미지 처리 DAG와 자동 UI 생성에 적합 | LGPL/GPL 경계와 브라우저 직접 통합 비용 → bridge/provider 격리 기본(매트릭스 E19) | 높음(정성) — GIMP 계열 연산 성숙도 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 높음(정성) — 격리 실행 인프라 필요 | 그래프 고정 시 결정적 목표 — 검증 필요 | library LGPL, tools GPL | 높음 — EffectGraphIR→GEGL chain 컴파일 필요 | 중간 | 동적 확장(offline final pipeline) |
| OpenColorIO + LittleCMS + skcms | 영화(OCIO)·인쇄(LCMS)·브라우저/Skia(skcms) 색 변환을 각각 강하게 지원 | 색공간 변환의 다중 엔진 중복 적용 위험 — ColorPipeline 단일 소유 필요(매트릭스 E20) | 기준선 품질 — cross-engine color chart로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) | 높음 — 수치 변환 결정적 | mixed permissive/LGPL | 중간 — export/display 경계에서만 접촉 | 낮음 | 생산 필수(색관리) |
| Three.js + three-vrm + three-mesh-bvh | 웹 3D 생태계·VRM·fast raycast/BVH·render target 후처리 결합 용이 | 2D editor hot path와 분리된 별도 island 유지 필요(매트릭스 E21) | 높음(정성) — 웹 3D 사실상 표준 생태계 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — 코드 스플리팅·lazy-load 전제 | GPU 렌더 — 보조 패스(depth/normal/ID)는 허용 오차 diff | MIT 및 프로젝트별 permissive | 중간 — texture/vector pass를 2D로 전달 | 낮음 | 생산 3D 계층(pose·camera·배경·보조 패스) |
| Rapier + Jolt + Manifold | Rapier 강체/충돌, Jolt 고급 물리 후보, Manifold 견고한 mesh boolean | 동일 기능 엔진 동시 상주 금지 — 기능별 단일 선택(매트릭스 E22) | 해당 없음(시뮬레이션/기하) — bake 결과로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 중간(정성) — 기능별 lazy-load | 시드 고정 + command/bake 동기화로 결정성 확보(협업 계약) | permissive 프로젝트 조합 | 중간 | 중간 | 기능별 선택(물리·mesh boolean) |
| WebCodecs + Mediabunny + FFmpeg | 브라우저 하드웨어 codec → JS container → 범용 bridge의 단계적 조합 | codec capability·라이선스를 파일별 탐지 필요(매트릭스 E23). WebCodecs 미지원 codec 존재 | 해당 없음(미디어 IO) — 인코딩 품질은 기준 diff | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | WebCodecs 낮음 / FFmpeg bridge 높음(정성) | 인코더별 상이 — 검증 필요 | mixed(FFmpeg는 빌드 구성에 따라 LGPL/GPL) | 중간 | 중간 | 생산 미디어 계층 |
| Yjs 또는 Loro | 의미 객체·텍스트·트리의 local-first 협업, undo/presence/version | 대형 raster tile은 CRDT에 부적합 — CAS 분리 필수. 한 문서에 CRDT 혼용 금지(매트릭스 E24) | 해당 없음(협업 계층) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) | 수렴 보장(CRDT 특성), 시뮬레이션은 command+seed+bake만 동기화 | permissive | 낮음 | 낮음 | 생산 협업 계층 |
| OPFS + SQLite WASM | 대형 파일·타일의 브라우저 로컬 저장 + metadata/index/journal 구조화 | OPFS는 백업이 아님 — 외부 복구 패키지·cloud sync 필요(매트릭스 E25) | 해당 없음(저장 계층) — CRC/무결성 검증으로 판정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — SQLite WASM 단일 모듈 | 높음 — append journal + CRC 계약(ADR 0007) | standards / SQLite public domain | 낮음 | 낮음 | 생산 저장 계층 |
| React Aria + Radix + XState | 접근 가능한 DOM 입력·메뉴/팝오버 primitives·명시적 tool state machine | 캔버스 hot path의 샘플·입자를 React state에 넣지 않는다는 계약 필요(매트릭스 E26) | 해당 없음(UI 계층) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음~중간(정성) | 해당 없음 | permissive | 낮음 — CommandRegistry 단일 공유 | 낮음 | 생산 웹 UI |
| Xilem + Masonry | 선언형 reactive view diff + retained widget tree·event/update/layout/paint pass | 공식 프로젝트가 experimental — 웹 UI 전면 교체에 사용 금지(매트릭스 E27) | 미검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 해당 없음(현 웹 범위 외) | 미검증 | permissive | 높음 — 현 스택과 별도 shell | 높음 — experimental | 연구·네이티브 후보 |
| wgpu / WebGPU + ToonGpuExtensions | 검증 엔진 결과를 같은 frame graph에 연결, sparse tile·진단·ToonWet 등 제품 특화 공백 충전 | 자체 엔진 전체를 새로 만들지 않음 — 부족한 pass만 작은 custom module(매트릭스 E28) | 목표 높음 — 승격 조건은 reference corpus에서 기존 엔진 대비 우위 입증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 낮음(정성) — 얇은 확장만 유지 | 모듈별 결정성 계약 필수(승인 PR에 deterministic reference 요구) | internal + wgpu permissive | 최저 — frame graph 내부 | 내부 소유 — 팀 역량에 종속 | 필수 얇은 확장(승격 가능 custom 후보) |

## 3. 자체 구현·fork 비교 후보 (금지가 아니라 경쟁 대상)

아키텍처 §6.3에 따라 다음은 기존 Provider와 동일 corpus에서 경쟁하는 정식 후보다. 승격 조건은 §3.3의 8개 증거 조건 중 하나 이상을 벤치마크·시각 자료로 입증하는 것이다.

| Candidate | 경쟁 상대 | 승격 판정 corpus |
| --- | --- | --- |
| custom stabilizer | Google Ink Stroke Modeler | 잉킹 blind test + p95 지연 |
| ToonWet wet-media solver | libmypaint/Hokusai 수채 preset | backrun·granulation·건조 타임라인 골든 이미지 |
| custom dab renderer | CanvasKit batched dab | 1,000px 브러시 처리량 |
| custom smudge/multi-layer transport | libmypaint smudge | 다중 레이어 비파괴 참조 corpus |
| custom particle/SDF brush | 기존 Provider 공백 영역 | CSP 초과 고유 기능 게이트 |
| custom vector stroke mesh | Google Ink mesh / Perfect Freehand | 부분 획 편집 시나리오 |

## 4. 측정 공백 요약

- 모든 후보의 p50/p95/p99·Peak Memory·cache hit rate는 **미실측**이다. Phase 0에서 EngineCapabilityRegistry + benchmark harness를 먼저 구축하고, Phase 1 이후 동일 SceneIR/StrokeIR/FilterIR corpus로 채운다.
- Visual Quality의 정성 평가는 golden image·cross-renderer diff·CSP blind test(Phase 7)로만 확정한다. 근거 없는 "지원 완료" 표시는 마스터 프롬프트 절대 규칙 9에 의해 금지된다.
