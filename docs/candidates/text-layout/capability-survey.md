# ToonStudio V11 — text-layout 후보 역량 조사 (Capability Survey)

- 기준일: 2026-08-07
- 담당 서브시스템: **text-layout** (텍스트 셰이핑·문단 레이아웃·글리프 렌더 자원)
- 관련 매트릭스 행: **E01 (Skia/CanvasKit)**, **E07 (Parley + Fontique + HarfRust + Skrifa + ICU4X)**, **E08 (Glifo)**
- 권위 소스:
  - `docs/architecture/ToonStudio_검증엔진우선_하이브리드최적조합_선택적자체구현_최종아키텍처_V11_2026-08-07.md`
  - `docs/architecture/ToonStudio_V11_하이브리드엔진_장점조합_배치매트릭스.csv`

## 0. 조사 전제

V11 최종 아키텍처의 결정을 그대로 반영한다.

1. **1차 구현(Phase 1)에서 텍스트의 기준선은 CanvasKit Paragraph(SkParagraph)다.** 모든 텍스트 island는 CanvasKit이 소유한다.
2. **vello 어댑터는 CapabilityRegistry에 `text: unsupported`로 등록된다.** 따라서 HybridExecutionPlanner는 텍스트가 포함된 island를 자동으로 CanvasKit으로 라우팅한다. Vello가 텍스트를 렌더하지 못해서 기능을 숨기는 것이 아니라, capability 선언과 라우팅으로 해결한다(아키텍처 §8).
3. Parley 스택(E07)은 "조건부 핵심"이다. 한중일 말풍선·문단·효과음·세로쓰기 기반·번역 재배치의 **차기 주력 후보**로 평가하되, CanvasKit Paragraph를 기준선·폴백으로 유지한다.
4. **CJK 세로쓰기와 금칙(禁則) 처리는 두 진영 모두에 공백이 있다.** 이 갭은 어느 엔진을 채택하든 제품 전용 확장이 필요하다(§3 참조).
5. 성능 수치는 전부 **미실측**이다. 수치 칸에 추정치를 적지 않고, `tests/benchmarks` 하니스(아키텍처 §12·Phase 0)로 측정한 뒤에만 기입한다.

## 1. 후보 역량 매트릭스

> p50/p95/p99·Peak Memory는 아직 측정 전이므로 전 후보 공통으로 "미실측 — tests/benchmarks 하니스로 측정"으로 표기한다. 정성 서술은 공개 문서·저장소 기준이며 근거는 §2에 있다.

