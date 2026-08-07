# Filters 서브시스템 — 벤치마크 계획 (Benchmark Plan)

- 기준일: 2026-08-07
- 권위 소스: V11 최종 아키텍처 §3(엔진 선택 알고리즘)·§9.3(성능 게이트)·§13 Phase 0/3, 배치매트릭스 E01·E16~E20 검증 게이트 열
- 실행 위치: `/tests/corpus`, `/tests/benchmarks` (V11 §12 모노레포 구조). 모든 수치는 이 하니스 실측 전까지 "미실측"으로 유지한다.
- 주의: 본 문서의 임계값은 **측정치가 아니라 게이트 제안 초기값**이다. Phase 0 캘리브레이션에서 장치 프로필별로 확정한다.

## 1. 코퍼스 구성

### 1.1 문서 코퍼스 (V11 §9.3 목표 규격 반영)

| Corpus ID | 내용 | 목적 |
| --- | --- | --- |
| DOC-S | 2048×2048, 레이어 8, 선화+플랫 컬러 | 소형 기준·회귀 최소 단위 |
| DOC-M | 4096×4096, 레이어 30, 사진 참조+브러시 텍스처 혼합 | 4K filter interaction 게이트 본체 |
| DOC-L | 8192×8192, 레이어 100 | 8K·100 layer 유지 게이트 |
| DOC-STRIP | 폭 1600 × 세로 30,000px 웹툰 스트립, 컷 40 | 초장축 ROI/타일 처리·export |
| DOC-TONE | 스크린톤·해칭 밀집 문서 | 모아레·리샘플 품질 감시 |
| DOC-TEXT | 말풍선·CJK 텍스트 밀집 문서 | 필터가 텍스트 경계를 훼손하지 않는지 |
| DOC-GRAD | 광역 그라데이션+반투명 다층 | 밴딩·색공간 오류 검출 |

### 1.2 필터 레시피 코퍼스

| Recipe Set | 구성 | 주 대상 Provider |
| --- | --- | --- |
| CORE-20 | Gaussian/모션 blur(반경 소·중·대), sharpen, 색조/채도/커브, 그림자, 노이즈 등 핵심 인터랙티브 20종 | CanvasKit ↔ libvips 교차 |
| ANALYSIS-10 | 마술봉 허용치 스윕, Canny 엣지, morphology open/close, 먼지 제거, inpaint 보조 등 10종 | OpenCV |
| CREATIVE-30 | G'MIC 대표 recipe 30종 (예술 효과·복원·패턴·color grading 계층별 표본) | G'MIC 격리 Provider |
| NDE-10 | 3~8노드 비파괴 체인 10종 (조정 레이어 스택 시나리오) | GEGL ↔ EffectGraphIR 자체 스케줄러 비교 |
| COLOR-8 | ICC 변환, OCIO display transform, soft proof, wide-gamut export 8종 + cross-engine color chart | OCIO/LCMS/skcms |
| CHAIN-6 | 위 세트를 섞은 6종 복합 체인 (분석→창작→색관리) | copy-cost·grouping 검증 |

### 1.3 장치 프로필

- 고성능 데스크톱(dGPU) / 중급 노트북(iGPU) / iPad급 태블릿 / 보급 Android 태블릿.
- 각 프로필에서 COOP/COEP 적용·미적용(=SharedArrayBuffer 가용·불가) 2모드로 wasm-vips·OpenCV 스레딩 경로를 분리 측정한다.

## 2. 측정 지표

모든 지표는 Provider·노드 클래스·문서·장치 프로필별로 기록한다 (ProviderBenchmarkRegistry에 적재).

| 지표 | 정의 | 현재 값 |
| --- | --- | --- |
| Preview p50/p95/p99 | 파라미터 변경 → 화면 반영까지 (가시 ROI 기준) | 미실측 — tests/benchmarks 하니스로 측정 |
| Final wall time | final graph 실행 시작 → 전체 타일 완료 | 미실측 — tests/benchmarks 하니스로 측정 |
| Peak Memory | Worker/브리지 프로세스별 최대 상주 메모리 (WASM heap + GPU 추정 포함) | 미실측 — tests/benchmarks 하니스로 측정 |
| Copy-cost | Island 경계 횟수, 경계 유형(§9.2 단계), 전송 바이트, readback 발생 수 | 미실측 — 하니스 계측 |
| Cold start | Provider lazy-load(다운로드+컴파일+init) 시간, 번들 바이트 | 미실측 — 하니스 계측 |
| Cache hit rate | 노드 출력 캐시 적중률 (V11 §9.3) | 미실측 — 하니스 계측 |
| Pixel diff | golden 대비 ΔE00 평균/최대, SSIM, 불일치 픽셀 비율 | 미실측 — 하니스 계측 |
| Determinism | 동일 입력 3회 실행 + 장치 2종 교차의 비트/ΔE 일치 여부 | 미실측 — 하니스 계측 |
| Soak | 4h/24h 연속 필터 조작 시 메모리 기울기·크래시·leak (매트릭스 공통 게이트) | 미실측 — 하니스 계측 |

계측 규칙: 계측 자체가 hot path를 오염시키지 않도록 동기 버스트 기록 후 유휴 시간에 플러시한다. GPU 시간은 timestamp query 가용 시에만 세분화하고, 불가 시 프레임 경계 시간으로 대체함을 결과에 명기한다.

## 3. 통과 게이트

### 3.1 성능 게이트 (V11 §9.3 준거)

