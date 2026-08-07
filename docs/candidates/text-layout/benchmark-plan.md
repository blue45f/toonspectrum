# ToonStudio V11 — text-layout 벤치마크 계획 (Benchmark Plan)

- 기준일: 2026-08-07
- 담당 서브시스템: **text-layout**
- 관련 매트릭스 행: E01, E07, E08
- 실행 위치: `/tests/corpus`, `/tests/benchmarks` (아키텍처 §12 그린필드 모노레포)
- 대상 Provider: CanvasKit Paragraph(기준선), Parley 스택(후보), Glifo(글리프 캐시), ICU4X+KinsokuEngine(분절·금칙)

> 모든 수치는 이 하니스에서 측정하기 전까지 **미실측**이다. capability-survey.md의 p50/p95/p99·Peak Memory 칸은 본 계획의 측정 결과로만 채운다. 측정 없이 문서에 수치를 적지 않는다.

## 1. 코퍼스 구성 (`/tests/corpus/text-layout/`)

각 항목은 TextIR + 폰트 패키지(버전·해시 고정, Rights BOM 포함) + 기대 산출물(golden)로 구성한다.

| 코퍼스 | 내용 | 검증 목적 |
| --- | --- | --- |
| `ko-balloon` | 한국어 말풍선 200개 — 짧은 대사·장문·의성어 혼합, 말풍선 형상 제약(타원·구름·직사각) 포함 | 기본 조판·형상 맞춤 줄바꿈·한국어 금칙(KLREQ 계열) |
| `ja-kinsoku` | 일본어 금칙 시나리오 세트 — 행두 금칙 문자(。、」』등)·행말 금칙 문자(「『등)·분리 금지(…‥, 숫자+단위)·매달림 후보를 의도적으로 줄 경계에 배치한 문장 | KinsokuEngine 정확도. **금칙 위반 검출이 자동화 가능한 구조**(기대 break 지점 명세 동봉) |
| `ja-vertical` | 일본어 세로쓰기 — 약물 회전·縦中横(2~3자리 숫자)·라틴 혼용·장문 | VerticalTextLayoutIR. 세로쓰기는 두 엔진 모두 미지원이므로 제품 확장 경로만 측정 |
| `cjk-mixed` | 한중일+라틴+이모지+합자 혼합 문단, 폰트 폴백 유발(글리프 결손 포함) | 폴백 체인·셰이핑 정확도·두부(tofu) 방지 |
| `bidi-rtl` | 아랍어/히브리어 혼합 문단(번역 재배치 시나리오) | bidi 정확도(UAX #9), 매트릭스 E07 "번역 재배치" 요구 |
| `sfx-large` | 효과음(대형 글리프·소수 글자·데코레이션·자간 극단값) | 대형 글리프 래스터·atlas 비용, Glifo 캐시 효과 |
| `page-heavy` | 대량 텍스트 페이지 — 네임/콘티 스크립트(문단 500+), 협업 댓글 오버레이 | 대량 레이아웃 처리량·증분 재레이아웃·메모리 상주 |
| `edit-session` | 기록된 편집 세션 리플레이 — 키 입력·IME 조성(한글 조합·일본어 변환)·붙여넣기·스타일 토글 시퀀스 | 인터랙티브 지연(입력→페인트), IME 정확성 |
| `stress-soak` | page-heavy × 4h/24h 반복 편집 스크립트 | 장시간 안정성·누수(아키텍처 §9.3 soak 게이트) |

폰트는 OFL 계열 공개 폰트(Noto CJK 등)로 고정해 코퍼스를 저장소에 커밋 가능하게 한다. 상용 폰트 시나리오는 해시 참조 + 로컬 주입 방식으로 분리한다.

## 2. 측정 지표

### 2.1 지연 (p50 / p95 / p99)

아키텍처 §9.3 "Provider별 p50/p95/p99·peak memory·cache hit rate 기록"을 따른다. 계측은 핫패스 계약에 따라 **동기 버스트 수집 + 페인 스로틀 리포팅**으로 편집 루프를 오염시키지 않는다.

| 지표 | 정의 | 측정 코퍼스 |
| --- | --- | --- |
| `layout.cold` | TextIR → 첫 완성 레이아웃(셰이핑 포함) | ko-balloon, page-heavy |
| `layout.incremental` | 1문자 편집 → 영향 문단 재레이아웃 완료 | edit-session |
| `input-to-paint` | 키 입력 이벤트 → 해당 프레임 페인트 제출 | edit-session (§9.3 p50 4ms/p95 8ms 목표를 텍스트 편집에 준용) |
| `shaping.throughput` | 초당 셰이핑 처리 문자 수 (엔진별 분리 측정: CanvasKit 내장 vs HarfRust) | cjk-mixed, page-heavy |
| `break.plan` | ICU4X 분절 + KinsokuEngine 필터링 시간 | ja-kinsoku |
| `glyph.raster` | 글리프 래스터/atlas 업로드 시간과 cache hit rate (Glifo on/off 비교) | sfx-large, page-heavy |

### 2.2 메모리

| 지표 | 정의 |
| --- | --- |
| `peak-memory` | 코퍼스 실행 중 Provider별 최대 상주(WASM heap + GPU atlas 추정치 분리 기록) |
| `residency.idle` | 편집 종료 후 Worker 유지 상태의 상주 메모리(lazy unload 효과 검증) |
| `atlas.footprint` | 글리프 atlas 크기·축출률 (Glifo vs 내장 단순 atlas) |
| `soak.drift` | 4h/24h soak 중 메모리 증가 기울기 (누수 판정) |

### 2.3 정확성·품질

| 지표 | 정의 | 임계 |
| --- | --- | --- |
| `pixel-diff` | 동일 TextIR을 후보 vs 기준(CanvasKit Software golden)으로 렌더 후 비교 | 픽셀당 채널 차 허용치·불일치 픽셀 비율·SSIM의 3중 기준. **구체 임계값은 Phase 0에서 AA/감마 차이 분포를 실측한 뒤 확정**하고, 확정 전까지는 diff 리포트만 축적한다(임의 수치 선지정 금지) |
| `metrics-diff` | 줄 수·각 줄의 break 지점·baseline·advance 비교 | **break 지점 불일치 0** (레이아웃 의미 동일성은 픽셀보다 엄격하게 — 완전 일치 요구) |
| `kinsoku-violation` | ja-kinsoku 기대 명세 대비 금칙 위반 수 | **0건** |
| `bidi-order` | UAX #9 기대 시각 순서 대비 불일치 | 0건 |
| `caret-map` | 편집 세션 중 캐럿/선택 지오메트리와 cluster 매핑 정합 | 불일치 0건 |
| `fallback-tofu` | cjk-mixed에서 .notdef 노출 수 | 번들 폴백 폰트 적용 후 0건 |
| `determinism` | 동일 입력 3회 반복 + (Parley 스택은) native/WASM 교차 실행 결과 비교 | 바이트 동일(레이아웃 산출물), 픽셀 동일(동일 백엔드 내) |

## 3. 통과 게이트

Provider 승격·유지 판정은 아래 게이트로 한다. 게이트는 아키텍처 §3.2 점수표(품질 30·지연 15·처리량 15…)에 입력되는 원자료다.

### G1 — Phase 1 기준선 게이트 (CanvasKit Paragraph)
- [ ] 전 코퍼스 `metrics-diff` 자기 회귀(버전 업그레이드 전후) break 불일치 0
- [ ] `input-to-paint` p50/p95가 §9.3 목표 내 (미달 시 원인 분석 후 batching 개선 — 기준선 자체가 목표 미달이면 제품 성능 예산 재협상 대상)
- [ ] GPU/CPU 백엔드 간 pixel-diff가 Phase 0 확정 임계 내
- [ ] 4h/24h soak 통과, context-loss 복구 시 텍스트 손실 0 (RecoveryIR 검증)
- [ ] `kinsoku-violation`: ICU 기본 breaker 수준의 위반 목록을 **알려진 갭 리스트로 문서화** (Phase 1은 KinsokuEngine 전이라 0건 게이트가 아님 — 갭 정량화가 목적)

### G2 — KinsokuEngine 게이트 (ICU4X + 제품 금칙)
- [ ] `kinsoku-violation` 0건 (ja-kinsoku 전체)
- [ ] BreakPlan 주입 후에도 CanvasKit 경로 `metrics-diff` 결정성 유지
- [ ] `break.plan` 오버헤드가 `layout.incremental` 예산을 잠식하지 않음 (p95 기준 회귀율로 판정, 임계는 G1 실측 후 확정)

### G3 — Parley 스택 승격 게이트 (아키텍처 §0.1 "우수함을 입증하면 주력 승격")
- [ ] 전 코퍼스에서 CanvasKit 대비 `metrics-diff` 의미 동등(의도된 개선 제외, 개선은 명세로 문서화)
- [ ] `pixel-diff` 임계 내 (렌더는 Glifo/Vello 경로 — vello 어댑터의 `text: unsupported` 해제가 선행 조건)
- [ ] p50/p95/p99·peak-memory에서 CanvasKit 대비 열위 없음, 최소 1개 축(예: 대량 문단 처리량 또는 금칙 통합 깊이)에서 유의미한 우위 입증
- [ ] determinism: native/WASM 교차 동일
- [ ] 실패 시: Parley 스택은 하니스 상주 후보로 유지, 다음 릴리스 주기에 재평가 (탈락이 아니라 "지속적 경쟁" — 아키텍처 §0.2)

### G4 — Glifo 게이트
- [ ] `glyph.raster` cache hit rate와 atlas footprint가 내장 단순 atlas 대비 우위
- [ ] 캐시 on/off 픽셀 동일 (캐시가 화질을 바꾸면 즉시 탈락)
- [ ] 우위 없으면 GlyphCacheAdapter 기본 구현 유지 (매트릭스 E08 격리 지침)

### G5 — 세로쓰기 게이트 (VerticalTextLayoutIR)
- [ ] ja-vertical 코퍼스의 회전·縦中横 배치가 조판 명세(JLREQ 기반 자체 명세) 일치
- [ ] 세로쓰기 금칙(행두·행말) 위반 0건
- [ ] CSP 비열위 비교(§4) 세로쓰기 항목 통과

## 4. CSP 비열위 비교 방법

아키텍처 §0.3 "CSP 동급 이상을 출시 게이트로" 및 §9.3 "CSP와 동일 장치에서 비교"를 텍스트에 적용한다.

1. **동일 장치·동일 문서 원칙:** CSP가 설치된 동일 태블릿/PC에서, 동일 폰트·동일 문안·동일 말풍선 형상의 문서를 양쪽에 재현한다. 재현 문서는 `/tests/corpus/text-layout/csp-parity/`에 명세(스크린샷 + 조판 파라미터)로 보관한다.
2. **기능 체크리스트 패리티:** CSP 텍스트 도구 기능 목록(세로쓰기, 금칙 설정, 행간/자간, 문자 회전, 균등 배치, 스타일 프리셋 등)을 항목화하고 지원/부분/미지원을 표기한다. 출시 게이트는 만화 제작 필수 항목(세로쓰기·금칙·말풍선 조판)의 "미지원 0"이다.
3. **조판 품질 블라인드 평가:** 동일 문안의 ToonStudio/CSP 렌더 결과를 출처를 가린 쌍대 비교로 제시하고, 한국어·일본어 조판 경험자 패널이 선호·결함(금칙 위반, 어색한 줄바꿈, 글리프 품질)을 채점한다. 게이트: 결함 지적 건수에서 열위가 아닐 것(동률 허용). Phase 7 CSP blind test의 텍스트 파트로 편입한다.
4. **입력 지연 비교:** 키 입력→화면 반영을 양쪽 모두 화면 캡처 기반 외부 계측(고프레임 캡처로 프레임 카운트)으로 측정한다. 내부 계측이 불가능한 CSP와 공정 비교를 위해 **외부 관측만으로** 동일 방법을 적용한다. 게이트: p50·p95 프레임 수 열위 없음.
5. **금칙 시나리오 대조:** ja-kinsoku 코퍼스의 문장을 CSP에 입력해 CSP의 실제 break 결과를 기록하고, 이를 "업계 기준 동작" 참고로 KinsokuEngine 기대 명세와 대조한다(맹목 복제가 아니라 차이 발생 지점의 의도 문서화).
6. **결과 기록:** 모든 비교는 ProviderBenchmarkRegistry에 장치 프로필·버전·일시와 함께 기록하고, 회귀 시 출시 차단(release blocker) 항목으로 승격한다.

## 5. 하니스 운영 규칙

- 벤치는 CI(로컬 우선)에서 코퍼스 해시·폰트 해시·엔진 commit이 하나라도 바뀌면 재실행한다.
- 결과는 기계 판독 가능한 JSON(지표 스키마 버전 포함)으로 `/tests/benchmarks/results/`에 축적하고, capability-survey.md 갱신은 이 JSON에서만 파생한다.
- 실패한 게이트는 "지어낸 수치로 통과"가 불가능하다 — 문서의 모든 수치 칸은 결과 JSON 참조를 각주로 달아야 한다.
