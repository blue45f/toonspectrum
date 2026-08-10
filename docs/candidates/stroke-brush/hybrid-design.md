# ToonStudio V11 — stroke-brush 하이브리드 설계 (hybrid design)

- 기준일: 2026-08-07
- 관련 매트릭스 행: E05 · E09 · E10 · E28
- 결합 유형(V11 §1.2 기준): ① 순차 파이프라인, ⑥ 기하/렌더 분리, ⑨ 선택적 자체 구현

## 0. 설계 요지

**1차 구현은 perfect-freehand(리포 의존성 1.2.3) 기반 `StrokeGeometryProvider` + 커스텀 스태빌라이저**이며, **Google Ink는 PoC 게이트를 통과한 뒤에만 경쟁 Provider로 편입되는 후보**다. 입력 계층과 스태빌라이저는 자체 구현이 IR 소유자이고, 지오메트리 Provider만 교체 가능하게 둔다. 이렇게 하면 Google Ink 승격/실패 어느 쪽이든 입력·교정·안정화 코드는 그대로 재사용된다.

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

```text
[1. 입력 — 자체 구현, 메인 스레드]
Pointer Events raw
+ getCoalescedEvents (프레임 사이 고밀도 샘플 복원)
+ getPredictedEvents (preview 전용 예측 샘플, commit에는 절대 미사용)
+ pressure / tilt / azimuth / twist / pointerType / persistentDeviceId
        │
        ▼
[2. 장치 교정 — 자체 구현]
DeviceProfile (Wacom / Apple Pencil / S Pen / Surface Pen / Huion / XP-Pen)
├─ 압력 커브 보정 (사용자 캘리브레이션 + 기본 프로필)
├─ tilt/azimuth 좌표계 정규화
├─ palm rejection · pen/finger 프로필 분기
└─ 타임스탬프 정규화 (coalesced 이벤트의 단조 증가 보장)
        │  → InputIR (raw 샘플 + 교정 파라미터 + seed 보존 = 재생 가능)
        ▼
[3. 스태빌라이저 — 자체 구현 (V11 §6.3 custom stabilizer)]
StabilizerGraph
├─ 모드: 없음 / 이동평균 / 지연-스프링(pull-string) / 각도 제약(자·가이드 연동)
├─ 강도-지연 트레이드오프를 preview에서 실시간 노출
└─ 예측 샘플 병합 정책: preview만 반영, 확정 샘플 도착 시 치환
        │  → StrokeIR (안정화된 샘플열 + dynamics 채널)
        ▼
[4. 스트로크 지오메트리 — 교체 가능한 StrokeGeometryProvider]
1차: PerfectFreehandProvider
├─ perfect-freehand 1.2.3 outline 폴리곤 (thinning/streamline/easing = BrushProgramIR 매핑)
├─ 자기교차 정리: Skia PathOps / Clipper2
└─ Kurbo fitting → 편집 가능한 PathIR (중심선 + outline, arc-length)
후보: GoogleInkProvider (PoC 게이트 후)
├─ Stroke Modeler 입력 모델 + BrushBehavior → mesh 스트로크
└─ Kurbo 역-fitting으로 중심선 추출 (부분 획 편집·선택용)
        │  → PathIR / mesh + StrokeIR (원본은 항상 IR, 엔진 객체는 캐시 — V11 §2.1)
        ▼
[5. 렌더 — Preview/Final 분리 (아래 §2)]
Preview: wet-ink island (Vello overlay 또는 ToonGpuExtensions pass)
Final:   CanvasKit/Skia 기준 출력 → 주 Surface 합성
        ▼
[6. 출력 — 저장·저널]
CommandJournal에 InputIR+StrokeIR+BrushProgramIR ref 기록 (undo/재생/협업 동기화 단위)
OPFS tile 반영은 commit 시 1회, per-dab 저장 금지
```

핫패스 규칙(V11 §9.1 준수): per-sample JS↔WASM 호출 금지 — 샘플은 ring buffer로 모아 프레임당 1회 batch 전달. 스트로크 진행 중 GPU→CPU readback 0회. React 상태에 샘플·draft를 넣지 않는다(E26 위험 항목).

## 2. Preview/Final 분리

| 구분 | Preview (wet-ink) | Final (commit) |
| --- | --- | --- |
| 목적 | 입력→첫 픽셀 p50 4ms / p95 8ms 목표(V11 §9.3) | 기준 화질·결정성·저장 |
| 샘플 | 예측 샘플 포함, 안정화 중간값 허용 | 확정 샘플만, 예측치 전량 폐기 |
| 지오메트리 | 저비용 근사(폴리곤 직렌더, fitting 생략 가능) | full 파이프라인(PathOps 정리 + Kurbo fitting) |
| 렌더러 | wet-ink island: Vello overlay, 필요 시 ToonGpuExtensions 스탬프/mesh pass | CanvasKit/Skia 기준 출력, Vello CPU/resvg cross-diff 기준선 |
| 결정성 | 요구하지 않음(장치별 편차 허용) | 필수 — 동일 InputIR 재생 시 동일 PathIR·픽셀 |

Preview와 Final의 시각 차이는 벤치마크 픽셀 diff 임계(benchmark-plan.md §3) 이내로 관리한다 — "커밋 순간 획이 변한다"는 체감을 없애는 것이 게이트다.

## 3. Island 소유권

