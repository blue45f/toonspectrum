# ToonStudio V11 — natural-media 벤치마크 계획 (benchmark plan)

- 기준일: 2026-08-07
- 대상: libmypaint (E11) vs Hokusai/`studio-hokusai-wasm` (E12) parity lab, ToonWet (E28) 채택 심사
- 실행 위치: `tests/benchmarks` 하니스 (V11 §12 그린필드 트리 `/tests/benchmarks`; 현행 리포의 `scripts/studio-brush-competitive-quality-benchmark.ts`, `scripts/studio-brush-engine-selection-benchmark.ts` 계보를 승계)
- 원칙: 모든 수치는 이 하니스의 실측만 인정한다. 문서·리뷰·판정에 추정치를 쓰지 않는다.

## 1. 코퍼스 구성

### 1.1 Preset corpus (브러시)

| 그룹 | 구성 | 목적 |
| --- | --- | --- |
| 연필·색연필 | 흑연 경도 변화, 색연필 왁스감, 종이 결 반응 프리셋 | dab 밀도·texture 반응 비교 |
| 수채·수묵 | 물 함량·번짐·농담 프리셋 (ToonWet 전/후 비교의 기준면) | pickup/deposit·혼색 비교, ToonWet 차별화 입증 대상 |
| 유화·임파스토 | 고점도 혼색·브러시 자국 프리셋 | mixing 그래프·(선택) height 확장 비교 |
| 스머지·믹서 | smudge 강도·번짐 반경 변화 프리셋 | libmypaint smudge 대비 Hokusai 동작 검증 |
| 고밀도 매핑 스트레스 | libmypaint 매핑을 최대로 사용하는 복잡 프리셋 | `.myb` 호환 커버리지 한계 측정 (Hokusai는 고밀도 매핑을 의도적으로 지원 — 래퍼 README) |

- 전 프리셋은 `.myb` 원본에서 두 엔진에 동일하게 로드한다. Hokusai가 미지원하는 매핑은 실패가 아니라 **커버리지 리포트 항목**으로 집계한다(매트릭스 E12 검증 취지).
- 프리셋 수는 Golden Master 정책(V11 §6.4, 128개 이상 확장 가능)에 맞춰 시작 세트를 정하고 카탈로그 성장에 따라 추가한다.

### 1.2 Stroke corpus (입력)

실제 태블릿에서 기록한 InputIR 샘플 스트림을 재생한다(합성 입력만으로 판정하지 않는다).

- 짧은 획 연타 (100획 연속) — per-stroke 오버헤드
- 긴 획 (10초 이상 연속, 고밀도 coalesced 샘플) — 지속 처리량
- 저속 정밀 획 / 고속 휘갈김 — dynamics 시간항 반응
- pressure ramp, tilt sweep, twist 포함 획 — 축별 매핑 검증
- 1,000px 대형 브러시 획 (V11 §9.3 명시 항목)
- 장치 프로필별 기록: Wacom / Apple Pencil / S Pen / Surface Pen / Huion / XP-Pen (V11 §6.4)

### 1.3 Canvas corpus (문서)

- 2048×2048 단일 레이어 (기본)
- 4096×4096, 100 레이어 문서 내 자연매체 레이어 (합성 경로 포함)
- 8K 및 30,000px 웹툰 스트립의 부분 영역 편집 (V11 §9.3)
- 4h/24h soak 시나리오: 반복 스트로크 + Worker 종료/재기동 + context-loss 주입 (매트릭스 공통 검증 게이트)

## 2. 측정 지표

### 2.1 지연 (p50/p95/p99)

- **입력→첫 preview 픽셀**: 샘플 수신부터 화면 합성 반영까지. p50/p95/p99 기록.
- **per-batch 처리 시간**: addSample 배치 → dirtyFrame 취득까지 (엔진 순수 시간).
- **tile 업로드·합성 시간**: dirtyFrame → CanvasKit surface 반영까지 (interop 비용 분리 계측).
- 계측은 동기 버스트로 수행하고 페인트 스로틀에 의한 왜곡을 배제한다.
- 현재 값: **미실측 — tests/benchmarks 하니스로 측정.**

### 2.2 Peak Memory

- WASM linear memory 최고점 (엔진별)
- 상주 타일 수 × 타일 크기 (sparse tile residency)
- Worker 종료 후 회수 확인 (V11 §9.1 — Worker 종료로 메모리 회수)
- 현재 값: **미실측 — tests/benchmarks 하니스로 측정.**

### 2.3 픽셀 diff (parity 판정)

두 엔진 출력을 straight-alpha sRGB RGBA8로 정규화한 뒤 비교한다(Hokusai 래퍼의 기존 픽셀 계약을 공통 계약으로 사용).

- 지표: per-channel 최대 오차, 불일치 픽셀 비율, 지각 diff(ΔE 계열) 3종을 병기.
- **제안 임계(초안, 확정은 시각 검수와 함께)**: per-channel ≤ 2/255 그리고 불일치 픽셀 ≤ 0.1% 이면 "픽셀 동등", 초과 시 시각 검수 패널로 회부해 "동등 품질/상이 품질" 판정. 임계값 자체도 Golden Master 검수 결과로 조정한다.
- 결정성 검사: 같은 엔진·같은 seed 2회 실행이 **byte-equal**인지 확인. Hokusai는 계약상 필수 통과, libmypaint는 seed 고정 시 재현성 여부를 이 검사로 확정한다.
- diff 아티팩트(히트맵·나란히 비교 이미지)를 리포트로 저장해 시각 검수에 쓴다.

