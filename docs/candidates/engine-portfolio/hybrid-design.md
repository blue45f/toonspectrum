# ToonStudio V11 하이브리드 설계 (Hybrid Design)

- 기준일: 2026-08-07
- 권위 소스: V11 최종 아키텍처 문서 §1~§9, 배치 매트릭스 CSV E01~E28

## 1. 설계 원칙

1. **넓은 후보 포트폴리오 + 좁은 활성 런타임.** 한 화면에서 모든 엔진을 매 프레임 전체 화면 렌더러로 실행하지 않는다(아키텍처 §1.1).
2. **한 Surface 또는 큰 Island에 주 소유자 하나.** 다른 엔진은 path·mesh·mask·tile·texture·scene fragment·command buffer 같은 중간 결과만 전달한다(ADR 0003).
3. **원본은 ToonStudio IR, 엔진 객체는 재생성 가능한 cache.** `SkPath`, `vello::Scene`, `GeglNode`, `cv::Mat`, `THREE.Object3D`를 문서 원본으로 저장하지 않는다(ADR 0002).
4. **hot path GPU→CPU pixel readback 금지.** per-dab JS/WASM 호출 대신 batch command(아키텍처 §9.1).
5. **엔진 전환은 객체별이 아니라 Island별.** 라우팅은 CapabilityRegistry + HybridExecutionPlanner가 담당한다.

## 2. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

### 2.1 공통 골격

```text
[입력]  Pointer Events + Device Calibration (raw/coalesced/predicted, palm rejection)
   │
[IR]    InputIR / StrokeIR / BrushProgramIR / PathIR / EffectGraphIR … (Stable IR = 원본)
   │
[계획]  HybridExecutionPlanner
        ├─ CapabilityRegistry: provider 지원 여부·불안정 구간 판정
        ├─ ProviderBenchmarkRegistry: 실측 비용 기반 후보 선택
        ├─ PreviewFinalScheduler: preview graph / final graph 분리
        └─ RenderIslandCompiler: island별 주 소유자 배정
   │
[처리]  Feature Workers (Google Ink / MyPaint / Hokusai / OpenCV / …)
        → 중간 결과(mesh, dab tile, mask, glyph run, scene fragment)
   │
[렌더]  Island 주 소유자 (CanvasKit Surface 또는 Vello Hub)
        → 동일 GPU texture/view 우선의 copy-cost ladder로 합성
   │
[출력]  Preview: 화면 합성 (저지연 우선)
        Final:   Bridge/Final Providers (libvips / G'MIC / GEGL / FFmpeg)
                 + OCIO/LCMS 색 변환 → 인코더
```

### 2.2 하위 시스템별 파이프라인

