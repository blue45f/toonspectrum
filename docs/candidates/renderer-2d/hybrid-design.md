# renderer-2d 하이브리드 설계 (Hybrid Design)

- 담당 서브시스템: **renderer-2d** — 2D 렌더러와 island 합성
- 관련 매트릭스 행: E01~E06, E08, E13~E15, E28
- 상위 원칙: 한 Surface 또는 큰 Island에 **주 소유자 하나**, 나머지 엔진은 중간 결과(path, mask, tile, texture, scene fragment)만 전달 (V11 §1.1)
- V11 1차 실코드: **CanvasKit(생산 기준선) + vello_cpu 0.2.0(결정적 CPU 기준선, wasm-pack)**

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

```text
[입력 단계]
Pointer Events / coalesced·predicted input / 장치 교정
Brush·Vector·Text 편집 커맨드 (CommandRegistry)
                 │
                 ▼ InputIR / StrokeIR / PathIR / TextIR / PaintIR
[처리 단계]
Kurbo        : 중심선·outline 후처리·arc-length·split·guide 기하   (E05)
Peniko/Color : PaintIR → 엔진별 Paint 매핑, 색공간·blend 정규화     (E06)
(후보) Parley glyph run → Glifo 캐시                                (E08, 승격 시)
(후보) SVG/Lottie feature scan → ThorVG / vello_svg+Velato 라우팅   (E13/E14, 승격 시)
                 │
                 ▼ LayerGraphIR / ToonSceneIR (엔진 객체는 저장하지 않는 재생성 cache)
[렌더 단계]
CanvasKit Surface (주 소유자, 1차)
  ├─ 래스터 브러시 dab batch → sparse tile
  ├─ 마스크·블렌드·ImageFilter/RuntimeEffect
  ├─ Paragraph 텍스트 (1차 기준선)
  └─ Island 합성: 외부 엔진 결과를 이미지/텍스처로 수신
(후보) Vello Classic/Hybrid island: 선화·컷·말풍선·효과선·대규모 벡터
ToonGpuExtensions (E28): texture interop·final composite·sparse tile residency 최소 pass
                 │
                 ▼
[출력 단계]
화면 표시   : CanvasKit present (one-primary-surface 규칙)
기준 출력   : CanvasKit export reference
결정적 출력 : vello_cpu 0.2.0 (wasm-pack, Worker) — golden image·백그라운드 export·복구 렌더
정적 기준   : resvg + tiny-skia (E15) — SVG 정합·export validation의 심판
```

핵심 불변 조건:

- 저장 원본은 항상 ToonStudio IR이다. `SkPath`·`vello::Scene` 등 엔진 객체는 재생성 가능한 cache다 (V11 §2.1).
- hot path에서 GPU→CPU pixel readback 금지, per-dab 호출 대신 batch command (V11 §9.1).
- 복사 비용 사다리: 동일 GPU texture/view → encoded command buffer/external texture → ImageBitmap/VideoFrame → SharedArrayBuffer tile → CPU readback 순으로만 강등 (V11 §9.2).

## 2. Preview / Final 분리

| 구분 | Preview (인터랙티브) | Final (커밋·출력) |
| --- | --- | --- |
| 소유자 | CanvasKit Surface (메인 스레드 or 전용 Worker) | vello_cpu Worker(결정적 경로) + CanvasKit export reference |
| 목표 | 입력→첫 preview p50 4ms / p95 8ms (V11 §9.3) | 픽셀 결정성·회귀 가능성·대형 출력 안정성 |
| 품질 | 프록시 해상도·간이 필터 허용 | 전체 해상도·전체 효과 그래프 |
| 스케줄 | PreviewFinalScheduler가 입력 idle·타일 dirty 기준으로 Final을 지연 실행 | 취소 가능(cancellation plan), 진행률 보고 |
| 검증 | 없음(속도 우선) | vello_cpu·resvg 기준 이미지와 pixel diff — 임계 초과 시 회귀 플래그 |

규칙:

1. Preview와 Final은 **같은 IR**을 입력으로 받는다. 두 경로의 차이는 Provider 선택과 품질 프로파일뿐이다.
2. Final 결과가 Preview와 임계 이상 다르면(픽셀 diff) 벤치 하니스에 자동 리포트한다 — "미리보기 거짓말"을 회귀로 취급.
3. 썸네일·자동 저장 스냅샷은 Final 경로(vello_cpu)만 사용해 저장물의 결정성을 보장한다.

