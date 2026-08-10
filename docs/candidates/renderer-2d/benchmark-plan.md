# renderer-2d 벤치마크 계획 (Benchmark Plan)

- 담당 서브시스템: **renderer-2d** (E01~E06, E08, E13~E15, E28)
- 실행 위치: `/tests/corpus`, `/tests/benchmarks` (V11 §12 모노레포 구조)
- 목적: "미실측" 상태인 p50/p95/p99·Peak Memory를 실측으로 대체하고, 후보 Provider의 승격·강등을 증거로 결정한다 (V11 §0.1, §3.3).
- 전제: 수치는 이 하니스 산출물 외의 출처로 기입하지 않는다.

## 1. 코퍼스 구성 (tests/corpus)

모든 엔진에 **동일한 ToonSceneIR 코퍼스**를 입력한다. 엔진별 전용 씬 금지.

| 코퍼스 ID | 내용 | 검증 포인트 |
| --- | --- | --- |
| C-VEC-S | 소형 벡터 장면: 컷 4개, 말풍선 6개, path 수백 개 | 기본 정합·저부하 지연 |
| C-VEC-L | 대규모 선화: 가변 폭 path 5만+ 개, 효과선·집중선 밀집 | Vello 계열 승격 판단의 핵심 부하 (V11 E02 최적 담당) |
| C-RAS-L | 래스터 중심: 100 layer, 8K 캔버스, 마스크·블렌드 혼합 | CanvasKit tile·합성 상한 (V11 §9.3) |
| C-STRIP | 30,000px 세로 웹툰 스트립, 컷·톤·텍스트 혼합 | 스크롤 편집 유지·sparse tile residency (E28) |
| C-TXT | 한중일 문단·세로쓰기 후보·효과음 텍스트 다량 | Paragraph vs (승격 시) Parley/Glifo 비교 |
| C-SVG | 정적 SVG 자산 모음: 사양 기능 범위를 계단식으로 포함(gradient, clip, filter, pattern 등) | resvg 기준 대비 ThorVG/vello_svg 커버리지·정확도 (E13/E14 위험 항목) |
| C-LOT | Lottie 파일 등급별(단순 도형→마스크·필터 사용) | 파일별 feature-scan 라우팅 근거 |
| C-FILT | ImageFilter/RuntimeEffect 체인: blur·shadow·색 보정 조합 | 실시간 필터 지연·Preview/Final 일치 |
| C-MIX | 벡터+래스터+텍스트+asset island 혼합 실전 문서 | island 합성·복사 비용 사다리 실측 |
| C-DEGRADE | 손상·극단 입력: 초대형 단일 path, 0면적 도형, NaN 좌표 정화 대상 | 강건성·복구 경로 |

- 각 코퍼스는 IR 파일 + 기대 golden 이미지(생성 규칙은 §3)로 구성하고 content hash로 고정한다.
- 장치 프로파일: macOS(Apple GPU) / Windows(디스크리트·내장) / 저사양 Android 태블릿 / iPad Safari를 최소 매트릭스로 한다. 결과에는 장치 프로파일 ID를 반드시 병기한다.

## 2. 측정 지표

### 2.1 지연 (p50 / p95 / p99)

| 항목 | 정의 |
| --- | --- |
| 프레임 렌더 지연 | IR 제출 → present 완료. 코퍼스별·엔진별 p50/p95/p99 |
| 입력→첫 preview | 포인터 이벤트 수신 → 첫 픽셀 반영. 목표 p50 4ms / p95 8ms (V11 §9.3) |
| island 합성 비용 | 외부 엔진 결과 수신 → 최종 composite 완료. 전달 형식(texture/ImageBitmap/SAB)별 분리 측정 |
| 콜드스타트 | 모듈 로드 → 첫 렌더 가능. CanvasKit WASM·vello_cpu Worker·(후보) Vello 파이프라인 워밍 각각 |

- 측정은 동기 버스트 방식으로 수집하고(핫패스 계측 오염 방지), warm-up 프레임은 통계에서 제외한다.
- GC·워커 스케줄링 잡음을 줄이기 위해 코퍼스당 최소 300 프레임, 5회 반복 런의 중앙값 런을 채택한다.

### 2.2 메모리 (Peak Memory)

| 항목 | 정의 |
| --- | --- |
| WASM heap peak | 엔진별 Worker의 `WebAssembly.Memory` 최대 크기 |
| GPU 상주 추정 | texture·atlas·pipeline cache 합계(엔진 보고 + 자체 추적) |
| 번들 비용 | 엔진별 WASM/JS 전송 크기(brotli)·디코드 시간 — Worker/Bundle Cost 컬럼의 근거 |
| soak 잔류 | 4h/24h soak 후 idle 상태 메모리 — 누수 판정 (V11 §10.5) |

### 2.3 픽셀 정확도 (diff 임계)

기준 이미지(§3) 대비:

| 등급 | 임계(초안) | 적용 대상 |
| --- | --- | --- |
| 결정 경로 동일성 | 픽셀 완전 일치 (diff 0) | vello_cpu 반복 실행 간, resvg 반복 실행 간 |
| cross-CPU 기준 정합 | 채널당 오차 ≤ 1/255, 상이 픽셀 비율 ≤ 0.1% | vello_cpu ↔ resvg ↔ CanvasKit Software |
| GPU ↔ CPU 정합 | 채널당 오차 ≤ 2/255, 상이 픽셀 비율 ≤ 0.5%, 구조 유사도(SSIM) ≥ 0.995 | CanvasKit GPU·(후보) Vello ↔ vello_cpu |
| asset 렌더 정합 | 위 GPU 기준 + 사양 미지원 검출 시 즉시 실패(픽셀 비교 이전에 feature scan) | ThorVG·vello_svg ↔ resvg |