| 하위 시스템 | 입력 | 처리 | 렌더 | 출력 |
| --- | --- | --- | --- | --- |
| 전문 잉킹 | Pointer Events + 장치 교정 | Google Ink Stroke Modeler·BrushBehavior → mesh; 폴백: 자체 stabilizer → Perfect Freehand/Lyon → Kurbo fitting | Vello 선택·편집 overlay | CanvasKit/Skia 기준 출력 |
| 정밀 기술 펜·자 | 저지연 stabilizer(예측 최소화) + 자/도형 constraint | Kurbo/Lyon 중심선·outline | Vello 또는 CanvasKit | CanvasKit 기준 출력 |
| 일반 래스터 브러시 | Pointer 입력 → batched dab command | CanvasKit/Skia batched dab → sparse tile surface | CanvasKit Surface (주 소유자) + Vello overlay | CanvasKit export |
| 자연매체(연필·수채·유화) | Pointer 입력 | libmypaint 또는 Hokusai dynamics/dab (worker) → 선택적 ToonWet wet-tile | CanvasKit tile composite + Vello guide | CanvasKit composite → export |
| 벡터 선화·컷·말풍선 | 편집 커맨드 → PathIR | Kurbo/Peniko + Parley text | Vello Classic/Hybrid (주 소유자) | CanvasKit export reference |
| Path boolean·선 수정 | 편집 커맨드 | Kurbo edit model + Skia PathOps/Clipper2 boolean | Vello render | IR에 결과 path 기록 |
| SVG/Lottie 자산 | 파일 import → feature scanner | vello_svg/Velato ↔ ThorVG/Skottie 파일별 라우팅 | Vello scene fragment 또는 ThorVG island | resvg 정적 reference로 검증 후 export |
| 실시간 필터 | EffectGraphIR | CanvasKit ImageFilter/RuntimeEffect (+ 단순 벡터 효과는 Vello native) | 주 Surface에 즉시 합성 | EffectGraph cache 저장 |
| 분석형 필터(엣지·먼지) | EffectGraphIR + 대상 영역 | OpenCV analysis → mask | CanvasKit interactive composite | libvips/G'MIC final |
| 창작 필터 600+ | EffectGraph recipe | proxy: CanvasKit/OpenCV 저해상도 | proxy 결과 화면 합성 | final: 격리 G'MIC/GEGL → EffectGraph node 저장 |
| 초대형 export | ExportIR | libvips pyramid/batch | (렌더러 부담 없음) | OCIO/LCMS 색 변환 → target encoder |
| 한중일 텍스트 | TextIR | ICU4X/HarfRust/Skrifa/Parley layout | Glifo/Vello render | CanvasKit Paragraph validation |
| 3D 포즈·배경 | Scene3DIR | Three.js/three-vrm + Rapier contact + BVH raycast | Three.js island → depth/normal/ID pass | Vello/CanvasKit 2D composite |
| 애니메이션·오디오 | AnimationGraph | WebCodecs preview 디코드/인코드 | 타임라인 preview 합성 | Mediabunny container → FFmpeg final bridge |
| 협업·복구 | 사용자 커맨드 | Yjs/Loro semantic ops + command+seed+bake | presence/cursor는 Vello overlay | SQLite/OPFS journal/CAS + deterministic 외부 recovery ZIP; cloud는 opt-in 격리 |

## 3. Preview / Final 분리

`PreviewFinalScheduler`가 모든 EffectGraph·export 작업을 두 그래프로 컴파일한다(아키텍처 §7.3).

```text
EffectGraphIR
→ type / color-space validation
→ ROI / halo / temporal dependency 분석
→ Provider candidate discovery
→ native-node grouping (같은 provider 노드 묶기)
→ cross-provider copy cost 계산
→ preview graph  (저지연: CanvasKit/OpenCV proxy, 저해상도·ROI 한정)
→ final graph    (품질: libvips/G'MIC/GEGL/custom, 전체 해상도·취소 가능)
→ cache / tile / cancellation plan
```

- **Preview 계약**: 입력→첫 preview p50 4ms/p95 8ms 목표 안에서 동작. proxy 결과는 절대 문서 원본에 커밋하지 않는다.
- **Final 계약**: final 결과만 EffectGraph node의 bake로 저장한다. 진행률·취소·재시도는 ToonStudio가 통제하고, provider는 순수 실행자다.
- **동일 효과 다중 Provider**: 같은 Gaussian blur도 작은 반경 interactive는 CanvasKit, 대형 final은 libvips, 벡터 그림자는 Vello, 특수 bokeh는 custom/G'MIC — 문서·기기·품질 프로필에 따라 Planner가 선택한다.

## 4. Island 소유권

