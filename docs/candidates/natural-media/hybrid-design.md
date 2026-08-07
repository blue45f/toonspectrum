# ToonStudio V11 — natural-media 하이브리드 설계 (hybrid design)

- 기준일: 2026-08-07
- 관련 매트릭스 행: E11 (libmypaint), E12 (Hokusai), E28 (ToonWet/wgpu)
- 결합 유형: V11 §1.2의 **5. 동역학/재질 분리** + **8. 교차 검증** + **9. 선택적 자체 구현**

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
→ HybridExecutionPlanner가 NaturalMediaProvider 선택
   ├─ MyPaintProvider  : libmypaint dynamics/dab 계산 (E11)
   └─ HokusaiProvider  : studio-hokusai-wasm — beginStroke(brush, seed)
                         → addSample(x, y, pressure, tiltX, tiltY, timeMs)
                         → finishStroke (E12)
→ (선택) ToonWetProvider: wet-tile simulation pass
   — pigment/water 상태 타일에 backrun·granulation·건조 타임라인 적용 (E28)
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

- **Natural-media tile island**: 소유자는 활성 NaturalMediaProvider **정확히 하나** (`HokusaiProvider` 또는 `MyPaintProvider`). 같은 레이어의 같은 stroke를 두 엔진이 동시에 그리지 않는다. 두 엔진 동시 실행은 parity lab(교차 검증)에서만 허용된다.
- **ToonWet pass**: island 내부의 종속 pass다. 독립 island가 아니며, 소유 Provider가 만든 pigment 타일 위에서만 동작하고 자체 표면을 소유하지 않는다.
- **Composite surface**: 소유자는 CanvasKit/Skia (E01 — 기본 페인팅 Surface·혼합·마스크). natural-media island는 텍스처/이미지로만 결과를 전달한다.
- **Overlay scene**: 소유자는 Vello (E02) — 브러시 커서·가이드·선택·HUD. natural-media 픽셀에 관여하지 않는다.
- 엔진 전환은 객체별이 아니라 **island별**로만 일어난다(V11 §9.1). 레이어 단위로 Provider 태그를 기록해 어떤 레이어가 어떤 엔진 결과인지 항상 추적한다.

WASM Provider는 Worker에 lazy load하고, island 비활성 시 Worker 종료로 메모리를 회수한다(V11 §9.1). Hokusai 래퍼는 `dispose()`(타일 해제, idempotent) → `free()`(래퍼 메모리) 순서의 명시적 수명 계약을 이미 제공한다.

## 4. 폴백 체인

```text
HokusaiProvider (품질 게이트 통과 시 주력)
  │ 실패: WASM init 실패 / worker crash / parity 게이트 미통과 프리셋
  ▼
MyPaintProvider (자연매체 기준선)
  │ 실패: libmypaint WASM 포팅 불가 장치 / 메모리 부족
  ▼
SkiaRasterProvider 근사 (E01 batched dab — dynamics 단순화, "근사 렌더" 배지 표시)
  │ 실패: Surface 자체 상실 (GPU context loss 등)
  ▼
편집 잠금 + CommandJournal 보존 → 복구 후 seed 재실행으로 무손실 재렌더
```

- **ToonWet 폴백**: WebGPU 미지원·성능 미달 장치에서는 wet pass를 생략하고 기본 수채(libmypaint/Hokusai 단독)로 동작한다. 문서에는 wet 파라미터가 IR로 보존되므로 상위 장치에서 다시 열면 재현된다. wet bake가 이미 있으면 bake를 표시한다.
- 폴백은 CapabilityRegistry가 프리셋·장치 단위로 라우팅한다(V11 §8 — 불안정 구간만 다른 Provider로 보낸다). 어떤 프리셋이 어떤 엔진에서 실행 가능한지는 preset의 provider/version 메타데이터(V11 §6.4)에 고정한다.
- 폴백 발생은 사용자에게 고지하고(품질 배지), Final bake는 반드시 원래 지정된 Provider가 가용해진 뒤에만 수행한다 — 폴백 엔진의 픽셀을 정본으로 승격하지 않는다.

## 5. parity lab 운영 구조

교차 검증(V11 §1.2-8)을 상시 파이프라인으로 둔다.

1. 동일 `.myb` preset corpus를 두 엔진에 로드 (Hokusai는 `.myb` 호환 지향 — 미지원 매핑은 커버리지 리포트로 분리).
2. 동일 InputIR 샘플 스트림(기록된 실제 획)을 동일 seed로 재생.
3. 타일 출력을 straight-alpha sRGB RGBA8로 정규화해 픽셀 diff (Hokusai 래퍼가 이미 이 형식 — libmypaint 어댑터도 동일 계약으로 변환).
4. diff 결과·지연·메모리를 ProviderBenchmarkRegistry에 기록, QualityOrchestrator가 프리셋별 주력 엔진을 판정.
5. 판정 결과는 preset 메타데이터에 provider pin으로 저장되어 런타임 라우팅에 쓰인다.

측정 지표·임계·게이트는 `benchmark-plan.md`가 정의한다.