### 2.4 ToonWet 전용 지표 (E28 채택 심사)

- 습식 현상 재현 체크리스트: backrun, granulation, 경계 침착(edge darkening), 건조 타임라인 — 기존 엔진(libmypaint/Hokusai 단독)이 재현 불가함을 먼저 기록(= V11 §3.3 조건 1 증거).
- wet pass 추가 시 프레임 예산 내 유지 여부 (Preview 근사 모드 포함).
- bake 결정성: 동일 seed wet 시뮬레이션 2회 bake 결과 비교.

## 3. 통과 게이트

| 게이트 | 기준 | 근거 |
| --- | --- | --- |
| G1. 입력 지연 | 입력→첫 preview p50 ≤ 4ms, p95 ≤ 8ms | V11 §9.3 |
| G2. readback | 일반 편집 중 GPU→CPU readback 0회 | V11 §9.3 |
| G3. 대형 브러시 | 1,000px 브러시를 CSP와 동일 장치에서 비교해 비열위 | V11 §9.3, §0.3 |
| G4. 결정성 | Final bake 경로 byte-equal 재현 (Hokusai 필수, libmypaint는 실측 후 계약 확정) | 래퍼 README 계약, E24 협업 규칙 |
| G5. parity 품질 | Golden Master corpus에서 픽셀 동등 또는 시각 검수 "동등 품질" 이상 | V11 §6.4 |
| G6. 안정성 | 4h/24h soak, worker-crash·context-loss 복구 무손실 | V11 §9.3, §10.5 |
| G7. ToonWet 채택 | V11 §3.3 조건 중 1개 이상을 벤치마크+시각 자료로 입증했을 때만 채택 | V11 §3.3, §6.2 |

게이트 판정 규칙 (질감 우선 — hybrid-design.md §0):

- **1순위 질감**: 시각/픽셀 품질 게이트(G5 등)를 통과하지 못한 후보는 처리량이 좋아도 pin 승격하지 않는다.
- **2순위 성능**: 질감 pin이 정해진 뒤 동일 엔진에서 최적화·재측정한다. 최적화 전 “빠른 저질 엔진”으로 바꾸지 않는다.
- **3순위 pin 교체**: 최적화 후에도 예산 미달일 때만 후보 pin을 lab에서 비교·승격한다. 런타임 silent 폴백 금지.
- **Hokusai 주력 승격**: G1~G6 통과 + 처리량 게이트 + 커버리지 리포트상 주요 프리셋군 손실 없음.
- **기존 exact route 유지**: 새 후보가 질감 또는 커버리지에서 미달하면 프리셋 단위로 기존 pin 유지 (전역 단일 승자 강제 없음).
- 질감 동등·성능 동등이면 유지보수 비용이 낮은 쪽(V11 §6.3) — 단 질감 열위는 비용으로 상쇄하지 않는다.
- libmypaint는 벤치마크 참조이며 제품 폴백 사다리가 아니다.

## 4. CSP 비열위 비교 방법

1. **동일 장치·동일 태블릿**에서 CSP와 ToonStudio를 같은 세션에 준비한다(V11 §9.3 — "CSP와 동일 장치에서 비교").
2. **대응 브러시 매핑표** 작성: CSP 대표 자연매체 브러시 ↔ ToonStudio preset (연필/수채/유화/스머지 각 군 최소 3종).
3. **지연 비교**: 고속 카메라 또는 화면 캡처 타임스탬프로 펜 접촉→첫 픽셀을 양쪽 동일 방법으로 측정(내부 계측이 아닌 외부 관측으로 공정성 확보). p50/p95 비교.
4. **품질 블라인드 테스트**: 동일 참조 스케치를 양쪽에서 그린 결과를 출처 은닉 후 평가자 패널이 선호·자연스러움 평가(V11 Phase 7 "CSP blind test"의 natural-media 선행판).
5. **대형 브러시·장문서 시나리오**: 1,000px 브러시, 30,000px 스트립 부분 편집을 동일 각본으로 수행해 체감 끊김(프레임 드랍) 비교.
6. 판정: 각 항목에서 "CSP 미만"이 하나라도 확정되면 출시 게이트 미통과(V11 §0.3 — CSP 동급 이상이 출시 게이트).
7. 주의: CSP 내부 계측은 불가능하므로 CSP 측 수치는 외부 관측치만 사용하고, ToonStudio 내부 계측치와 직접 혼용 비교하지 않는다(방법론 각주를 리포트에 명시).

## 5. 산출물

- `tests/benchmarks` 실행 리포트(JSON + 이미지 아티팩트) — 커밋 해시·장치 프로필·툴체인 버전 포함
- 프리셋별 provider pin 판정표 (ProviderBenchmarkRegistry 입력)
- Hokusai `.myb` 커버리지 리포트
- ToonWet 채택 심사 문서 (§3.3 조건별 증거 첨부)
- `capability-survey.md`의 미실측 칸 갱신 PR