- 임계값 자체도 Phase 0에서 실측 분포를 보고 확정한다(초안은 게이트 골격일 뿐, 근거 없이 완화 금지).
- AA 경계 픽셀은 별도 마스크로 분리 집계해 "AA 차이"와 "형상 오류"를 구분한다.

## 3. 기준 이미지 (Golden) 생성 규칙

1. 정적 SVG의 심판은 **resvg+tiny-skia** (E15).
2. 일반 장면의 결정적 기준은 **vello_cpu 0.2.0** (E04) — 버전·commit 고정, wasm-pack 산출물 hash 기록.
3. CanvasKit Software를 제3 기준으로 두어 3중 교차(어느 하나의 버그가 기준을 오염시키는 것 방지).
4. golden 갱신은 PR 리뷰 대상이며, 갱신 사유(엔진 버전 업 등)를 함께 기록한다.

## 4. 통과 게이트

### 4.1 1차 구현(CanvasKit + vello_cpu) 출하 게이트

- [ ] C-RAS-L·C-STRIP에서 인터랙티브 편집 유지(프레임 p95가 장치별 목표 내 — 목표치는 Phase 0 실측 후 확정, V11 §9.3 골격 준수)
- [ ] 입력→첫 preview p50 4ms / p95 8ms 이하
- [ ] 일반 편집 경로 GPU→CPU readback 0회 (계측으로 증명)
- [ ] vello_cpu golden이 전 코퍼스에서 반복 실행 diff 0
- [ ] cross-CPU 기준 정합 임계 통과
- [ ] 4h/24h soak에서 메모리 잔류 증가 없음, context-loss·worker-crash 주입 후 복구 성공
- [ ] license scan 통과 (license-deployment.md 정책 준수)

### 4.2 후보 승격 게이트 (Vello Classic/Hybrid, ThorVG, vello_svg+Velato, Glifo)

승격은 V11 §3.3의 증거 조건을 renderer-2d에 구체화한 다음을 **모두** 충족해야 한다.

- [ ] 담당 island 코퍼스(예: Vello는 C-VEC-L·C-MIX)에서 현행 소유자 대비 p95 지연 또는 처리량이 유의하게 우수 (사전 등록한 효과 크기·반복 런 기준)
- [ ] GPU↔CPU 정합 임계 통과 (vello_cpu 기준)
- [ ] island 경계 복사 비용 포함 총비용으로 비교 — 엔진 단독 속도가 아니라 파이프라인 전체 (V11 §3.3-3)
- [ ] capability probe로 미지원 구간이 식별되고 폴백 체인이 fault-injection에서 동작
- [ ] Peak Memory·번들 비용 증가가 사전 합의한 예산 내
- [ ] 4h soak 이상 통과 (24h는 출하 전)

강등 게이트: 승격된 Provider가 두 릴리스 연속으로 위 기준을 위반하면 CapabilityRegistry에서 해당 island를 기준선 소유자로 되돌린다.

### 4.3 자체 구현(ToonGpuExtensions pass) 게이트

- [ ] 동일 기능의 기존 엔진 경로와 코퍼스 비교에서 품질·성능 우위 또는 기존 엔진에 부재한 기능임을 입증 (V11 §3.3)
- [ ] 결정성: 동일 입력 반복 실행 시 허용치 내 diff
- [ ] pass 제거 시 폴백 경로가 존재함을 fault-injection으로 증명

## 5. CSP 비열위 비교 방법

V11 §9.3·§10의 요구를 renderer-2d 관점에서 실행한다.

1. **동일 장치·동일 문서**: CSP가 설치된 동일 기기에서 동일 해상도·유사 문서(레이어 수·컷 구성 일치)를 준비한다. CSP 내부 파일은 사용하지 않고 양쪽에서 동일 절차로 재작성한다.
2. **과업 스크립트 고정**: ① 1,000px 브러시 연속 스트로크 ② 4K 캔버스 필터 인터랙션(blur 반경 드래그) ③ 100 layer 문서 스크롤·줌 ④ 30,000px 스트립 이동 — 각 과업을 양쪽에서 동일 순서로 수행한다.
3. **측정**: ToonStudio는 하니스 계측, CSP는 고속 카메라(≥240fps) 화면 촬영 기반 입력→반응 프레임 카운트로 측정한다. 서로 다른 측정법임을 결과에 명시하고, ToonStudio도 동일 카메라법으로 교차 측정해 방법 편차를 보정한다.
4. **판정**: 과업별 체감 지연·프레임 유지에서 CSP 대비 열위가 없을 것(비열위 마진은 카메라법 측정 오차를 반영해 사전 등록). 미달 과업은 출시 게이트 블로커 (V11 §0.3).
5. **블라인드 시각 평가**: Phase 7 CSP blind test와 연동 — 동일 선화·톤 결과물을 평가자에게 무표기 제시해 품질 열위 여부를 확인한다.

## 6. 리포트 형식

- 산출물: `tests/benchmarks/reports/<date>-<device>-<engine>@<commit>.json` + 요약 md.
- 각 리포트는 코퍼스 ID, 엔진 버전·commit, 장치 프로파일, 반복 런 수, 원시 분포(히스토그램)를 포함한다.
- capability-survey.md의 "미실측" 셀 갱신은 이 리포트 경로를 근거로만 수행한다.
