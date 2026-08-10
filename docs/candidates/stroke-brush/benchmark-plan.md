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

## 8. V12 surface-brush 브리지 자동 게이트 (2026-08-10)

하니스: `src/domains/creator/studio-vrm-surface-brush-provider.test.ts`.

| 게이트 | 자동 증거 |
| --- | --- |
| 실제 hit adapter | 설치된 Three Raycaster 교차점과 `three-mesh-bvh` 0.9.13 `raycastFirst`의 face/world 결과를 대조한 뒤 같은 intersection으로 제품 stroke 커밋 |
| 비 no-op | runtime export atlas의 alpha tex셀 수가 0보다 크고 commit receipt의 changedTexels가 0보다 큼 |
| 압력 정밀도 | 0.123456789/0.987654321 입력이 operation pressure에 strict-equal로 유지됨 |
| UV seam | 서로 끊긴 두 chart에서 island/triangle ID가 달라지고 run 2개, seam break 1개, 중간 bridge operation 0 |
| 결정성 | 같은 runtime target에서 undo 후 같은 hit/stroke 재실행 시 operation·reference RGBA·제품 atlas RGBA byte-equal |
| 취소/rollback | AbortSignal은 history/pixel 0 상태로 lease 종료. dirty upload 1회 주입 실패는 COW delta 복구 후 export diff 0 |
| 명시 거부 | faceIndex 없음, 단일 tap 밀도 근거 없음, NaN UV, Infinity/overflow density, cross-target hit, stamp tip을 각각 오류 코드/메시지로 고정 |
| surface owner/readback | surface session 중 기존 pointer stroke=`pointer-active`; 커밋은 CPU ImageData→dirty CanvasTexture upload만 수행하고 GPU readback API 호출 없음 |

Vitest wall-clock은 제품 지연 p50/p95/p99가 아니므로 성능 수치로 전용하지 않는다. 브라우저 실기기
raycast→first-pixel과 대형 VRM atlas 메모리는 별도 benchmark artifact가 생길 때만 이 문서에 기록한다.

## 9. V12 VRM surface-brush 실브라우저 측정 (2026-08-10)

원시 증거는 `tests/benchmarks/results/vrm-surface-brush-browser.json`, 실행기는
`tests/benchmarks/harness/vrm-surface-brush-browser.ts`다. production Vite build를 Chromium
140.0.7339.186에서 실행했으며, ANGLE Metal renderer는 Apple M2 Max로 식별됐다. 각 workload는
warmup 3회를 버리고 31회를 기록했고, 아래 백분위는 보관된 원시 배열에 nearest-rank-ceil을 다시
적용해 재현할 수 있다. 축소 scene·축소 sample·mock projection provider는 사용하지 않았다.

측정 경계는 `three-mesh-bvh raycastFirst` → BVH face/local point에서 UV 복원 →
`StudioVrmSurfaceProjectionProvider` → `executeSurfaceBrushStroke` →
`StudioVrmTexturePaintRuntime` atlas commit 전체다. atlas export·SHA-256·undo는 시간 경계 밖에서
검증했다.

| Atlas / scene / stroke | 전체 p50/p95/p99 | BVH p50/p95/p99 | projection+atlas commit p50/p95/p99 | 입력 sample당 전체 p50/p95/p99 | 최종 atlas 변경 tex셀 | commit receipt 변경 tex셀 |
| --- | --- | --- | --- | --- | --- | --- |
| 256² / 128 triangles / 8 samples | 1.585 / 2.940 / 3.350ms | 0.155 / 0.220 / 0.245ms | 1.440 / 2.720 / 3.105ms | 0.198125 / 0.367500 / 0.418750ms | 389 (31/31 동일) | 769 (31/31 동일) |
| 512² / 2,048 triangles / 32 samples | 4.280 / 5.400 / 5.695ms | 0.360 / 0.500 / 0.550ms | 3.935 / 4.900 / 5.235ms | 0.133750 / 0.168750 / 0.177969ms | 1,791 (31/31 동일) | 4,438 (31/31 동일) |
| 1,024² / 8,192 triangles / 128 samples | 13.205 / 14.785 / 15.650ms | 1.505 / 1.630 / 1.725ms | 11.755 / 13.440 / 13.925ms | 0.103164 / 0.115508 / 0.122266ms | 7,288 (31/31 동일) | 19,889 (31/31 동일) |

### 9.1 품질·복구 게이트

- reference RGBA와 제품 atlas RGBA는 각 workload의 31회 모두 workload별 단일 SHA-256으로
  byte-equal이었다. reference 변경 tex셀도 각각 389/1,791/7,288로 고정됐다.
- BVH hit에서 복원한 UV의 최대 오차는 세 workload 모두 0이었다. 원본 pressure는 interpolation=1
  경로에서 양자화 없이 strict-equal로 유지됐다.
- 두 UV island 실제 BVH hit는 run 2개·seam break 1개를 만들었고, island 사이 보간 operation은 0,
  최종 변경 tex셀은 3이었다.
- 취소는 `SurfaceBrushCancelledError`, active operation 없음, undo history 0, 변경 tex셀 0으로
  종료됐다. dirty Canvas upload 실패 주입도 `runtime-commit-failed`, history 0, 변경 tex셀 0으로
  rollback됐다.
- 제품 `public/vrm/sample.vrm`을 `loadStudioVrmAsset`으로 실제 로드했다. 선택된 `Body_1`
  SkinnedMesh는 5,307 vertices/8,864 triangles, source atlas 2,048²였다. 동일 stroke 2회 commit은
  14.690/14.870ms, 변경 tex셀 1/1, atlas SHA-256 byte-equal이었다.
- strict CSP(`script-src 'self'`) 위반, console/page error, HTTP error, 일반 request failure는 모두 0이다.
  fixture HEAD/GET의 HTTP 200 이후 Chromium body 종료 `ERR_ABORTED` 2건은 일반 실패에서 숨기지 않고
  별도 진단 배열에 기록했다. hot path GPU readback은 0이다.

### 9.2 메모리 관측 경계

| Workload | JS heap before | JS heap after | 관측 peak used JS heap | runtime admission model |
| --- | --- | --- | --- | --- |
| 256² / 8 samples | 11,367,138B | 36,239,609B | 38,494,679B | 1,165,896B |
| 512² / 32 samples | 27,905,297B | 27,423,960B | 86,454,911B | 4,386,672B |
| 1,024² / 128 samples | 61,199,412B | 64,035,486B | 124,626,388B | 17,206,128B |

JS heap은 Chromium의 `performance.memory`가 노출한 관측값이다. 이 Chromium에서는
`performance.measureUserAgentSpecificMemory`가 사용할 수 없어 값은 `null`과 실패 사유로 기록했다.
WebGL2/Three.js는 resident GPU allocation counter를 제공하지 않으므로 GPU memory도 `null`과 사유로
기록했으며 추정치를 관측값으로 승격하지 않았다. 마지막 열은 제품 admission model일 뿐 브라우저
GPU/heap 관측값이 아니다.

### 9.3 판정

round tip·no-mixing VRM surface-brush 제품 경로는 본 실브라우저 workload에서 **활성 검증됨**으로
승격한다. 이 판정은 stamp/image tip, smudge/wet neighborhood backend, 외부 태블릿 pen-to-pixel,
CSP 대비 작화가 블라인드 손맛 평가까지 완료했다는 뜻이 아니다. 그 항목들은 기존 별도 게이트를
유지한다.