| Candidate | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **CanvasKit Paragraph (SkParagraph)** | 셰이핑(HarfBuzz)·분절(ICU)·폰트 폴백·문단 레이아웃·데코레이션·placeholder를 성숙한 단일 API로 제공. Flutter가 동일 코어를 대규모 프로덕션에서 사용해 검증됨. 렌더 Surface(Skia)와 동일 엔진이라 레이아웃→렌더가 무복사 | 세로쓰기(writing-mode: vertical) 미지원, JIS X 4051 수준의 금칙 커스터마이즈·ぶら下がり(행말 매달림)·루비 미지원, 커스텀 line-break 규칙 주입 API 제한적 | 기준선 품질. 서브픽셀 AA·hinting·데코레이션·다국어 폴백이 안정적. 세로쓰기·고급 CJK 조판은 미지원이므로 해당 영역은 평가 불가 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | CanvasKit WASM은 렌더 코어로 이미 번들되므로 텍스트에 대한 **증분 비용 ≈ 0** (Paragraph 포함 빌드 플래그 필요). 메인/워커 어디서든 Surface와 동일 컨텍스트 | 동일 버전·동일 폰트 등록 시 플랫폼 간 결정적(자체 셰이퍼·ICU 데이터 내장, 시스템 폰트 스택 비의존). GPU/CPU(Software) 백엔드 간 픽셀 차이는 golden diff로 관리 | BSD-3-Clause (Skia) | **최소.** 레이아웃과 렌더가 같은 island. Vello 장면과 섞일 때만 texture island 복사 1회 | 낮음. Google/Skia가 유지보수하는 성숙 코어. 단, C++ 코어 확장(금칙 등)은 fork 비용이 큼 | **Phase 1 생산 기준선.** 모든 텍스트 island의 소유자. 이후 단계에서도 기준 검증·폴백으로 상시 유지 |
| **Parley 스택 (Parley + Fontique + HarfRust + Skrifa + ICU4X, 통합)** | 셰이핑·분절·bidi·폰트 폴백·선택/편집 모델을 **전부 Rust 계층에서 조합** 가능. 각 단계가 crate로 분리되어 금칙·세로쓰기 같은 제품 전용 확장을 레이아웃 파이프라인 내부에 삽입할 수 있음(하이브리드 원칙의 "선택적 자체 구현"에 최적) | 세로쓰기 미지원(횡서 전제), 금칙은 UAX #14 기본 수준(ICU4X segmenter), 루비·縦中横·행말 매달림 미지원, 렌더러 비내장(글리프 런만 산출 — Vello/Glifo가 그려야 하며 Phase 1의 vello 어댑터는 `text: unsupported`) | 셰이핑 품질은 HarfBuzz 계보(HarfRust)로 기대치 높음. 최종 화질은 글리프 래스터라이저(Vello/Glifo) 성숙도에 종속 — Vello는 저장소가 알파 상태를 명시 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 별도 Rust→WASM 모듈(lazy load, Worker 상주). ICU4X는 datagen으로 로케일·세그먼터 데이터를 슬라이스해 번들 최소화 가능. Worker 종료로 메모리 회수 가능(아키텍처 §9.1) | 순수 Rust·자체 데이터 내장으로 플랫폼 간 결정적. 시스템 폰트 열거(Fontique)를 쓰는 경우에만 환경 의존 발생 → 프로젝트 폰트 고정으로 차단 | MIT / Apache-2.0 (Parley·Fontique·Skrifa), MIT 계열 (HarfRust, HarfBuzz 승계), Unicode License (ICU4X) — 전부 permissive | **중간.** 글리프 런 → 렌더러 전달 계층 필요. Phase 1에서는 CanvasKit으로 그릴 경우 glyph ID/위치 → SkTextBlob 변환 어댑터 비용. Vello 직결은 후속 단계 | 중간. Linebender·Google Fonts·HarfBuzz·Unicode 각 조직이 활발히 유지보수하나, crate 간 버전 정합을 우리가 관리해야 함 | **조건부 핵심 (차기 주력 후보).** Phase 1에서는 비활성(벤치 하니스에만 탑재). 세로쓰기·금칙 확장 기반으로 승격 평가 |
| **Parley** (레이아웃·rich text) | rich text 스타일 런, 인라인 박스, 선택/커서 편집 모델을 Rust로 제공. Linebender 생태계(Vello)와 직접 결합 설계 | 세로쓰기·루비·금칙 커스텀 없음. 단독으로는 렌더 불가 | 레이아웃 정확성은 벤치로 검증 필요(자체 화질 없음 — 배치 품질로 평가) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Parley 스택 모듈에 포함(단독 배포 없음) | 결정적(순수 Rust) | MIT / Apache-2.0 | Parley 스택 내부 결합은 무비용. 외부(CanvasKit)로는 어댑터 필요 | 중간. API가 아직 활발히 변동 | Parley 스택의 레이아웃 코어 |
| **Fontique** (폰트 열거·폴백) | 시스템·번들 폰트 열거와 스크립트 기반 폴백 체인 선택을 Rust로 제공 | 자체 셰이핑·레이아웃 없음. 폴백 정책의 제품 커스터마이즈(작품별 폰트 고정)는 상위 계층 몫 | 해당 없음(폰트 선택 계층) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Parley 스택 모듈에 포함 | 시스템 폰트 의존 시 비결정적 → **프로젝트 폰트 잠금 + Rights BOM 고정**으로 결정성 확보 | MIT / Apache-2.0 | 낮음(Parley와 동일 생태계) | 중간 | Parley 스택의 폰트 해석 계층 |
| **HarfRust** (셰이핑) | HarfBuzz의 공식 Rust 포팅 계보. OpenType 셰이핑(합자·대체·마크 부착·커닝)을 unsafe 최소화한 Rust로 제공. WASM 포팅이 C 의존 없이 깔끔함 | 셰이핑 전용 — 분절·레이아웃·렌더 없음. AAT 등 일부 비-OpenType 경로는 HarfBuzz C 대비 커버리지 확인 필요 | 셰이핑 정확도는 HarfBuzz 테스트 스위트 계보로 기대치 높음 — corpus 교차 검증으로 확정 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Parley 스택 모듈에 포함 | 결정적 | MIT 계열(HarfBuzz 라이선스 승계) | 낮음(Parley가 직접 소비) | 낮음~중간. HarfBuzz 조직 산하로 이동해 유지 전망 개선 | Parley 스택의 셰이퍼 |
| **Skrifa** (폰트 파싱·글리프 아웃라인) | Google Fonts fontations 계열. 글리프 아웃라인·메트릭·가변 폰트 축 해석을 메모리 안전한 Rust로 제공 | 래스터라이즈·atlas는 별도(Glifo/Vello 몫). COLR/CPAL 등 컬러 폰트 커버리지는 버전별 확인 필요 | 아웃라인 충실도는 fontations 테스트 기반 — cross-engine 글리프 diff로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | Parley 스택 모듈에 포함 | 결정적 | MIT / Apache-2.0 | 낮음 | 낮음. Google Fonts가 적극 유지 | Parley 스택의 글리프 소스 |
| **ICU4X** (분절·bidi·로케일) | UAX #14 line breaking·UAX #29 분절·bidi를 슬림한 데이터 팩과 함께 Rust로 제공. **금칙 엔진의 기반 데이터 계층으로 단독 채택 가치가 있음** — CanvasKit 기준선 시기에도 금칙 사전 분석(줄바꿈 후보 산출)에 활용 가능 | UAX #14 기본 클래스 수준 — JIS X 4051 전체(분리 금지 세분·매달림·추입/추출 우선순위)는 미제공 → 제품 전용 KinsokuEngine 필요 | 해당 없음(텍스트 분석 계층) | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 데이터 슬라이싱(datagen) 지원으로 필요 로케일만 탑재 가능. 단독 WASM 모듈로도, Parley 스택 동봉으로도 배포 가능 | 결정적(데이터 버전 고정 시) | Unicode License (permissive) | 낮음. 분절 결과(break opportunity)만 넘기면 CanvasKit·Parley 어느 쪽에도 결합 가능 | 낮음. Unicode 컨소시엄 공식 프로젝트 | **금칙/분절 데이터 계층.** Phase 1부터 KinsokuEngine 기반으로 선행 도입 후보 |
| **Glifo** (글리프 캐시·atlas) | 반복 글리프 outline/image/hint 캐시로 텍스트 다량 캔버스의 렌더 비용 절감(매트릭스 E08). Parley 글리프 런 → Vello 전달 경로의 자원 계층 | 실험적 단계(매트릭스 E08 명시). 레이아웃·셰이핑 없음. 프로덕션 검증 이력 부족 | 캐시 계층이므로 화질은 상류 래스터라이저에 종속. hinting 캐시 품질은 diff로 검증 | 미실측 — tests/benchmarks 하니스로 측정 | 미실측 — tests/benchmarks 하니스로 측정 | 소형 crate. Parley 스택 모듈 동봉 예상 | 결정적(캐시 키가 폰트·크기·hint 파라미터로 닫히는지 검증 필요) | permissive (매트릭스 E08 기준, 저장소 재확인) | 낮음(Vello 경로 전제). CanvasKit 경로에서는 불필요 | **높음.** 실험적 — 매트릭스 E08 지침대로 `GlyphCacheAdapter` 뒤에 두고 교체 가능하게 격리 | **실험적 보조.** Vello 텍스트 경로가 열릴 때만 활성 |

