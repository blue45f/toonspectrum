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

---

## 실측 현황 갱신 (2026-08-07, Parley 레인 PoC 출하)

- **구현**: `crates/studio-engine-vello/src/text.rs` — parley 0.11(fontique 0.11·harfrust 0.10·ICU4X 2.2)
  + skrifa 0.43 아웃라인 추출 → 캐노니컬 PathIR. wasm export `shape_text_json`, TS 래퍼
  `shapeTextToGlyphPaths`(zod 검증).
- **증거**: 크레이트 테스트 6종(셰이핑·줄바꿈·결정성·vello_cpu 렌더 통합·한글 no-crash·입력 검증) +
  래퍼 테스트 2종(스키마·**교차 렌더 잉크 커버리지 vello↔CanvasKit 10% 이내 일치**).
- **비용 실측**: wasm 1,855,463 → 3,149,976 bytes (**+1.29MB**, E07 스택 전체 포함). lazy load
  전제(§9.1)에서 수용 가능하나 텍스트 미사용 세션의 로딩 회피를 위해 분리 빌드 후보로 기록.
- **잔여 게이트**: CJK 폰트 자산(현재 코퍼스는 Roboto — 한글 커버리지 없음, no-crash만 보장),
  세로쓰기·금칙·루비, CanvasKit Paragraph와의 시각 기준 비교(현재는 아웃라인 경로 동등성만),
  Glifo 글리프 캐시. 이 게이트 통과 전까지 production 텍스트는 CanvasKit Paragraph 기준선 유지.

## V12 CJK 100k 글리프 캐시 실측 (2026-08-09)

`tests/benchmarks/results/text-cache-cjk.json`은 AppleGothic 단일-face TTF(SHA-256
`def69dc2…3020b1`)와 커밋된 Parley/Skrifa Vello WASM을 사용했다. 100글리프짜리 고유 한국어
문구 100개를 10회 배치하여 **정확 100,000 글리프**를 서비스했다. 첫 10,000글리프 shape는
p50/p95/p99 **24.586/29.238/125.409ms per 100-glyph run**, 이후 900회 캐시 조회는
p50/p95/p99 **0.004792/0.011583/0.020834ms**, steady-state hit 100%, 전체 요청 hit 90%,
총시간 기준 **472.6배**였다. 캐시 추정치는 118,299,072B/256MiB, eviction 0이며 관측 RSS
증가는 270,352,384B였다. 6개 표본의 fresh shaping과 cached shaping은 구조 SHA와 Vello CPU
픽셀이 모두 byte-exact였고 tofu outline은 0이었다.

반대로 `text-cache-cjk-all-unique-rejected.json`의 **100,000 all-unique outline 상주** 시도는
768MiB 캐시에서 첫 순회부터 311회 eviction, 두 번째 순회 hit 0, 최종 RSS 3.74GiB를 기록해
기각했다. 따라서 Glifo 역할은 “10만 장면 전체를 무한 상주”가 아니라 반복 문구를 bounded LRU로
재사용하는 것으로 한정한다. 이 결과로 CJK 자산·캐시 on/off 화질·메모리 게이트는 충족했지만,
세로쓰기·금칙·루비와 CanvasKit Paragraph 전체 의미 비교는 별도 게이트로 남는다.

## V12 세로쓰기·종중횡조·세로 루비 실측 (2026-08-10)

이 절은 위 V11 표의 “세로쓰기·루비 미지원/미실측”을 **V12에서 구현된 세로쓰기 부분집합에
한해** 갱신한다. 전체 가로 문단·bidi·IME·CanvasKit Paragraph 의미 비교까지 측정했다는 뜻은
아니다. 원자료는 `tests/benchmarks/results/text-vertical-quality.json`, 재현 하니스는
`tests/benchmarks/harness/text-vertical-quality.ts`, 조작 방지 계약은
`tests/visual/text-vertical-quality-contract.test.ts`다.

