# ADR 0009 — Google Ink PoC 게이트 유지와 잉킹 폴백 레인 확정

## 상태

승인 (2026-08-07)

## 맥락

V11.1 §5는 전문 잉킹의 우선 후보로 Google Ink(Stroke Modeler·BrushBehavior·mesh)를 두고,
"포팅 실패 시 Perfect Freehand+Kurbo+Vello로 자동 폴백"을 명시한다. 매트릭스 E09는 위험으로
"공식 웹 SDK가 아니며 API 안정성을 강하게 보장하지 않는다. 고정 commit·WASM 포팅이 필요하다"를
기록한다.

조사 결과(2026-08-07):
- https://github.com/google/ink — C++/Bazel 빌드, 공식 WASM/Emscripten 타깃과 npm 배포 부재.
  브라우저 소비를 위한 지원 경로가 상류에 존재하지 않아 자체 emsdk 툴체인 구축·유지가 전제된다.
- https://github.com/google/ink-stroke-modeler — 입력 모델링(예측·평활) 단독의 소형 C++ 라이브러리.
  전체 Ink 포팅 대비 표면적이 크게 작아 현실적인 1차 PoC 대상이다.
- 현재 리포에는 이미 검증 게이트를 통과한 잉킹 레인이 출하되어 있다: perfect-freehand 1.2.3
  기반 StrokeGeometryProvider(packages/studio-brush-platform) + Kurbo 편집 프록시
  (fit_polyline_json, crates/studio-engine-vello) + 결정적 베이크·교차 렌더 검증.

## 결정

1. **출하 잉킹 레인은 Perfect Freehand + Kurbo 프록시로 확정**한다(§5 폴백 절 적용). 이 레인은
   이미 결정성·편집 프록시·교차 렌더 증거를 보유한다.
2. Google Ink는 **PoC 게이트 뒤의 후보로 유지**한다. 게이트 진입 조건:
   - 고정 commit 핀 + 자체 emsdk/Bazel 빌드 파이프라인의 재현 가능 빌드
   - 1차 범위는 ink-stroke-modeler 단독(입력 모델링 비교: 지연·평활 품질 vs 자체 스태빌라이저)
   - Brush Fidelity Lab 코퍼스에서 perfect-freehand 레인 대비 시각 품질/일관성 우위 입증(§3.3)
3. PoC가 우위를 입증하면 §6.2 GoogleInkProvider로 승격하고, 실패하면 본 ADR이 폴백 확정의
   영구 근거가 된다.

## 결과

- 잉킹 로드맵이 외부 포팅 리스크에 블로킹되지 않는다.
- EngineRegistry의 stroke-geometry 폴백 체인은 perfect-freehand가 head를 유지한다.

## 재검토 조건

- 상류가 공식 WASM/웹 배포를 제공할 때.
- ink-stroke-modeler PoC가 게이트 지표에서 우위를 보일 때.