## 2. 정성 서술 근거 (공개 자료)

| 항목 | 근거 |
| --- | --- |
| CanvasKit Paragraph API·빌드 플래그 | https://skia.org/docs/user/modules/canvaskit/ — Paragraph shaper 포함 빌드 제공, Flutter가 SkParagraph 동일 코어 사용 |
| SkParagraph 세로쓰기 미지원 | Skia/Flutter 공개 이슈 트래커에 세로쓰기(vertical text layout) 미지원이 장기 미해결 요구사항으로 존재. 자체 corpus로 Phase 0에서 재확인 |
| Vello 알파 상태 | https://github.com/linebender/vello — 저장소가 알파 상태를 명시(매트릭스 E02 "주요 위험"과 동일). 이것이 Phase 1에서 vello 어댑터를 `text: unsupported`로 두는 근거 중 하나 |
| Parley 구성·목표 | https://github.com/linebender/parley — shaping/line breaking/bidi/selection·editing을 Rust 계층에서 조합(매트릭스 E07 원문) |
| HarfRust 계보 | HarfBuzz 조직 산하 Rust 포팅(rustybuzz 계승). 셰이핑 로직·테스트 계보를 HarfBuzz에서 승계 |
| Skrifa | Google Fonts fontations 프로젝트의 글리프·메트릭 크레이트 |
| ICU4X 데이터 슬라이싱 | ICU4X는 datagen 도구로 로케일·기능별 데이터 슬라이스를 공식 지원 |
| Glifo 실험성 | 매트릭스 E08 "실험적이므로 GlyphCacheAdapter 뒤에서 교체 가능하게 둔다" |
| CJK 금칙의 표준 근거 | 금칙 요구의 기준 문서는 JIS X 4051(일본어 조판)·W3C JLREQ/KLREQ. UAX #14는 기본 클래스만 제공하므로 세분 규칙은 제품 확장 영역 |

