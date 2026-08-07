# ToonStudio V11 — stroke-brush 벤치마크 계획 (benchmark plan)

- 기준일: 2026-08-07
- 하니스 위치: `tests/benchmarks` (V11 §12 그린필드 트리, Phase 0 benchmark harness)
- 원칙: 모든 수치는 이 하니스의 실측만 인정한다. 실측 전에는 어떤 문서에도 수치를 적지 않는다.

## 1. 코퍼스 구성 (`tests/corpus/stroke-brush/`)

### 1.1 입력 트레이스

| 구분 | 내용 | 목적 |
| --- | --- | --- |
| 실기기 녹화 | Wacom · Apple Pencil · S Pen · Surface Pen · Huion · XP-Pen 각각에서 수집한 raw Pointer Events 로그(coalesced 포함, 타임스탬프·pressure·tilt·azimuth·twist 보존) — V11 §6.4 장치별 시험 항목과 동일 세트 | 장치 교정 프로필 검증, 실제 손 입력 재현 |
| 합성 트레이스 | 직선·원·나선·hairpin 급회전·고속 flick·저속 세필·압력 램프(0→1→0)·간헐 압력 스파이크·60/120/240Hz 샘플레이트 변주 | 스태빌라이저·fitting 경계 조건, 자기교차 유발 케이스 |
| 작업 시나리오 | 만화 선화 1페이지 분량의 연속 획 세트(짧은 획 수백 개 + 장초점 곡선), 30,000px 웹툰 스트립 스크롤 중 획 | 장시간·대문서 조건에서의 지연 안정성(V11 §9.3) |

트레이스는 JSON(InputIR 직렬화)으로 저장하고 재생기가 결정적으로 주입한다 — 동일 트레이스는 어떤 Provider에도 동일하게 들어간다.

### 1.2 브러시 프리셋

- Golden Master 중 stroke-brush 담당분: G펜, 매핑펜, 붓펜, 캘리그래피, 마커, 기술 펜(자·가이드 결합), 손가락 필기.
- 각 프리셋은 `BrushProgramIR`로 고정하고 provider·version·calibration profile을 함께 기록한다(V11 §6.4).

## 2. 측정 지표

| 지표 | 정의 | 기록 |
| --- | --- | --- |
| 입력→첫 preview 지연 | pointer 이벤트 수신 → wet-ink island 첫 픽셀 제출까지 | **p50/p95/p99** — 미실측, 본 하니스로 측정 |
| 획 commit 시간 | pointerup → Final 경로 완료(PathIR 확정 + 타일 합성) | p50/p95/p99 |
| 처리량 | 초당 처리 샘플 수, 1,000px 대형 브러시 dab 처리량 | 평균·최저 |
| Peak Memory | Provider별 스트로크 세션 peak(WASM heap + GPU 추정 포함) | **미실측 — 본 하니스로 측정**, Provider별 분리 기록(V11 §9.3) |
| 결정성 | 동일 InputIR 2회 재생의 PathIR 해시·픽셀 일치 여부 | pass/fail |
| Preview↔Final 픽셀 diff | 동일 획의 preview 최종 프레임 vs commit 결과 | 아래 §3 임계 |
| cross-provider 픽셀 diff | 동일 획의 Provider별 결과(참고용 — 동일할 필요는 없고 각자 golden 대비) | 기록만 |

계측은 동기 버스트 방식으로 별도 실행하고, 상시 계측이 핫패스를 오염시키지 않게 한다.

## 3. 픽셀 diff 임계 (golden image)

- 기준 이미지: 각 프리셋 × 대표 트레이스의 Final 결과를 golden으로 고정(생성 renderer: CanvasKit + Vello CPU/resvg 교차 기준 — E04/E15).
- 회귀 판정 지표: (a) per-channel 최대 오차, (b) 임계 초과 픽셀 비율, (c) 지각 diff(ΔE 계열) 3종을 함께 기록한다.
- **임계값 자체는 미실측 상태에서 선고정하지 않는다.** Phase 1에서 renderer 간 정상 편차 분포를 먼저 측정한 뒤, 그 분포 밖을 회귀로 판정하도록 캘리브레이션하고 이 문서에 수치를 기입한다.
- Preview↔Final diff는 별도 완화 임계를 두되 "커밋 순간 획이 눈에 띄게 변형되지 않는다"를 블라인드 관능 평가로 병행 확인한다.