| Island | Primary Owner | 유입 중간 결과 | 비고 |
| --- | --- | --- | --- |
| 기본 페인팅 Surface | CanvasKit/Skia | Vello 벡터 island 텍스처, Google Ink mesh 래스터화 결과, libmypaint/Hokusai tile, OpenCV mask, libvips final | 생산 기준선. 마스크·혼합·텍스트 기준 출력 담당 |
| 벡터 장면 허브(선화·컷·말풍선·HUD) | Vello Classic/Hybrid | Kurbo path, Peniko paint, Parley glyph run, vello_svg/Velato fragment, raster/자연매체/3D texture island | 알파 상태 구간은 CapabilityRegistry가 CanvasKit으로 우회 |
| 자연매체 tile island | MyPaint/Hokusai worker | BrushProgramIR 컴파일 결과 | 결과 tile은 CanvasKit Surface가 합성. worker 종료로 메모리 회수 |
| 분석 island | OpenCV worker | 이미지 ROI | 출력은 mask/contour만 — 렌더는 소유하지 않음 |
| 3D island | Three.js | Scene3DIR, VRM, 물리 bake | 2D hot path와 분리. depth/normal/ID/vector pass만 2D로 전달 |
| Final 처리 island | libvips / G'MIC / GEGL (격리) | final graph, 전체 해상도 타일 | Local ToonBridge·Worker 격리·서버 중 배포 모드 선택(license-deployment.md) |
| DOM UI | React Aria/Radix/XState | CommandRegistry 이벤트 | 캔버스 내부 고빈도 HUD는 Vello 소유. CommandRegistry는 단일 |
| 저장/협업 | OPFS+SQLite / Yjs·Loro | CommandJournal, snapshot, CAS blob | 픽셀 전체를 CRDT에 넣지 않는다 |

**금지 사항**: 같은 Island 안에서 객체별 렌더러 전환, Surface 간 프레임당 왕복 readback, 두 compositor의 동일 Surface 동시 소유.

## 5. 폴백 체인

CapabilityRegistry가 provider 불안정 구간·장애를 감지하면 Island 단위로 폴백한다. 모든 폴백은 동일 IR에서 재컴파일되므로 데이터 손실이 없다.

```text
[잉킹]
Google Ink (고정 commit WASM PoC 게이트 통과 시 주력)
  → Perfect Freehand 1.2.3 + 자체 stabilizer + Kurbo fitting   ← 1차 출하 기본선 (ADR 0005)
    → CanvasKit 래스터 스트로크 (최후 보장선)

[벡터 렌더]
Vello Classic ↔ Vello Hybrid (문서별 벤치마크 선택)
  → CanvasKit (마스크·복합 필터 등 미지원 구간 재주입)
    → Vello CPU / CanvasKit Software (GPU 장애·context-loss 복구)

[자연매체]
Hokusai(studio-hokusai-wasm) ← parity lab 교차 검증 → libmypaint
  둘 중 corpus 우위 엔진을 주력으로, 나머지를 폴백으로 유지 (ADR 0006)
    → CanvasKit 일반 래스터 브러시 (자연매체 불가 시 기능 축소 폴백)

[SVG]
vello_svg → ThorVG → resvg(정적 렌더 폴백 겸 reference)

[Lottie]
Velato → ThorVG → CanvasKit Skottie

[텍스트]
Parley/Glifo/Vello → CanvasKit Paragraph (기준선이자 폴백)

[필터 final]
G'MIC/GEGL 격리 provider → libvips → CanvasKit final (품질 프로필 하향 명시)

[미디어]
WebCodecs → FFmpeg bridge (미지원 codec·batch)

[저장]
SQLite/OPFS 주 저널 → two-slot snapshot 복구 → SHA-256 CAS recovery ZIP 내보내기/재수화
→ opt-in 암호화 cloud backup(후속 격리)

[GPU 전체 장애]
모든 GPU island → CPU 기준선(Vello CPU·CanvasKit SW·resvg·tiny-skia)로 강등,
문서는 IR 그대로 유지 → GPU 복구 시 재컴파일
```

폴백 발동은 사용자에게 숨기지 않고 진단 패널에 provider·사유를 기록한다(Provider descriptor의 `fallback`·`known bugs` 필드).

## 6. 엔진 간 복사 비용 사다리

Island 경계를 넘는 모든 데이터는 아래 우선순위를 따른다(아키텍처 §9.2). Planner는 cross-provider copy cost를 그래프 컴파일 시점에 계산해 native-node grouping을 우선한다.

```text
1. 동일 GPU texture/view 공유
2. encoded command buffer / external texture
3. ImageBitmap / VideoFrame
4. SharedArrayBuffer tile
5. CPU readback and re-upload   ← hot path에서 금지, final/export 경계에서만 허용
```