## 3. CJK 세로쓰기·금칙 처리 갭 (명시)

두 진영 모두 다음이 **공백**이며, 이는 매트릭스 E07 "주요 위험"(CJK 세로쓰기·금칙·루비는 제품 전용 확장이 필요할 수 있다)과 일치한다. 어떤 후보를 골라도 사라지지 않는 갭이므로, 엔진 선택과 무관하게 제품 계층에서 해결한다.

| 갭 | CanvasKit Paragraph | Parley 스택 | 제품 대응 (hybrid-design.md §4 상세) |
| --- | --- | --- | --- |
| 세로쓰기 (縦書き, 한국어 세로 조판) | 미지원 | 미지원 | 자체 `VerticalTextLayoutIR` — 글리프 단위 배치·약물 회전·縦中横을 제품 레이어에서 구현, 셰이핑·글리프는 기존 엔진 재사용 |
| 금칙 (행두·행말 금칙, 분리 금지) | ICU 내장 UAX #14 기본 수준, 규칙 주입 API 제한 | ICU4X UAX #14 기본 수준, 단 Rust 계층이라 규칙 삽입 여지는 더 큼 | 자체 `KinsokuEngine` — ICU4X 분절 위에 JIS X 4051/KLREQ 기반 커스텀 금칙 테이블 |
| 행말 매달림(ぶら下がり)·추입/추출 | 미지원 | 미지원 | KinsokuEngine의 줄 조정 단계에서 구현 |
| 루비(후리가나) | 미지원 | 미지원 | 후속 단계 — placeholder(CanvasKit)·인라인 박스(Parley) 위에 제품 확장 |

**결론:** 세로쓰기·금칙은 V11 원칙(§3.3 자체 구현 조건 5 — "CSP를 넘어서는/대등한 고유 기능이 기존 엔진에 없다")에 정확히 해당하는 **증거 기반 선택적 자체 구현 대상**이다. Phase 1에서는 CanvasKit 가로쓰기 + ICU4X 기반 금칙 1차(줄바꿈 후보 필터링)로 출발하고, 세로쓰기 완전판은 Parley 스택 승격 평가와 함께 진행한다.

## 4. 판정 요약

1. **Phase 1 기준선 = CanvasKit Paragraph.** 텍스트 island는 전부 CanvasKit 소유. vello 어댑터는 `text: unsupported` capability 등록 → planner가 자동 라우팅.
2. **Parley 스택은 벤치 하니스에 상시 탑재**하되 프로덕션 비활성. `tests/benchmarks` 게이트(benchmark-plan.md)를 통과하고 세로쓰기·금칙 확장의 구현 우위가 입증되면 주력 승격(아키텍처 §0.1 마지막 단계).
3. **ICU4X만은 조기 분리 도입** — KinsokuEngine의 분절 데이터 계층으로, CanvasKit 기준선 시기부터 가치가 있다.
4. **Glifo는 GlyphCacheAdapter 뒤 격리.** Vello 텍스트 경로가 열리기 전에는 코드 경로에 넣지 않는다.
