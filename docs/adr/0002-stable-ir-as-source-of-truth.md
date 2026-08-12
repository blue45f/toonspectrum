# ADR 0002 — Stable IR을 문서 원본으로, 엔진 객체는 재생성 가능한 캐시로

## 상태

승인 (2026-08-07)

## 맥락

V11 아키텍처 §2.1은 다음을 규정한다: "`SkPath`, `vello::Scene`, `GeglNode`, `cv::Mat`, `THREE.Object3D`를 프로젝트 원본으로 저장하지 않는다. 원본은 안정적인 ToonStudio IR이고, 엔진 객체는 재생성 가능한 cache다." 마스터 프롬프트도 `COMMON_IR_REQUIRED=TRUE`와 절대 규칙 6("엔진 객체는 문서 원본으로 저장하지 않는다")으로 이를 고정한다.

IR 계열은 InputIR/StrokeIR/BrushProgramIR/PathIR/ShapeIR/TextIR/PaintIR/LayerGraphIR/EffectGraphIR/ComicGraph/AnimationGraph/Scene3DIR/MotionCaptureIR/AssetPackageIR/FormatInteropIR/CommandJournal/RecoveryIR로 정의되어 있다(§2). 문제는 이 스키마의 **캐노니컬 구현 언어**다. 스파인 패키지(project-model, provider-catalog, command-registry)는 TypeScript로 먼저 서고, 어댑터 크레이트(`crates/*-v11`)는 Rust다. 두 언어에 스키마를 이중 정의하면 드리프트가 필연이다.

## 결정

1. **문서 원본은 ToonStudio Stable IR이다.** 어떤 엔진 네이티브 객체도 직렬화해 저장하지 않는다. 엔진 객체는 IR로부터 언제든 재생성 가능한 캐시이며, 캐시 폐기는 데이터 손실이 아니다.
2. **1차 구현에서는 TypeScript + zod 스키마가 캐노니컬이다.** `crates/project-model-v11`(및 TS 스파인 패키지)의 zod 정의가 IR의 단일 진실이고, 직렬화 포맷·버전 규칙·마이그레이션 규칙을 이 층이 소유한다.
3. **Rust 어댑터는 serde 미러를 갖는다.** 각 어댑터 크레이트는 자신이 소비하는 IR 부분집합의 serde 타입을 유지하되, 이는 zod 캐노니컬의 파생물이다.
4. **교차 언어 golden 테스트로 정합을 검증한다.** 동일 IR 샘플 corpus(`/tests/corpus`)를 zod와 serde 양쪽에서 파싱·재직렬화해 바이트/의미 동등성을 CI에서 강제한다. 미러 불일치는 릴리스 차단이다.
5. Rust 측이 성숙해 IR 소유권을 넘길 필요가 입증되면(성능·단일화), 캐노니컬을 Rust로 승격하는 것은 별도 ADR로 결정한다 — 이 단계적 접근 자체가 본 결정의 일부다.

## 근거

- §2.1의 원본/캐시 분리는 엔진 교체·폴백·버전업에도 문서가 불변임을 보장한다 — Verified-first 정책에서 provider는 경쟁·교체 대상이므로(§0.1), 원본이 특정 엔진 객체에 묶이면 교체 자체가 불가능해진다.
- IR 원본이 있으면 복구 후 **동일 provider pin**으로 seed 재실행해 데이터 손실 없이 재렌더할 수 있다. 자연매체는 엔진 교체 폴백이 아니라 fail-closed + journal 보존이다(`natural-media/hybrid-design.md` §4). 포트폴리오 전반의 capability 라우팅은 `engine-portfolio/hybrid-design.md` §5를 본다.
- TS+zod 선행은 스파인이 웹 셸·CommandRegistry·스토리지와 같은 언어로 시작해 반복 속도가 가장 빠르고, zod가 런타임 검증·JSON 직렬화·타입 추론을 동시에 제공하기 때문이다.
- serde 미러 + golden 테스트는 이중 정의의 드리프트 위험을 "감지 불가능한 버그"에서 "CI 실패"로 격하한다. 매트릭스의 검증 게이트(golden image 계열)와 동형의 접근이다.

## 결과

- 모든 provider adapter는 IR→엔진 객체 컴파일러와 (필요 시) 엔진 결과→IR 역변환을 구현한다. `EngineProvider::compile(&self, job: &JobIR)` 시그니처(§2.2)가 이 계약을 고정한다.
- IR 스키마 변경은 zod 정의 변경 → serde 미러 갱신 → golden corpus 갱신의 3단계를 강제하는 체크리스트가 필요하다.
- 교차 언어 golden 테스트 스위트가 `/tests/corpus` 아래에 상주하며 CI 필수 게이트가 된다.
- 캐시 재생성 비용이 성능 예산에 들어간다 — 캐시 무효화·재컴파일은 benchmark-plan.md의 측정 대상이다.
- 저장 계층(ADR 0007)은 IR과 CommandJournal만 영속화하면 되므로 엔진 버전업에 대해 전방 호환이다.

## 재검토 조건

- 교차 언어 golden 테스트의 유지 비용이 실질 개발 속도를 저해하거나, 드리프트 사고가 반복될 때(캐노니컬 단일화 — Rust 승격 또는 코드 생성 파이프라인 도입).
- Rust 스파인이 성숙해 TS 층이 얇은 뷰모델로 축소될 때(캐노니컬을 Rust+serde로 이전하는 후속 ADR).
- IR 직렬화가 대형 문서에서 성능 병목으로 실측될 때(바이너리 포맷·부분 로드 재설계).
