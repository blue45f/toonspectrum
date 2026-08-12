# ToonStudio V11 — natural-media 하이브리드 설계 (hybrid design)

- 기준일: 2026-08-07
- 개정: 2026-08-12 — §4 다단 엔진 폴백 폐기 → fail-closed 단일 권위 (질감 이질 방지)
- 개정: 2026-08-12 — §0 질감 우선 하이브리드 채택 순서 (성능 최적화 후 pin 교체)
- 관련 매트릭스 행: E11 (libmypaint), E12 (Hokusai), E28 (ToonWet/wgpu)
- 결합 유형: V11 §1.2의 **5. 동역학/재질 분리** + **8. 교차 검증** + **9. 선택적 자체 구현**
- 제품 정책 거울: `src/domains/creator/studio-brush-backend-quality-policy.ts`  
  (`STUDIO_BRUSH_ENGINE_PRIORITY_POLICY`, `STUDIO_BRUSH_CROSS_ENGINE_PRODUCT_FALLBACK_POLICY`)

## 0. 채택 우선순위 — 질감 우선 (Texture-first hybrid)

자연매체·드라이·스프레이에서 **질감이 1순위**다. 성능은 같은 pin 위에서 최적화하고,  
그래도 예산 미달일 때만 **의도적 pin 교체**(parity lab 증거)를 검토한다.  
런타임 장애 시 다른 엔진으로 “대충 그리기” 폴백과는 별개다(§4).

```text
1. 질감 우선 하이브리드 구성
   패밀리마다 검증된 주력 엔진·OSS 커널을 pin
   (oil ribbon / Hokusai oil, dry anisotropic, Klecks spray tip, wet-field …)
        │
        ▼
2. 동일 pin 위에서 성능 최적화
   Worker 배치, dirty rect, spacing/budget, GPU pass, 메모리 회수
   — 픽셀 계약(seed·receipt·parity)을 깨지 않는 범위만
        │
        ▼
3. 예산 미달 시에만 엔진 pin 교체 검토
   parity lab: 후보가 질감 게이트 동급 이상 + 처리량 게이트 통과
   → preset metadata에 새 pin 기록 (버전·seed 재실행 계약)
   → 자동 silent substitution 금지
```

| 단계 | 하는 일 | 하지 않는 일 |
| --- | --- | --- |
| 1 질감 pin | 사이트/OSS 분석 기반 주력 선택, 하이브리드 라우팅 | 성능 때문에 처음부터 저질 근사 엔진 선택 |
| 2 성능 | 동일 엔진 내 최적화, 프레임 예산 프로파일 | 최적화 전에 pin 교체 |
| 3 pin 교체 | lab 증거 + 명시 승격 후에만 | 장애 시 계단형 폴백, mid-stroke 교체 |

**성능 미달의 제품 응답 (pin 교체 전):** 프리셋/장치 상한, preview 스케줄(Final은 동일 pin 원칙),  
해당 프리셋 비활성·고지 — **다른 질감으로 위장 그리기 금지**.

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

```text
[입력]
Pointer Events (coalesced/predicted, pressure/tilt/azimuth/twist)
→ 장치 교정 프로필 (Wacom / Apple Pencil / S Pen / Surface Pen / Huion / XP-Pen)
→ InputIR 샘플 스트림 (절대 monotonic timeMs, pressure∈[0,1], tilt∈[-1,1])
        │
        ▼
[처리]
BrushProgramIR (dynamics/tip/texture/mixing/material 그래프)
→ HybridExecutionPlanner가 **프리셋 pin된 NaturalMediaProvider 정확히 하나** 선택
   (패밀리 라우팅: dry / wet-oil / spray 등 — 계단형 엔진 폴백 아님)
   ├─ HokusaiProvider  : studio-hokusai-wasm (.myb carrier + texture v2) — 제품 natural-media 후보
   ├─ (parity lab only) MyPaintProvider / libmypaint WASM — 벤치마크 참조, 제품 폴백 금지
   └─ 패밀리 전용 specialist (oil ribbon, dry anisotropic, stamp spray…) — 카탈로그 pin
→ (선택) ToonWet / Living Ink: wet-tile pass — 권위 pigment 타일 위 종속 pass only
        │
        ▼
[렌더]
Provider가 갱신한 sparse tile (Hokusai는 dirtyBounds/dirtyFrame로 증분 노출)
→ 타일을 텍스처로 업로드 (GPU→CPU readback 없이 업로드 단방향)
→ CanvasKit/Skia tile surface가 레이어 blend/mask/합성 소유 (E01 조합 규칙)
→ Vello는 guides·선택 윤곽·vector overlay만 담당 (E11 조합 규칙)
        │
        ▼
[출력]
Preview: 화면 합성 결과 (증분 dirty-rect 갱신)
Final  : CommandJournal의 stroke command + seed 재실행으로 결정적 bake
→ 레이어 픽셀은 CAS 타일로 저장 (OPFS + SQLite WASM, E25)
→ 대형 export는 libvips 파이프라인, 색관리는 OCIO/LCMS 경계 (V11 §5)
```

