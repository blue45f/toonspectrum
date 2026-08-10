# Filters 서브시스템 — 하이브리드 설계 (Hybrid Design)

- 기준일: 2026-08-07
- 권위 소스: V11 최종 아키텍처 §7(필터 아키텍처)·§7.3(EffectGraph 컴파일)·§9(성능 아키텍처), 배치매트릭스 E01·E16~E20
- 원칙: **Verified-first, Hybrid-by-strength, Evidence-driven Custom.** 필터는 "한 엔진의 기능 목록"이 아니라 **EffectGraphIR을 여러 Provider로 컴파일한 결과**다.

## 1. 단계별 파이프라인 (입력 → 처리 → 렌더 → 출력)

```text
[입력 단계]
LayerGraphIR 소스 (레이어/그룹/마스크/선택 영역)
+ EffectGraphIR (노드·파라미터·색공간 주석·seed)
+ ViewState (줌·가시 영역 → preview ROI)
        │
        ▼
[컴파일 단계]  EffectGraphCompiler
1. type / color-space validation        — ColorPipeline(E20) 계약 검사: working space는 linear
2. ROI / halo / temporal dependency     — dirty-rect에 필터별 halo(blur 반경 등) 팽창
3. Provider candidate discovery         — CapabilityRegistry에서 노드별 후보 열거
4. native-node grouping                 — 같은 Provider가 연속 처리 가능한 노드를 한 구간으로 융합
5. cross-provider copy cost 계산        — §9.2 우선순위(동일 GPU texture → … → CPU readback)로 비용 산정
6. preview graph / final graph 생성     — 아래 §2의 분리 규칙
7. cache / tile / cancellation plan     — 노드 출력 캐시 키(입력 해시+파라미터+provider version)
        │
        ▼
[처리 단계]  Provider 실행
- 분석 노드: OpenCV Worker (마스크·엣지·contour → mask tile)
- 실시간 노드: CanvasKit ImageFilter/RuntimeEffect (주 GPU 컨텍스트 내)
- 대형 노드: libvips Worker (demand-driven 타일 스트림)
- 창작/비파괴 노드: G'MIC / GEGL 격리 Provider (bridge 경계)
- 색 변환: ColorPipeline이 경계에서 1회 (skcms/LCMS/OCIO)
        │
        ▼
[렌더 단계]  주 Surface 합성
- 결과는 texture/tile island로 CanvasKit 주 컴포지터에 재주입
- hot path GPU→CPU readback 0회 (§9.1)
        │
        ▼
[출력 단계]
- 화면: display transform (OCIO) 적용 후 present
- 저장: EffectGraphIR + 노드 캐시(선택) — 엔진 객체는 저장하지 않음 (V11 §2.1)
- export: final graph 강제 실행 → libvips pyramid/batch → OCIO/LCMS export 변환 → encoder
```

## 2. Preview / Final 분리

| 구분 | Preview | Final |
| --- | --- | --- |
| 목적 | 슬라이더 조작 중 즉각 피드백 | 저장·export·"적용" 확정 품질 |
| 해상도 | 가시 ROI + 줌 적응 proxy (다운샘플 허용) | 문서 전체 또는 확정 ROI, 원본 해상도 |
| 주 Provider | CanvasKit ImageFilter/RuntimeEffect, 보조로 OpenCV 근사 | libvips(대형·기본 연산), G'MIC(창작), GEGL(비파괴 DAG) |
| 실행 위치 | 주 GPU 컨텍스트 (복사 비용 최소) | Worker / 격리 Provider (UI 비블로킹) |
| 결정성 요구 | 완화 (기기별 미세 차이 허용) | 엄격 (seed·스레드 고정, golden diff 대상) |
| 취소 | 프레임 단위 자동 폐기 | cancellation plan에 따라 타일 단위 취소 |

규칙:

1. **모든 EffectGraph 노드는 preview 구현을 반드시 갖는다.** final 전용 Provider(G'MIC/GEGL) 노드는 (a) 등록된 RuntimeEffect 근사 셰이더, (b) 저해상 proxy에 대한 실제 final 연산 실행, (c) 최소한 "저해상 스냅샷 + 진행 상태 배지" 중 하나를 preview로 제공한다.
2. preview와 final의 픽셀 diff는 노드 클래스별 예산을 가진다(→ `benchmark-plan.md` §4). 예산 초과 노드는 UI에 "미리보기 근사" 배지를 표시한다.
3. final 결과가 도착하면 preview 캐시를 원자적으로 교체한다(플리커 금지 — 타일 단위 스왑).
4. 같은 노드라도 문서·기기·품질 프로필에 따라 Provider가 달라질 수 있다(V11 §7.3의 Gaussian blur 예: 소반경 interactive는 CanvasKit, 대형 final은 libvips, 특수 bokeh는 custom/G'MIC).

## 3. Island 소유권

V11 §1.1 "한 Surface 또는 큰 Island에 주 소유자 하나" 원칙의 filters 적용:

```text
Main Canvas Surface           소유자: CanvasKit (주 컴포지터)
 ├─ Interactive Filter Pass   소유자: CanvasKit ImageFilter/RuntimeEffect — 같은 컨텍스트, island 아님
 ├─ Mask/Analysis Island      소유자: OpenCV Worker — 산출물은 mask tile(A8/RGBA8)로만 귀환
 ├─ Large-Final Island        소유자: libvips Worker — 산출물은 타일 스트림으로 귀환
 ├─ Creative-Final Island     소유자: G'MIC 격리 Provider — 산출물은 인코딩된 타일/이미지로 귀환
 ├─ NDE-Final Island          소유자: GEGL 격리 Provider — 산출물은 buffer 타일로 귀환
 └─ ColorPipeline (횡단 계층) 소유자: OCIO/LCMS/skcms — "경계에서만 1회 변환" 계약을 단독 소유
```

- Island 산출물은 항상 **중간 표현(타일·마스크·이미지)** 이고, 어떤 Island도 주 Surface에 직접 그리지 않는다.
- 엔진 전환은 노드(객체)별이 아니라 **Island(native-node group)별**로 일어난다(§9.1). 컴파일러의 native-node grouping이 경계 횟수를 최소화한다.
- 격리 Provider(G'MIC/GEGL)는 라이선스 경계이기도 하다 — Island 경계 = 프로세스/브리지 경계 = copyleft 격리 경계(→ `license-deployment.md`).
- 동일 기능 격리 Provider를 동시에 상주시키지 않는다. 사용 종료된 대형 WASM Worker는 종료해 메모리를 회수한다(§9.1).

## 4. 폴백 체인

CapabilityRegistry가 노드 클래스별로 폴백 체인을 선언하고, HybridExecutionPlanner가 실행 시점 가용성·기기 프로필에 따라 내려간다.

```text
[기본 연산 (blur·sharpen·color adjust)]
CanvasKit GPU (preview+소형 final)
→ libvips Worker (대형 final)
→ CanvasKit Software / Vello CPU 기준 경로 (GPU 상실 시)
→ OpenCV CPU 근사 (최후 — 결과에 degraded 마크)

[분석 연산 (마술봉·엣지·먼지 제거)]
OpenCV.js Worker
→ CanvasKit RuntimeEffect 근사 (간단 threshold 계열만)
→ 기능 비활성 + 안내 (분석 없이 실행 금지 — 잘못된 마스크로 원본 훼손 방지)

[창작 필터 (G'MIC recipe)]
G'MIC Local ToonBridge
→ G'MIC 서버 Provider (사용자 동의·파일 전송 정책 통과 시에만)
→ 저해상 proxy 결과 유지 + "final 대기" 상태 저장 (recipe와 파라미터는 EffectGraphIR에 보존되므로 나중에 재실행 가능)

[비파괴 DAG (GEGL chain)]
GEGL 격리 Provider
→ 동등 노드가 존재하면 libvips/OpenCV 조합으로 재컴파일 (컴파일러가 equivalence table 보유)
→ 저해상 proxy 유지 + "final 대기"

[색관리]
ColorPipeline (skcms/LCMS/OCIO)
→ 폴백 없음 — 색 변환 실패는 export 차단 사유. sRGB 무변환 통과는 명시적 사용자 선택으로만 허용
```

폴백 공통 규칙:

1. 폴백 실행 결과는 EffectGraph 노드 캐시에 **provider·version과 함께** 기록되어, 상위 Provider 복구 시 자동 재계산 대상이 된다.
2. 폴백으로 인한 품질 저하는 침묵하지 않는다 — 노드 상태 배지와 export 리포트에 표기한다.
3. 폴백 체인 전 구간이 fault-injection 테스트 대상이다(V11 §10.5, Phase 7).

## 5. ROI / Copy-cost 계약 (EffectGraphIR 컴파일 관점)

1. **ROI 전파**: 편집 dirty-rect는 그래프를 역방향으로 전파되며, 각 노드가 자신의 halo(예: blur 반경, displacement 최대 변위)만큼 요구 영역을 팽창시킨다. preview는 `가시 ROI ∩ 전파 ROI`만 계산한다.
2. **타일 계약**: Island 경계를 넘는 데이터는 고정 타일 규격(크기·픽셀 포맷·색공간 주석 포함 헤더)으로만 이동한다. libvips의 demand-driven 타일과 우리 타일 규격의 정합은 통합 검증 1번 항목이다.
3. **copy-cost 산정**: §9.2 우선순위를 비용 함수로 사용한다 — 동일 GPU texture(0) < encoded command/external texture < ImageBitmap/VideoFrame < SharedArrayBuffer tile < CPU readback+re-upload(최대). 컴파일러는 "경계 횟수 × 경계 단가 × 타일 바이트"를 최소화하는 grouping을 선택하고, **hot path의 CPU readback은 비용 무한대(금지)로 취급**한다.
4. **캐시 키**: `hash(입력 타일 해시, 노드 파라미터, provider id+version, seed, 색공간)`. provider 교체·버전 업이 자동으로 캐시를 무효화한다.
5. **temporal dependency**: 애니메이션 적용 필터는 프레임 간 의존(모션 블러류)을 노드 메타데이터로 선언해야 하며, 미선언 노드는 프레임 독립으로 간주해 병렬 실행한다.

## 6. 저장 의미

- 프로젝트 원본은 EffectGraphIR(노드·파라미터·seed·provider 힌트·recipe 스냅샷)이다. `GeglNode`·G'MIC 내부 상태·Skia 객체는 재생성 가능한 캐시로만 취급한다(V11 §2.1).
- G'MIC recipe 문자열과 GEGL chain 정의는 **버전 고정 스냅샷**으로 노드에 내장해, provider 업데이트가 과거 문서의 픽셀 결과를 바꾸지 않게 한다. 새 버전 적용은 명시적 마이그레이션 액션이다.
