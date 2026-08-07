# ADR 0004 — 2D 기준선: CanvasKit 0.41.1(생산) + vello_cpu 0.2.0(결정적 CPU 기준선)

## 상태

승인 (2026-08-07)

## 맥락

배치 매트릭스는 Skia/CanvasKit을 "생산 기준선"(E01), Vello CPU를 "필수 기준선"(E04), Vello Classic/Hybrid를 "조건부 가속기"(E02/E03)로 판정한다. 근거는 다음과 같다.

- CanvasKit: "Path, Canvas, Paint, Paragraph, ImageFilter, RuntimeEffect, Skottie를 하나의 성숙한 그래픽 코어에서 제공한다. 일반 레이어 합성·마스크·텍스트·기준 출력의 안전한 기준선이다"(E01). 위험은 "WASM 번들·객체 수명·독립 GPU context 비용" 관리.
- Vello CPU: "GPU와 분리된 CPU 기준 결과를 제공해 시각 회귀, 썸네일, 장애 복구, 서버 렌더에 활용"(E04). "CanvasKit Software·resvg·tiny-skia와 교차 기준을 구성한다."
- Vello Classic: "공식 저장소가 알파 상태를 명시한다. 메모리·필터·글리프 캐시를 자체 게이트로 검증한다"(E02 위험). Hybrid: "현재 API와 기능 동등성이 계속 변한다. 마스크·필터 지원을 capability probe로 확인한다"(E03 위험).

Phase 1의 요구는 "동일 ToonSceneIR을 CanvasKit과 Vello에서 렌더, cross-renderer diff, one-primary-surface 규칙"(§13 Phase 1)이다. 기준선 없이는 이후 모든 provider의 시각 품질 판정이 불가능하다.

## 결정

1. **CanvasKit을 버전 0.41.1로 고정해 생산 기준선으로 채택한다.** 기본 페인팅 Surface의 주 소유자이며, 마스크·혼합·텍스트(Paragraph)·실시간 필터·기준 출력(export reference)을 담당한다.
2. **vello_cpu를 버전 0.2.0으로 고정해 결정적 CPU 기준선으로 채택한다.** 용도: cross-renderer diff의 결정적 참조, golden image 생성, GPU 장애·context-loss 복구 렌더, 백그라운드/서버 export.
3. 두 기준선 버전은 명시적 ADR 개정 없이 올리지 않는다. 버전 업은 golden corpus 전체 재검증을 동반한다.
4. **Vello Classic/Hybrid는 capability probe 후 단계 도입한다.** CapabilityRegistry가 문서·장면별로 probe(마스크·필터·글리프 캐시·메모리)를 실행해 통과 구간에만 벡터 장면 허브 소유자로 배정하고, 미통과 구간은 CanvasKit이 유지한다. "Vello의 알파 상태와 현행 제한 때문에 기능을 숨기지 않는다. CapabilityRegistry가 불안정한 구간만 다른 Provider로 보낸다"(§8).
5. cross-renderer diff는 CanvasKit(GPU/SW) ↔ vello_cpu ↔ resvg/tiny-skia의 교차 기준 매트릭스로 운용한다(benchmark-plan.md §3).

## 근거

- 두 기준선의 역할이 상보적이다: CanvasKit은 **기능 폭과 성숙도**(만화 제작에 필요한 마스크·텍스트·필터를 지금 제공), vello_cpu는 **결정성**(GPU 비트 편차 없는 참조 픽셀)을 제공한다. 어느 한쪽만으로는 "생산 가능"과 "회귀 검증 가능"을 동시에 만족하지 못한다.
- 버전 고정은 golden image 기준의 전제다 — 기준선이 흔들리면 모든 diff가 의미를 잃는다. Provider descriptor의 `version/commit` 필수 선언(§2.2)과 일관된다.
- Vello Classic/Hybrid의 즉시 전면 채택을 배제한 것은 알파 상태(공식 저장소 명시, E02)라는 공개된 정성적 사실 때문이며, 배제가 아니라 **조건부 도입**인 것은 "대량 동적 벡터 처리 상한"이라는 고유 장점(E02)이 선화·컷·효과선 등 Vello 우선 영역(§8)에 필요하기 때문이다.
- 성능 수치 기반 판정(어느 장면에서 Vello가 CanvasKit보다 빠른가)은 현재 **미실측**이므로, 도입 게이트를 벤치마크 하니스 실측에 위임하는 것이 Evidence-driven 원칙(§0.1)에 부합한다.

## 결과

- `crates/skia-adapter-v11`과 `crates/vello-adapter-v11`이 Phase 1 첫 구현 대상이 된다. 동일 SceneIR을 양쪽에서 렌더하는 diff 하니스가 CI에 들어간다.
- CanvasKit 0.41.1의 WASM 번들 비용(E01 위험)은 로드 전략(스트리밍 컴파일·캐시)으로 관리하고 benchmark 하니스가 로드 시간을 기록한다.
- vello_cpu가 GPU 장애 복구 경로가 되므로, 모든 벡터 장면은 vello_cpu로 렌더 가능해야 한다 — Vello Classic/Hybrid 전용 기능을 쓸 때도 CPU 폴백 경로를 유지한다.
- Vello Classic/Hybrid 도입 시점마다 capability probe 결과와 벤치마크 raw data가 ProviderBenchmarkRegistry에 축적된다.
- 텍스트는 CanvasKit Paragraph가 기준선·폴백이고 Parley 스택은 조건부 핵심(E07)으로 별도 트랙에서 검증된다.

## 재검토 조건

- Vello가 알파를 벗어나 안정 릴리스를 선언하고, 벡터 corpus 벤치마크에서 CanvasKit 대비 우위가 실측될 때(벡터 장면 허브의 기본 소유자 승격 검토).
- CanvasKit 0.41.1 또는 vello_cpu 0.2.0에 보안·치명 결함이 공개되어 버전 고정 유지가 불가능할 때(긴급 버전 업 + golden corpus 재검증).
- cross-renderer diff에서 두 기준선의 구조적 불일치(라운딩 이상의 차이)가 반복 검출될 때(기준선 정의 재검토).
- WebGPU 미지원 환경 비중이 실사용 데이터에서 유의하게 높을 때(CanvasKit 단독 프로필의 공식화).