핵심 불변식:

- 프로젝트 원본은 `BrushProgramIR` + `CommandJournal`(stroke command·seed)이다. 엔진 타일·`MemSurface`는 재생성 가능한 cache다(V11 §2.1).
- hot path에서 GPU→CPU pixel readback 0회, per-dab JS/WASM 호출 대신 batch command(V11 §9.1). Hokusai 래퍼에는 샘플 배열을 묶어 넘기는 batch API를 어댑터 계층에서 보강한다.

## 2. Preview / Final 분리

| 구분 | Preview | Final |
| --- | --- | --- |
| 목표 | 입력→첫 preview p50 4ms 이하, p95 8ms 이하 (V11 §9.3) | 픽셀 정확성·결정성·재현성 |
| 실행 | 활성 Provider의 증분 dab → dirty-rect만 업로드·합성 | 동일 Provider·동일 seed로 stroke command 재실행 후 타일 bake |
| ToonWet | 저해상도/저반복 wet 근사 (프레임 예산 내) | 전체 해상도 시뮬레이션을 완주한 뒤 결과만 bake |
| 협업 | 로컬 미리보기만 | command+seed+bake만 동기화 (E24 규칙 — 픽셀 스트림을 CRDT에 넣지 않음) |
| 검증 | — | Hokusai 경로는 바이트 결정성 계약으로 Preview 재실행 결과와 Final이 일치해야 함 |

Preview와 Final이 같은 Provider를 쓰는 것이 원칙이다(자연매체는 엔진 간 픽셀 차이가 곧 품질 차이이므로, 필터처럼 proxy 엔진을 두지 않는다). Preview/Final의 차이는 **엔진 교체가 아니라 해상도·반복 횟수·스케줄링**에만 둔다.

## 3. Island 소유권

V11 §1.1 "한 Surface 또는 큰 Island에 주 소유자 하나" 규칙의 natural-media 적용:

- **Natural-media tile island**: 소유자는 프리셋에 pin된 NaturalMediaProvider **정확히 하나**. 같은 stroke를 두 엔진이 동시에 그리지 않는다. 두 엔진 동시 실행은 **parity lab(교차 검증) 전용**이며 제품 폴백 경로가 아니다.
- **ToonWet / Living Ink pass**: island 내부의 종속 pass다. 독립 island가 아니며, 소유 Provider가 만든 pigment 타일 위에서만 동작하고 자체 표면을 소유하지 않는다.
- **Composite surface**: 소유자는 CanvasKit/Skia (E01 — 기본 페인팅 Surface·혼합·마스크). natural-media island는 텍스처/이미지로만 결과를 전달한다.
- **Overlay scene**: 소유자는 Vello (E02) — 브러시 커서·가이드·선택·HUD. natural-media 픽셀에 관여하지 않는다.
- 엔진 전환은 객체별이 아니라 **island별·프리셋 pin 변경**으로만 일어난다(V11 §9.1). mid-stroke provider switch 금지. 레이어/획에 Provider·version·seed 태그를 기록한다.

WASM Provider는 Worker에 lazy load하고, island 비활성 시 Worker 종료로 메모리를 회수한다(V11 §9.1). Hokusai 래퍼는 `dispose()`(타일 해제, idempotent) → `free()`(래퍼 메모리) 순서의 명시적 수명 계약을 이미 제공한다.

## 4. 실패 모드 — fail-closed 단일 권위 (다단 엔진 폴백 폐기)

### 4.1 왜 계단형 폴백을 쓰지 않는가

