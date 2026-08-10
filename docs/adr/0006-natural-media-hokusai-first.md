# ADR 0006 — 자연매체: 리포 기보유 studio-hokusai-wasm을 NaturalMediaProvider 1차 후보로, libmypaint parity lab으로 교차 검증

## 상태

승인 (2026-08-07)

## 맥락

자연매체(연필·색연필·수채·유화·혼색·smudge)의 매트릭스 판정:

- libmypaint(E11): "MyPaint와 여러 페인팅 프로그램이 사용한 brush dynamics, tiled surface, smudge, .myb 생태계를 제공한다." 위험 — "C 기반 WASM 포팅·메모리 경계·업데이트 정체를 관리해야 한다." 판정: **자연매체 기준선**.
- Hokusai(E12): "libmypaint에서 영감을 받은 순수 Rust 브러시 엔진으로 WASM/native를 목표로 하고 .myb 호환을 지향한다." 권장 조합 — "libmypaint와 동일 입력·동일 preset corpus로 비교해 더 빠르거나 유지보수성이 좋은 경로를 선택한다." 위험 — "신규 프로젝트이므로 기능·픽셀 동등성과 장기 유지보수를 검증한다." 판정: **품질 게이트 후보**.

결정적으로, 이 리포에는 이미 `packages/studio-hokusai-wasm` 크레이트가 존재한다: hokusai-brush/core/tile-mem `=0.3.0` 고정, MIT OR Apache-2.0, "Transparent deterministic Hokusai natural-media renderer for ToonSpectrum Studio", 릴리스 계약·품질 검증 스크립트(`scripts/studio-hokusai-wasm-release-contract.mjs`, `verify-studio-hokusai-natural-media-quality.mjs` 등) 동반. 이는 §12의 "기존 화면·기능·테스트는 요구사항과 비교 자료로 읽을 수 있다" 범위를 넘어 재사용 가능한 검증 자산이다.

아키텍처 §1.2 결합 유형 8이 "교차 검증: Hokusai와 libmypaint를 같은 corpus로 비교"를 명시하고, Phase 2가 "libmypaint/Hokusai parity"를 요구한다.

## 결정

1. **리포 기보유 studio-hokusai-wasm 크레이트를 V11 NaturalMediaProvider의 1차 후보로 재사용한다.** `crates/hokusai-adapter-v11`은 이 크레이트(hokusai-* =0.3.0 고정)를 기반으로 하고, 기존 릴리스 계약·결정성 검증 스크립트를 V11 벤치마크 하니스로 이관한다.
2. **libmypaint parity lab을 교차 검증 축으로 상설 운영한다.** `crates/mypaint-adapter-v11`(C→WASM, worker 격리)을 구축하고, 동일 입력 스트림·동일 .myb preset corpus로 두 엔진을 병렬 실행해 스트로크 커버리지·지각 diff·성능을 비교한다(benchmark-plan.md §3의 parity 채점 기준).
3. **주력 판정은 corpus 결과에 위임한다.** parity lab에서 Hokusai가 품질 동등 이상 + 성능/유지보수 우위를 보이면 주력 확정, 품질 미달 preset 군은 해당 군만 libmypaint로 라우팅한다(BrushProgramIR 단위 라우팅 — 전부 아니면 전무가 아니다).
4. 습식 현상(backrun·granulation·건조 타임라인)은 두 엔진 모두의 공백이므로 ToonWet 확장이 담당하되(§5 수채·수묵), "검증 엔진에 없는 습식 현상 또는 명확한 품질 우위가 입증된 경우"(§6.2)로 범위를 한정한다.
5. 합성 계약: dynamics/dab 계산은 Hokusai/libmypaint worker, tile 합성은 CanvasKit/Skia tile surface, guide·vector overlay는 Vello(§5 연필·색연필 권장 파이프라인). 자연매체 엔진은 Surface를 소유하지 않는다(ADR 0003).

## 근거

- Verified-first는 "이미 검증된 기능을 무의미하게 중복 개발하지 않는" 정책이다(§0.1) — 사내에서 이미 결정성 계약·품질 게이트를 통과시킨 Hokusai WASM 크레이트를 버리고 처음부터 다시 시작하는 것이 오히려 중복 개발이다.
- Hokusai는 순수 Rust라 V11의 Rust 어댑터 계층·WASM 단일 툴체인과 정합하고, libmypaint의 위험 항목(C 포팅·메모리 경계)을 구조적으로 회피한다(E12 고유 장점).
- 그럼에도 libmypaint를 버리지 않는 이유: (1) .myb 생태계의 사실상 기준 구현이므로 "MYB 호환"(E11 최적 담당)의 정답지 역할, (2) Hokusai가 "신규 프로젝트"라는 매트릭스 위험을 상쇄할 교차 기준 — §1.2 유형 8이 요구하는 구도다.
- preset 군 단위 라우팅은 "장점별 하이브리드 조합" 원칙의 직접 적용이다 — 두 엔진의 판정이 preset마다 다를 수 있음을 매트릭스가 전제한다("더 빠르거나 유지보수성이 좋은 **경로**를 선택").
- 성능·픽셀 비교 수치는 현재 미실측이므로 주력 확정을 corpus 실측에 위임하는 것이 Evidence-driven 원칙에 부합한다.

## 결과

- `crates/hokusai-adapter-v11`이 studio-hokusai-wasm을 의존으로 갖고, 기존 verify 스크립트의 계약(결정성·자연매체 품질)이 V11 게이트로 승계된다.
- parity lab이 `/tests/corpus/brushes`의 .myb corpus + 기록 입력 스트림을 공유 기준으로 사용한다 — corpus에 MyPaint 표준 preset과 ToonStudio Golden Master 자연매체 군이 모두 필요하다.
- libmypaint 어댑터는 주력이 아니어도 폐기하지 않는다: MYB import의 의미 검증기(정답지)이자 품질 미달 preset 군의 폴백으로 상주 가능(lazy-load worker, 미사용 시 메모리 회수).
- MYB import 경로는 어느 엔진이 실행하든 동일 BrushProgramIR로 정규화된다 — preset이 provider에 묶이지 않는다(ADR 0005와 동일 계약).
- ToonWet은 별도 승격 트랙(§6.3 custom wet-media solver)으로, 승인 PR 증거 요구(reference images·benchmark raw data 등)를 따른다.

## 재검토 조건

- parity lab 실측에서 Hokusai가 광범위한 preset 군에서 품질 미달로 판정될 때(주력을 libmypaint로 역전, Hokusai는 게이트 재도전 트랙으로).
- Hokusai 상류(hokusai-* crates)의 유지보수가 정체되거나 파괴적 변경이 반복될 때(사내 fork 공식화 또는 libmypaint 축 강화).
- libmypaint 상류가 활발해져 WASM 공식 지원 등 위험 항목이 해소될 때(비교 조건 갱신).
- ToonWet이 습식 corpus에서 두 검증 엔진 대비 우위를 입증할 때(§6.2 조건 발효 — 습식 계열 주력 승격은 별도 ADR).