- G1. Preview 반응: CORE-20 × DOC-M에서 파라미터 조작 중 preview 갱신이 상호작용 프레임 예산을 유지 — 세부 목표는 §9.3의 "입력→첫 preview p50 4ms / p95 8ms" 원칙을 필터 preview에 맞게 Phase 0에서 캘리브레이션해 확정한다(제안 초기값: 가시 ROI 재계산 p95 ≤ 1 vsync).
- G2. Readback 0회: 일반 편집(preview) 경로에서 GPU→CPU readback 0회. 하니스가 1회라도 검출하면 실패.
- G3. 대형 문서 유지: DOC-L·DOC-STRIP에서 필터 조작 중 UI 스레드 블로킹 없음, final은 취소 가능해야 함.
- G4. Cold start 예산: 각 Worker Provider의 lazy-load가 최초 사용 UX 예산(제안 초기값: 진행 표시 포함 수 초 내) 안에 들고, 미사용 시 메모리로 회수됨을 soak에서 확인.
- G5. Soak: 4h/24h 반복 필터 세션에서 메모리 단조 증가 없음, 크래시 0, context-loss/worker-crash 후 폴백 체인 복구 성공.

### 3.2 품질 게이트 (pixel diff)

- Q1. Final 결정성: 동일 입력·seed 고정 시 final 결과는 장치 간 ΔE00 최대치가 노드 클래스별 예산 이내(제안 초기값: 비지각 수준. CPU 기준 경로는 비트 동일 목표). G'MIC은 seed·스레드 고정 계약 하에서 측정.
- Q2. Preview 근사 예산: preview vs final의 diff를 노드 클래스별로 예산화(제안: CORE는 near-identical, CREATIVE는 "구도·색 경향 보존" 수준의 완화 예산 + UI 근사 배지 의무). 예산 자체는 시각 평가 패널로 캘리브레이션.
- Q3. 교차 Provider 동등성: 같은 노드를 CanvasKit/libvips/OpenCV가 각각 구현하는 경우(예: Gaussian blur) 상호 diff가 예산 이내여야 Provider 전환이 무보정 허용된다. 초과 시 CapabilityRegistry에 "전환 시 재계산 필요" 마크.
- Q4. 색관리: COLOR-8 cross-engine color chart에서 ColorPipeline 단일 적용 결과가 참조 변환과 일치하고, 이중 변환(엔진 중복 적용) 검출 0건.
- Q5. 콘텐츠 안전: DOC-TONE 모아레, DOC-TEXT 텍스트 경계, DOC-GRAD 밴딩에 대한 golden 회귀 통과.

### 3.3 채택·승격 게이트 (V11 §3.3 연동)

- 후보 Provider(기존 엔진·custom 모두)는 동일 corpus에서 위 게이트 + §3.2 품질·성능 점수표로 비교한다.
- Custom Provider는 "기존 Provider 대비 우위 입증"(품질 또는 p95 또는 copy-cost) 없이는 주력 승격 불가. 차이가 없으면 검증 엔진 유지(V11 §6.3 동일 원칙).
- GEGL은 NDE-10에서 "libvips+OpenCV 재컴파일 조합" 대비 충실도·비용 우위를 보여야 격리 Provider 운영 비용을 정당화한다.

## 4. CSP 비열위 비교 방법

목표: "대표 필터 실시간성에서 CSP 동급 이상"(V11 §0.3)을 재현 가능한 절차로 판정한다.

1. **동일 장치·동일 문서**: 각 장치 프로필에 CSP와 ToonStudio를 함께 설치하고, DOC-M/DOC-L/DOC-STRIP과 시각적으로 동등한 문서를 양쪽 네이티브 포맷으로 준비한다(변환 오차는 사전 검수).
2. **매핑 표**: CSP 필터 ↔ ToonStudio EffectGraph 노드 대응표를 만들고, 대응 불가 항목은 "기능 공백"으로 별도 목록화한다(비교에서 제외하지 않고 공백으로 보고).
3. **조작 스크립트**: 슬라이더 스윕·적용·취소·연속 재적용 시나리오를 동일 타이밍으로 수행한다. ToonStudio는 하니스 자동화, CSP는 입력 자동화 도구+고프레임 화면 녹화로 계측한다(내부 계측 불가하므로 화면 반응 기준 외부 계측 — 방법 비대칭성을 결과에 명기).
4. **판정 지표**: (a) 조작 중 체감 반응(녹화 프레임 분석 기반 갱신 지연), (b) 대형 문서 적용 완료 시간, (c) 조작 중 프리즈·프레임 드랍 빈도. 절대값이 아니라 **동일 장치 상대 비교**로 판정한다.
5. **블라인드 시각 평가**: 동일 필터 결과 이미지 쌍을 출처 은닉 후 작가 패널이 품질 평가. Preview 근사 예산(Q2) 캘리브레이션에도 이 패널 결과를 사용한다.
6. **비열위 판정**: 게이트 필터 목록(대표 필터 셋)에서 (a)~(c) 모두 CSP 대비 유의한 열위가 없고, 블라인드 품질 평가에서 동급 이상이면 통과. 열위 항목은 §3.3 채택 게이트의 개선 백로그로 자동 등록한다.

## 5. 운영

- 하니스는 Phase 0에서 구축하고(§13), 이후 모든 Provider 후보·버전 업은 동일 corpus 재실행 없이는 CapabilityRegistry에 등록되지 않는다.
- 결과는 ProviderBenchmarkRegistry에 provider·version·commit·장치 프로필 키로 적재하고, HybridExecutionPlanner의 estimate() 비용 모델 입력으로 사용한다.
- golden 이미지는 CPU 결정 경로(CanvasKit Software / Vello CPU / resvg 계열)에서 생성해 저장소에 버전 고정한다.