자연매체는 **엔진 = 질감**이다. Hokusai → libmypaint → Skia 근사로 바꾸면 같은 프리셋이 기기·세션마다 이질 픽셀을 내고, live/commit/reopen parity가 깨진다.  
따라서 **픽셀 권한을 넘기는 cross-engine product fallback은 금지**한다. libmypaint는 벤치마크 참조만 담당한다 (`benchmark-reference-only-not-product-fallback`).

### 4.2 권위 경로 (정상)

```text
프리셋 metadata.provider pin (또는 패밀리 기본 pin)
  → 해당 Provider만 live / commit / final
  → seed + engineVersion + adapterVersion + input/pixel receipt 영속
```

하이브리드는 “한 획 안에서 엔진을 계단으로 갈아끼우기”가 아니라  
**패밀리마다 주력 엔진을 고르는 라우팅**(oil ribbon / Hokusai oil, dry anisotropic, stamp spray, wet-field …)이다.

### 4.3 실패 모드 (가용성만 — 질감 교체 없음)

```text
pin된 Provider 사용 가능?
  ├─ 예 → 그 엔진만 실행 (mid-stroke switch 금지)
  └─ 아니오
        → 새 획 입력 거부 또는 해당 프리셋 비활성 (fail-closed)
        → 기존 표면 보존 (emitApproximation: false)
        → CommandJournal + seed + provider pin 보존
        → 이미 bake된 결과(PNG/tile)만 표시 가능
        → 복구 후 **동일 pin Provider**로 seed 재실행 (무손실 재렌더)
```

| 상황 | 허용 | 금지 |
| --- | --- | --- |
| WASM init 실패 / worker crash | 편집 잠금·프리셋 비활성·journal 보존 | MyPaint/Skia로 같은 oil을 몰래 그리기 |
| 품질 게이트 미통과 | 기존 exact product route 유지, Hokusai는 experimental opt-in만 | identity만으로 자동 승격·대체 |
| WebGPU wet pass 불가 | wet pass 생략 + **이미 bake된 wash 표시**; 문서에 wet IR 보존 | 다른 dab 엔진을 “수채”로 위장 승격 |
| Surface/GPU context 상실 | 편집 잠금 + journal 보존 | live-only approximation을 final로 승격 |
| silent-backend-substitution | — | **항상 금지** |
| generic-round-circle / cross-family round dab | — | dry/wet 품질 패밀리에서 **항상 금지** |

### 4.4 ToonWet / Living Ink

- WebGPU 미지원·성능 미달: **신규 물리 획을 다른 엔진으로 대체하지 않는다.**  
  wet 파라미터는 IR로 남기고, bake가 있으면 bake를 보여 주며, 상위 장치에서 동일 pin으로 재현한다.
- Living Ink 신규 물리 획 게이트가 OFF이면 soft wash 경로가 별도 pin된 제품 경로일 뿐, Hokusai/oil 실패 시의 폴백이 아니다.

### 4.5 사용자 고지

- pin Provider 불가로 프리셋이 막히면 UI에 이유(품질 게이트 / 런타임 미준비 / 장치 capability)를 고지한다.
- experimental opt-in 변환은 명시 선택이며, 자동 identity 라우팅과 혼동하지 않는다.

## 5. parity lab 운영 구조

교차 검증(V11 §1.2-8)을 상시 파이프라인으로 둔다. **lab에서의 이중 엔진 실행은 제품 폴백이 아니라 승격 증거 수집**이다.

1. 동일 `.myb` preset corpus를 두 엔진에 로드 (Hokusai는 `.myb` 호환 지향 — 미지원 매핑은 커버리지 리포트로 분리).
2. 동일 InputIR 샘플 스트림(기록된 실제 획)을 동일 seed로 재생.
3. 타일 출력을 straight-alpha sRGB RGBA8로 정규화해 픽셀 diff (Hokusai 래퍼가 이미 이 형식 — libmypaint 어댑터도 동일 계약으로 변환).
4. diff 결과·지연·메모리를 ProviderBenchmarkRegistry에 기록, QualityOrchestrator가 프리셋별 **주력 pin 후보**를 판정.
5. 게이트 통과 시에만 preset 메타데이터에 provider pin을 기록한다. 미통과 시 **기존 exact product route 유지** — libmypaint를 제품 폴백으로 승격하지 않는다.

측정 지표·임계·게이트는 `benchmark-plan.md`가 정의한다.