## 3. Island 소유권

| Island | 주 소유자 (1차) | 전달 형식 | 승격 후보 |
| --- | --- | --- | --- |
| 기본 페인팅 Surface (래스터 레이어·마스크·필터) | CanvasKit | — (주 compositor) | 없음 (기준선 유지) |
| 벡터 선화·컷·말풍선·효과선 | CanvasKit (Kurbo 기하 → SkPath) | PathIR → SkPath | Vello Classic/Hybrid island (Phase 1 벤치 통과 시) |
| 텍스트 (문단·말풍선) | CanvasKit Paragraph | TextIR | Parley+Glifo → Vello 텍스트 island |
| SVG/Lottie asset | 정적: resvg 사전 래스터 → CanvasKit 이미지 | PNG/ImageBitmap | ThorVG island(런타임 애니메이션) 또는 vello_svg+Velato(Vello 승격 시 scene fragment 직결) |
| Island 간 합성·sparse tile residency | ToonGpuExtensions 최소 pass + CanvasKit | GPU texture / ImageBitmap | 자체 pass 확대는 증거 기반으로만 |
| Golden·복구·백그라운드 export | vello_cpu 0.2.0 Worker | ToonSceneIR → PNG/타일 버퍼 | 없음 (기준선 유지) |

소유권 규칙:

- 엔진 전환은 객체별이 아니라 **island별**로만 한다 (V11 §9.1).
- 한 Surface의 주 compositor는 항상 하나다. 승격은 "CanvasKit 안의 벡터 그리기 일부"가 아니라 "벡터 island 전체"를 Vello로 넘기는 형태다.
- island 경계에서의 데이터 전달은 복사 비용 사다리 상단 형식을 우선한다.

## 4. 폴백 체인

```text
[벡터·일반 렌더]
(승격 후) Vello Classic/Hybrid island
   │ capability probe 실패 / WebGPU 부재 / diff 게이트 위반
   ▼
CanvasKit (GPU)                      ← 1차 기본값
   │ WebGL/GPU context loss·미지원
   ▼
CanvasKit Software (CPU surface)
   │ WASM 실패·크래시 반복
   ▼
vello_cpu Worker 렌더 (표시 지연 허용, 문서 보전 우선)

[텍스트]
(승격 후) Parley+Glifo→Vello → CanvasKit Paragraph (기준선·폴백, V11 E07/E08)

[SVG/Lottie asset]
(승격 후) vello_svg+Velato 또는 ThorVG (feature scan 라우팅)
   │ 미지원 사양 검출
   ▼
resvg 사전 래스터 → CanvasKit 이미지    ← 1차 기본값

[출력·검증]
vello_cpu ↔ resvg+tiny-skia ↔ CanvasKit Software 3중 교차 기준 (V11 E04)
GPU 장애·context loss 시: vello_cpu가 마지막 스냅샷 재렌더로 복구 화면 제공
```

폴백 규칙:

1. 폴백은 CapabilityRegistry의 probe 결과와 런타임 오류 이벤트로만 트리거한다. 사용자 기능은 숨기지 않는다 (V11 §8 — 불안정 구간만 다른 Provider로 라우팅).
2. 각 폴백 전환은 CommandJournal에 기록해 soak·fault-injection 시험에서 재현 가능해야 한다.
3. 폴백 경로도 동일 IR을 소비하므로, 시각 차이는 pixel diff 허용치 내여야 한다 — 초과 시 릴리스 블로커.

## 5. 1차 구현 범위 요약

| 포함 (실코드) | 제외 (후보 유지) |
| --- | --- |
| CanvasKit 주 Surface + 래스터·마스크·필터·Paragraph | Vello Classic/Hybrid 인터랙티브 island |
| vello_cpu 0.2.0 wasm-pack Worker (golden·export·복구) | Glifo glyph atlas |
| Kurbo PathIR 어댑터, Peniko PaintIR 매핑 | ThorVG 런타임 asset island |
| resvg+tiny-skia 벤치·golden 기준 (하니스 자산) | vello_svg+Velato scene 직결 |
| ToonGpuExtensions 최소 composite/interop pass | ToonWet 등 고급 자체 pass |