| Candidate / lane | Unique Strength | Missing Features | Visual Quality | p50/p95/p99 | Peak Memory | Worker/Bundle Cost | Determinism | License | Interop Cost | Maintenance Risk | Final Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 제품 `VerticalTextLayout` + vertical ruby | 실제 Konva/SVG 공통 기하에서 한·일 CJK, 1–4자리 종중횡조, 5자리 회전 폴백, 우→좌 열, UTF-16/서로게이트 안전 루비, 열 경계 루비 분할. Unicode Ps/Pi/Pe/Pf와 CJK 약물 역할을 독립 셀로 보존해 `」「`·중첩 괄호를 분리하고 최대 32셀의 결정적 금칙 역탐색을 수행 | OpenType ruby 광학 메트릭과 제품 Canvas/SVG의 강제 `vert`/`vrt2` 적용 미지원. 32셀 안에 유효 break가 없으면 `overflow=true` 매달림으로 표면화. CSP 블라인드 미실행 | Chromium 348×315 결정적 reference에 직립 CJK·2026 종중횡조·12345 회전·`」「`·중첩 약물·세로 루비·다열을 함께 기록. 기하/PNG 반복 byte-exact | 제품 8사례 배치 **0.050/0.060/0.070ms**; 세로 루비 3사례 배치 **0.015/0.025/0.030ms** (각 240 raw 표본, 40 warmup, 20회 내부 평균) | 제품 경로별 peak 미관측 — **null**. 브라우저 전체 프로세스와 분리할 수 없어 추정 금지 | 기존 TS/Konva 경로로 추가 WASM 없음. Chromium reference는 하니스 전용 시스템 글꼴 주입 | 8개 레이아웃 기하 SHA 반복 동일, 인접/중첩 약물 포함 glyph drop 0·금칙 위반 0, 루비 reading drop 0, reference PNG 반복 byte-exact | 제품 코드 internal. 벤치 글꼴은 OS 제공, 저장소 미포함 | 낮음: 같은 배치 기하를 Konva/SVG가 소비. 루비는 현재 PathIR이 아닌 Konva 텍스트 오버레이 | 중간: 제품 전용 약물·금칙·루비 규칙 회귀 책임 | **V12 제품 세로 조판 주력**. 인접 약물 갭은 종료했고, 전문 광학 메트릭과 CSP 블라인드는 잔여 |
| HarfRust-TTB/Skrifa WASM vertical PathIR → Vello/CanvasKit | AppleGothic의 실제 `vmtx`, 1–4자리 종중횡조 1셀, 5자리 회전 폴백. Parley 0.11의 가로 문단 API는 유지하되 bounded 세로 셀은 잠긴 HarfRust 0.10을 `Direction::TopToBottom`으로 직접 호출해 `vert`/`vrt2` glyph ID를 실제 적용하고 Skrifa로 윤곽을 추출 | 단일 스타일·수동 열 배치 범위다. 세로 루비 PathIR·전체 Paragraph 편집/bidi/IME·OpenType BASE 광학 메트릭은 별도이며, 폰트가 대체를 제공하지 않는 문자는 역할별 기하 폴백 | 204×204, 21 glyph/5열에서 Vello↔CanvasKit 대칭 3×3 δ48 불일치 **0.002403%**(게이트 0.6%), 동일 ink bounds 8,2–177,174, ink 4,476 vs 4,354px. Arial Unicode `「」`는 HarfBuzz 기준과 동일하게 gid 4599/4600→6445/6446, `、。！？`는 명시 폴백, glyph drop 0 | 6사례 배치 **7.085291/8.191167/16.737333ms** (160 raw, 30 warmup; p99는 관측 중 OS 스케줄링 outlier 포함) | 실행 전후 프로세스 RSS +193,232,896B, heap +37,099,184B. Provider peak CPU/GPU는 **null** | CPU 3,191,816B, GPU 5,756,914B; 각 5파일 SHA-256 매니페스트 검증 | 6사례 JSON 반복 동일, 실제 vertical evidence 반복 동일, Vello·CanvasKit 픽셀 각각 byte-exact | Parley/Fontique/Skrifa MIT OR Apache-2.0, HarfRust MIT. 시스템 글꼴 미배포 | 중간: glyph ID→Skrifa PathIR 뒤 두 렌더러 동일 장면 | 중간: 직접 HarfRust API 핀과 Parley의 transitive 버전 정합을 Cargo.lock/테스트로 유지. 수동 코드포인트 치환 금지 | **V12 세로 글리프 PathIR 기준/검증 레인**. OpenType 대체 우선, 폰트별 미제공 문자만 명시 기하 폴백 |

품질 게이트 결과는 glyph/reading drop 0, 전용 1–4자리 종중횡조 32px 셀 경계 내, 5자리
회전 폴백, 열 우→좌, 유효 코퍼스 금칙 위반 0, 루비 오른쪽 배치·수직 중심 정렬, 동일 입력
기하/픽셀 결정성 모두 통과다. 인접 `」「`와 중첩 괄호는 독립 역할 셀로 분리되고, bounded
코퍼스에서 glyph drop·행두/행말 금칙 위반이 모두 0이다. 다만 이 수치는 **CSP와의 블라인드
비교나 OpenType ruby/vert 메트릭 동등성을 증명하지 않는다.**

### OpenType `vert`/`vrt2` API 판정과 두 접근 비교

1. **GSUB 적용 접근:** Parley 0.11의 실제 API에는
   `StyleProperty::FontFeatures(FontFeatures)`가 있고 이 값은 HarfRust까지 전달된다. Skrifa
   raw table API로 Arial Unicode의 GSUB `vert` 레코드도 확인했다. 그러나 Parley의 shape
   경로는 bidi level로 HarfRust 방향을 LTR/RTL 중 하나로 고정하며 TTB를 선택하는 공개 builder
   API가 없다. 설치 글꼴을 제자리에서 읽은 HarfBuzz 14.2.1 비교에서 명시적 `vert/vrt2`를 준
   LTR은 `「」`가 gid 4599/4600, TTB는 gid 6445/6446이었다. 따라서 현재 스택에서 안전한
   Parley 문단 builder 자체의 TTB는 미지원이다. V12 bounded 세로 셀은 Parley가 이미 잠근 동일
   HarfRust 0.10을 직접 호출해 `Direction::TopToBottom`과 `vert/vrt2`를 지정한다. 실측 결과
   Rust/WASM도 gid 6445/6446을 반환해 HarfBuzz 14.2.1 TTB 기준과 일치했다.
2. **기하 폴백 접근:** 글꼴 코드포인트를 U+FE presentation form으로 수동 치환하지 않는다.
   opening/closing은 회전, `、。`는 우상단 offset, `！？`는 셀 중심 배치를 사용하고 각 글리프에
   `verticalFallback`을 기록한다. `shape_vertical_text_json`은 font feature 존재와 실제 적용을
   분리해 Arial Unicode 코퍼스에서 `application: applied`, `appliedGlyphs: 2`,
   `geometricFallbackGlyphs: 4`를 결정적으로 반환한다.

직접 HarfRust 경로는 base/TTB glyph count 동일성·no-drop·JSON 결정성·HarfBuzz glyph ID·
Vello/CanvasKit visual gate를 모두 통과했다. 향후 Parley가 TTB 문단 builder를 제공하면 동일
코퍼스로 교체 가능성을 비교한다. 폰트별 치환표를 직접 작성하는 우회는 계속 금지한다.