- **wet-ink island**: 스트로크 작성 중의 draft 레이어. 소유자는 stroke-brush 서브시스템 단독(one-primary-surface 규칙의 island 단위 적용). 주 compositor는 이 island를 texture로만 받는다.
- **주 Surface**: 소유자는 CanvasKit compositor(E01 생산 기준선). 스트로크 commit 시 wet-ink island 내용을 폐기하고 Final 경로 결과를 타일에 합성한다.
- **선택·편집 overlay**: 소유자는 Vello(E02 — 선택 윤곽·앵커·transform handle). 중심선 PathIR을 받아 그리며, Vello 불안정 구간(알파 상태 명시)은 CapabilityRegistry가 CanvasKit으로 우회한다.
- **경계 규칙**: island 간 전달은 V11 §9.2 복사 비용 순위(동일 GPU texture/view 최우선)를 따르고, 엔진 전환은 객체별이 아니라 island별로만 한다.

## 4. 폴백 체인

```text
[전문 잉킹 지오메트리]
GoogleInkProvider (PoC 게이트 통과·승격 시)
  → PerfectFreehandProvider + 커스텀 스태빌라이저 + Kurbo   ← 1차 주력이자 영구 안정 폴백
    → 폴리라인 + CanvasKit stroke (최후 저하 모드: 고정 폭, 압력 무시)

[preview 렌더]
ToonGpuExtensions WebGPU pass
  → Vello overlay
    → CanvasKit 직접 draft 렌더 (WebGPU 불가 환경)

[입력]
getCoalescedEvents/getPredictedEvents 미지원 브라우저
  → raw Pointer Events만으로 동작 (스태빌라이저 강도 자동 상향, 예측 비활성)
```

폴백은 런타임 자동 전환이며, 어떤 단계로 떨어지든 InputIR/StrokeIR/PathIR 스키마는 동일하다 — 문서에는 Provider 이름·버전이 기록될 뿐 데이터 형태는 변하지 않는다(V11 §2.1 저장 원본과 실행 엔진 분리).

## 5. Google Ink PoC 게이트 (승격 조건)

benchmark-plan.md §5의 게이트를 통과해야 GoogleInkProvider를 기본 경로에 편입한다. 요약:

1. WASM 포팅이 고정 commit에서 재현 가능하게 빌드된다.
2. 동일 corpus에서 PerfectFreehandProvider 대비 시각 품질 우위(블라인드 평가) 또는 동역학 표현 우위가 확인된다.
3. p50/p95 지연·peak memory가 게이트 이내다(수치는 미실측 — tests/benchmarks 하니스로 측정 후 판정).
4. 결정성: 동일 InputIR 재생 시 mesh/픽셀 일치.
5. Worker 격리 하에서 crash 시 PerfectFreehandProvider로 무손실 자동 폴백이 동작한다.

실패 시 Google Ink는 후보 풀에 남고(재도전 가능), 1차 구성이 그대로 주력을 유지한다 — V11 §3.3 "자체 구현은 최후 수단이 아니라 비교를 통과한 하나의 후보 Provider"의 역방향 적용이다.

## 6. V12 3D surface-brush 제품 브리지 (2026-08-10)

`executeSurfaceBrushStroke`의 제품 Provider는 별도 메시/UV를 만들지 않는다. 제품이 이미 가진
Three/R3F Raycaster 또는 `three-mesh-bvh` hit를 다음 경로로 그대로 내린다.

```text
Three Intersection / BVH hit (object, uv/uv1, faceIndex, world point)
  → StudioVrmTexturePaintRuntime.resolveHit
      (texture matrix/wrap + geometry-index island + triangle texel density)
  → opaque surface session (one target, one primary owner)
  → SurfaceProjectionProvider (sample-order lookup; pressure byte/float 그대로)
  → executeSurfaceBrushStroke (seam-separated deterministic dab operations)
  → StudioVrmTexturePaintRuntime.commitSurfaceBrushSession
      (COW undo recorder → ImageData apply → one dirty CanvasTexture upload)
```

- atlas의 원본·편집 RGBA·CanvasTexture·undo는 기존 texture-paint runtime만 소유한다. Provider는
  픽셀 포인터를 받지 않으며 interactive GPU→CPU readback은 0회다.
- screen px→texel 밀도는 인접한 실제 world hit와 triangle `texelsPerWorldUnit` 또는 같은 UV
  island의 실제 UV delta로만 계산한다. 한 점 탭처럼 미분 근거가 없으면 호출자가 camera ray
  differential 실측을 넣어야 하며, 없으면 `texel-density-unavailable`로 명시 거부한다.
- 서로 다른 island, face/triangle ID, sampler wrap은 보존된다. `faceIndex`가 없으면 seam 소유권을
  증명할 수 없으므로 전체 기능을 격리하지 않고 그 입력만 `triangle-index-missing`으로 거부한다.
- package lowering/commit/Canvas upload 중 실패하거나 signal이 취소되면 runtime lease를 닫고 COW
  delta를 원상 복구한다. 다른 target의 hit를 한 획에 섞는 것도 `target-mismatch`로 거부한다.
- `stamp`/`image` tip과 `smudge`/`wet`은 texture-neighborhood/stamp sampler가 아직 없어 해당 backend만
  격리한다. round/no-mixing surface brush는 제품 경로로 활성화되어 있다.