## 4. 통과 게이트

1. **지연**: 입력→첫 preview p50 ≤ 4ms, p95 ≤ 8ms 목표(V11 §9.3의 전사 게이트를 본 서브시스템에 그대로 적용). p99와 peak memory는 실측 후 회귀 상한을 고정한다.
2. **readback**: 스트로크 진행 중 GPU→CPU readback 0회(계측기로 검증).
3. **결정성**: Final 경로 100% 재현(해시 일치). 실패 트레이스는 즉시 blocker.
4. **자기교차 정리**: hairpin corpus 전체에서 PathOps 정리 후 유효 지오메트리(비어 있거나 뒤집힌 면 없음).
5. **soak**: 4h 연속 드로잉 재생에서 지연 드리프트·메모리 증가 없음(24h는 전사 hardening 게이트에 위임).
6. **폴백**: Provider 강제 crash 주입 시 폴백 체인(hybrid-design.md §4)이 진행 중 획 손실 없이 전환.

## 5. Google Ink PoC 게이트 (승격 판정)

동일 corpus·동일 하니스에서 PerfectFreehandProvider(1차 주력)와 나란히 실행한다.

| 항목 | 판정 |
| --- | --- |
| 빌드 재현성 | 고정 commit에서 WASM 빌드가 CI 재현 가능 |
| 품질 | 블라인드 관능 평가(§6 방식)에서 전문 잉킹 프리셋 과반 우위, 또는 tilt/twist 동역학 표현에서 1차 구현이 불가능한 결과 시연 |
| 성능 | p50/p95 지연·peak memory가 §4 게이트 이내(수치는 미실측 — 측정 후 판정) |
| 결정성 | §4-3 동일 기준 통과 |
| 격리 | 전용 Worker crash 시 무손실 폴백 동작 |

전부 통과 시에만 GoogleInkProvider를 기본 경로에 편입한다. 일부 통과면 해당 프리셋군에만 opt-in으로 제한 편입할 수 있다(기능 탐지형 라우팅 — V11 §1.2-7).

## 6. CSP 비열위 비교 방법

- **동일 장치 원칙**: CSP와 ToonStudio를 같은 하드웨어·같은 태블릿·같은 프리셋 의도로 비교한다(V11 §9.3 "1,000px 브러시와 4K filter interaction을 CSP와 동일 장치에서 비교").
- **지연 비교**: 외부 계측(고속 카메라 또는 photodiode 기반 pen-to-pixel 측정)으로 두 앱을 같은 방법으로 잰다. 내부 타임스탬프는 앱 간 비교에 쓰지 않는다(계측 기준이 다르므로).
- **품질 비교**: 대표 획 태스크(G펜 세필, 붓펜 캘리그래피, 고속 효과선, 자 보조 직선)를 양쪽에서 수행한 결과를 익명화해 블라인드 관능 평가(작화 경험자 패널)로 채점한다 — V11 Phase 7 "CSP blind test"의 서브시스템 선행판.
- **스태빌라이저 비교**: CSP 손떨림 보정 강도 단계와 커스텀 스태빌라이저 모드를 매핑해 같은 트레이스의 보정 결과·체감 지연을 나란히 기록한다.
- **판정**: 비열위 = 블라인드 평가 동률 이상 + 측정 지연 열세가 통계적으로 유의하지 않음. 열위 항목은 §4 게이트와 무관하게 출시 blocker 목록에 올린다(V11 §0.3 출시 게이트).

## 7. 산출물

- `tests/benchmarks/stroke-brush/` 실행 결과 JSON(ProviderBenchmarkRegistry 입력 포맷).
- capability-survey.md의 p50/p95/p99·Peak Memory 열 갱신 PR.
- Google Ink PoC 판정 보고서(승격/보류/기각 + 근거 시각 자료 — V11 §3.3 요건).
