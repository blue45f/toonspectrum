# ADR 0005 — 잉킹 파이프라인 단계 도입: perfect-freehand 1.2.3 + 커스텀 스태빌라이저 선출하, Google Ink는 PoC 게이트 후 승격

## 상태

승인 (2026-08-07)

## 맥락

전문 잉킹의 권장 하이브리드는 "Pointer Events/장치 교정 → Google Ink Stroke Modeler·BrushBehavior → mesh → Vello 선택·편집 overlay → CanvasKit/Skia 기준 출력"이며, "Google Ink 포팅 실패 시 Perfect Freehand+Kurbo+Vello로 자동 폴백한다"(§5 전문 G펜·매핑펜).

두 후보의 매트릭스 판정:

- Google Ink(E09): "원시 입력을 모델링하고 brush effect를 적용해 mesh 기반 vector stroke를 생성한다. pressure·tilt·speed 등 풍부한 동역학에 적합하다." 위험 — "공식 웹 SDK가 아니며 API 안정성을 강하게 보장하지 않는다. 고정 commit·WASM 포팅이 필요하다." 판정: **PoC 후 주력 후보**.
- Perfect Freehand + Lyon(E10): "압력 기반 outline 생성이 간단하고, Lyon은 Rust path tessellation에 강하다." 위험 — "자연매체·복합 브러시 전체를 대신하지는 않는다." 판정: **안정 폴백**.

잉킹은 입력→첫 preview p50 4ms/p95 8ms 게이트(§9.3)와 CSP blind test(§13 Phase 7)의 직접 대상이며, Phase 2("Google Ink PoC와 fallback")가 이 순서를 이미 전제한다. 미검증 WASM 포팅을 주력 경로에 두고 출하하는 것은 "근거 없는 지원 완료 표시 금지"(절대 규칙 9)에 어긋난다.

## 결정

1. **1차 출하 잉킹 경로는 perfect-freehand 1.2.3(버전 고정) + 커스텀 스태빌라이저다.** 파이프라인: 자체 저지연 stabilizer → Perfect Freehand outline(+기술 펜은 Kurbo/Lyon 중심선) → Kurbo fitting으로 편집 가능한 PathIR → Vello/CanvasKit 렌더.
2. 커스텀 스태빌라이저는 §6.3이 명시한 자체 구현 허용 범위("custom stabilizer")로, 처음부터 정식 Provider 후보로 개발한다. 예측 최소화·자/도형 constraint 선적용(§5 정밀 기술 펜) 요구를 담당한다.
3. **Google Ink는 고정 commit 기반 WASM PoC를 별도 트랙으로 진행한다.** upstream 고정 commit + 로컬 패치 목록 + 라이선스 사본을 어댑터 크레이트(`crates/google-ink-adapter-v11`)에 동봉한다.
4. **승격 게이트**: PoC가 다음을 모두 통과하면 Google Ink를 전문 잉킹 주력 Provider로 승격하고 perfect-freehand 경로를 폴백으로 강등한다.
   - 잉킹 corpus에서 blind test 손맛 평가가 perfect-freehand 경로와 동률 이상
   - 입력→첫 preview p50/p95 게이트 충족 (수치는 미실측 — tests/benchmarks 하니스로 측정)
   - peak WASM memory·mesh→PathIR 변환 비용이 게이트 내
   - 고정 commit 재현 빌드와 결정성 검증 통과
5. 승격 후에도 폴백 체인은 유지한다: Google Ink → perfect-freehand+Kurbo → CanvasKit 래스터 스트로크(최후 보장선).

## 근거

- "PoC 후 주력 후보"(E09)라는 판정 자체가 단계 도입을 요구한다 — 공식 웹 SDK가 아닌 코드의 WASM 포팅은 성공이 보장되지 않으며, 아키텍처도 "Google Ink 포팅 실패 시 자동 폴백"을 명시해 실패 경로를 1급 설계로 둔다.
- perfect-freehand는 단순·안정·permissive(E10)이고 결정적 outline 생성이라 export geometry 요구("deterministic export geometry", E10 최적 담당)까지 겸한다. 1차 출하선으로서 위험이 가장 낮다.
- 버전 1.2.3 고정은 브러시 손맛의 회귀 기준(Golden Master 스트로크)을 안정시킨다 — 스태빌라이저·outline 알고리즘이 조용히 바뀌면 blind test 기준이 무너진다.
- 커스텀 스태빌라이저를 외부 라이브러리 대신 자체 구현으로 두는 것은 §3.3 조건 5(CSP를 넘어서는 고유 기능 — 장치 교정·palm rejection·자/도형 constraint와의 통합)에 해당하며, Verified-first 정책에서도 "비교를 통과한 하나의 후보 Provider"로 정당하다.
- 승격을 벤치마크 게이트에 위임하는 것은 Evidence-driven Custom 원칙(§0.1)의 대칭 적용이다 — 외부 엔진의 승격도 자체 구현과 같은 증거 기준을 통과해야 한다.

## 결과

- Phase 2에서 perfect-freehand 경로가 먼저 수직 슬라이스로 출하되고, Google Ink PoC는 `crates/google-ink-adapter-v11`에서 병행한다.
- 잉킹 corpus(기록된 입력 스트림 + Golden Master 스트로크)가 두 경로의 공통 판정 기준이 된다 — corpus 구축이 승격 게이트의 선행 조건이다.
- 스태빌라이저는 독립 모듈로 유지되어 Google Ink 승격 후에도 전단(pre-filter)으로 재사용 가능하다(§5의 파이프라인에서 장치 교정과 Stroke Modeler는 별개 단계).
- 부분 획 편집(E09 최적 담당) 같은 mesh 의존 기능은 Google Ink 승격 전까지 출하하지 않거나 PathIR 기반 축소판으로 제공한다 — 기능 표에 "지원 완료"로 표시하지 않는다.
- BrushProgramIR의 input_graph/stabilizer/geometry 슬롯이 두 경로를 같은 프리셋으로 구동할 수 있어야 한다 — 프리셋이 특정 provider에 묶이지 않는다.

## 재검토 조건

- Google Ink PoC가 게이트를 통과해 승격될 때(본 ADR의 폴백 강등 조항 발효 — 결과 기록 개정).
- PoC가 2회 이상 게이트에 실패하거나 upstream 변경으로 고정 commit 유지 비용이 과도해질 때(Google Ink 트랙 중단, perfect-freehand+커스텀 확장을 항구 주력으로 확정).
- perfect-freehand 상류에 손맛·성능에 영향 있는 릴리스가 나올 때(1.2.3 고정 해제 여부를 golden 스트로크 재검증과 함께 결정).
- 커스텀 벡터 스트로크 메시(§6.3 "custom vector stroke mesh")가 자체 벤치마크에서 두 외부 후보 모두를 능가할 때(제3 후보 승격 검토).
