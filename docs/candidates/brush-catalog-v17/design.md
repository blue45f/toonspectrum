# ToonStudio 브러시 카탈로그 대확장·다중 엔진 품질 선별 아키텍처 V17.1

- 기준일: 2026-08-12 (저장소 편입: 2026-08-13)
- 원본 설계 자산: `ToonStudio_V17.1_브러시_엔진별_후보카탈로그_1008.xlsx`
  → 이 디렉터리의 [candidate-catalog.json](./candidate-catalog.json)으로 축약 편입
  (후보 1,008종 = 변형그룹 126 × 변형 템플릿 8이므로 그룹+템플릿만으로 전량 재구성 가능)
- 저장소 실측 보정: 원문이 인용한 "226종"은 과거 수치다. 2026-08-13 기준 SSOT
  (`src/domains/creator/studio-brush-catalog-core.ts`)의 페인트 브러시는 **295종**
  (core 137 + pro 160 − eraser 2)이며, 카운트는 코드에서 파생된다.
- 신규 제안 후보 레시피: **1,008종** (Lab 파이프라인 대상; 이번 웨이브에서 코드 주입하지 않음)
- MyPaint/Hokusai stock exact-import 시험 풀: **196종** (188 green / 8 amber)
- 최상위 정책: **질감 우선(40%), 비동등 Provider 자동 폴백 금지, 검증된 외부 엔진 우선**
- 사용자 지시(2026-08-13): 엔진별 유사 브러시라도 조합에 따라 필기감이 다르면
  이름을 차별화해 **의도적으로 중복 유지**한다. 자체 제작 커널보다 검증된 브러시
  엔진/커널(libmypaint·Klecks·perfect-freehand·Google Ink·dli/paint·stable-fluids 계보)을 우선한다.

## 1. 선별 파이프라인

```text
대량 후보 확보
→ 자동 렌더·입력·저장 시험 (Bench)
→ 질감 중심 점수화 (가중치: 질감 40 / 동역학 15 / 가장자리 10 / 결정성 10 / 고유성 10 / 성능 10 / 편집성 5)
→ 유사 그룹 비교 (TextureSignature / BehaviorSignature)
→ Certified/Core 승격
→ 저품질·무차별 항목 격리(Quarantined) — 기존 문서 사용분은 Provider 고정으로 보존
```

노출 단계: `Lab → Experimental → Extended → Core` (+ `Quarantined/Removed`).
카탈로그 노출 제거 ≠ 기존 작품 데이터 삭제.

## 2. 이번 웨이브(2026-08-13)에서 코드로 착지한 것

| V17.1 요구 | 착지 |
|---|---|
| `BrushVariantGroup`·품질 영수증 데이터 모델 | `studio-brush-variant-group-manifest.ts` — 295종을 canonicalId·엔진레인·팩 카테고리 기준으로 파생 그룹화, 가중치 40/15/10/10/10/10/5 고정, 부분 영수증(bench/certified) 명시 |
| 검증 엔진 우선 확보 | 건식매체 검증 스탬프 레인(Klecks 초크·방향성 왁스·libmypaint 목탄 DNA), 수채 inkwash 행동 클린룸 재구현, 유화 dli/paint(MIT) 임파스토·libmypaint(ISC) 10밴드 WGM 안료 혼합 |
| 의도적 유사 변형 | 기존 dry-dynamic 변형과 신규 stamp 변형 공존(`crayon--klecks-stamp` 등, 이름 차별화) |
| 종이·팁·안료 축 | 매체별 종이 상호작용 프로파일(`studio-paper-media-profile-v1.ts`): 건식=peak-catch, 수채=valley-settle, 유화=weave-reveal |
| 전수 자동 시험 | `scripts/studio-brush-catalogue-perf-matrix.ts` — 295종 전수 계획 시간·프리즈 게이트, npm script 배선 |

## 3. 엔진별 확보 전략(요약)

- **Google Ink**: 전문 잉킹·캘리그래피 주요 후보. PoC 게이트 유지(ADR 참조), 후보 Provider.
- **Perfect Freehand / Kurbo / Lyon / Vello**: 모노라인·기술펜·가변 폭. Google Ink의 폴백이
  아니라 독립 질감·편집성의 별도 프리셋군.
- **libmypaint / Hokusai**: 196 stock 풀 전량 Lab 수용(188 green/8 amber 기록 유지).
- **Krita**: 행동 레퍼런스(GPL 코드 편입 금지, 레시피 재구현+Golden Corpus 비교).
- **p5.brush / Rough.js / Fabric / Atrament / Easy-Brush**: settled-only·절차·채움·장식 중심,
  질감 우수 프리셋만 승격.
- **유체·자연매체 물리(이번 웨이브 리서치 검증)**: PavelDoGreat WebGL-Fluid-Simulation(**MIT**),
  dli/paint(**MIT**), libmypaint(**ISC**)는 코드 포팅 가능. inkwash·Rebelle·MoXi는
  라이선스 부재/비공개 — **행동·파라미터만 클린룸 재구현**.
- **Open Brush / Three.js**: 3D/XR 브러시 팩은 2D 카탈로그와 분리 운영.

## 4. 데이터 모델·정책 원문

원문 V17.1의 `BrushRecipeIR`/`BrushQualityReceipt` 스키마, 유사 브러시 유지 기준,
제거 정책, 핵심 정책 플래그는 [candidate-catalog.json](./candidate-catalog.json)의
`qualityLifecycle`·`engineMatrix`와 함께 이 문서의 부록으로 유지한다.

```text
BRUSH_CATALOG_HARD_CAP=NONE
CANDIDATE_FIRST_THEN_PRUNE=TRUE
INTENTIONAL_SIMILAR_VARIANTS=TRUE
TEXTURE_FIDELITY_FIRST=TRUE
NON_EQUIVALENT_FALLBACK=FALSE
PROVIDER_VERSION_PINNING=TRUE
LOW_QUALITY_PRESETS_REMOVABLE=TRUE
USED_PRESET_DATA_PRESERVED=TRUE
```

## 5. 남은 로드맵(다음 웨이브)

1. MyPaint/Hokusai 196종 exact-import 시험을 Lab manifest로 등록
2. 1,008 후보 Recipe의 Lab 주입(그룹×템플릿 생성기)과 자동 Fidelity Lab
3. Google Ink 전문 잉킹 lane (PoC 게이트 해제 조건: ADR-0010 증거)
4. 수채/수묵 WebGPU 유체 레인 — Living Ink 재점등(페이지 단위 PNG 접힘 이슈 해소 전제,
   `studio-living-ink-brush-admission.ts` 참조) 또는 stable-fluids(MIT) 시드 신규 레인
5. vNext dry-media 전문화기의 비단위 불투명도(예: 0.72 파스텔 팩) 수용 — 현재
   unit-opacity만 admit되어 기본 불투명도 팩이 retained 폴백으로 내려간다
6. 외부 ABR/SUT/KPP/MYB 무제한 import (`packages/studio-format-gateway` 확장)
