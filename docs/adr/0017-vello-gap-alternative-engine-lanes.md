# ADR 0017 — Vello 미지원 기능의 대안 차세대 엔진 레인과 Graphite 챌린저 정책

## 상태

승인 (2026-08-29, 제품 오너 구두 지시 3건 반영)

## 맥락

제품 오너 지시(2026-08-29):
1. "Vello에서 지원하지 않는 기능들은 Google Forma 등 다른 차세대 엔진들도 고려해서 작업하라."
2. "Skia Graphite도 차세대급이면 모험으로 적용해 보고, 테스트에서 불안정하면 Skia로 교체하라."
3. "Skia Graphite도 적극적으로 사용하라."

V13 feature contract 기준 Vello 갭(Hybrid 레인조차 native/lowered로 소유하지 못하는 기능)은
`render.text.paragraph`(texture-island), `render.mask`(texture-island),
`render.filter.image`(texture-island), `render.blend.backdrop`(unsupported),
`render.path-effect`(unsupported) 5개다. 업스트림 Vello는 알파 단계로 블러·복합 필터 그래프를
미지원(패닉)한다. 라우팅 함수 `skiaMustCompleteFeature`는 "Vello가 소유"와 "아무도 소유하지
않음"을 모두 false로 답하므로, 갭 기능이 완성 레인을 잃어도 조용히 드롭될 수 있었다.

대안 차세대 엔진 조사(2026-08):

| 후보 | 판정 | 근거 |
| --- | --- | --- |
| Skia/CanvasKit (E01) | 지정 완성 레인 유지 | 생산 기준선. GPU island(`skia-canvaskit-gpu`)가 5개 갭 전부를 native로 완성. |
| Skia Graphite | 챌린저로 적극 채택 | WebGPU 네이티브 차세대 백엔드. 단, 업스트림이 2026-04 기준 프로덕션 비권장이고 `canvaskit-wasm` npm은 Ganesh 전용 — 로드할 웹 아티팩트가 아직 없다. |
| Google Forma | 채택 불가 | 업스트림 저장소가 2024-07 아카이브(읽기 전용). 실험 프로젝트 종료. CPU 병렬 래스터라이즈라는 본래 강점은 vello_cpu·resvg 기준 레인이 이미 담당. |
| ThorVG / resvg 등 | 기존 배치 유지 | 후보 서베이 E13/E15로 이미 편성. |

## 결정

1. **갭 커버리지 계약**: `packages/studio-engine-registry/src/capability-gap-plan.ts`가 feature
   contract에서 갭 목록을 유도하고, 갭마다 명명된 대안 엔진 체인
   (`skia-graphite-webgpu` 챌린저 → `skia-canvaskit-gpu` 완성 레인 → `skia-canvaskit` 기준선)의
   존재를 검증한다. 앱의 shipped universe(`STUDIO_KNOWN_ENGINE_DESCRIPTORS`)에 세 id가 모두
   존재해야 하며, 갭 기능을 Skia 계약이 완성하지 못하면 빌드가 실패한다
   (`src/domains/creator/studio-engine-gap-coverage.test.ts`).
2. **Graphite 적극 채택 = 챌린저 신분 + 자동 강등**: ADR 0010의 리스크 수용 구조를 그대로
   적용한다. Graphite는 experimental 챌린저로 shipped universe에 등재하고, 토너먼트 품질
   게이트를 통과해야만 승격하며, 쿼런틴·킬스위치 시 선언된 `fallbackProviderId` 체인으로
   자동 강등된다("불안정하면 Skia로 교체"는 수동 스왑이 아니라 디스크립터 계약이다).
3. **활성화 한 단계화**: `packages/studio-engine-skia/src/graphite-probe.ts`가 기기(WebGPU)와
   빌드(Graphite CanvasKit 아티팩트 등록 여부)를 프로브해 `adoptable / missing-artifact /
   no-webgpu`를 정직하게 답한다. 오늘의 차단 요인은 업스트림 아티팩트 부재이며, 아티팩트가
   등록되는 순간 프로브가 adoptable로 바뀌어 토너먼트 편입이 한 단계가 된다. 존재하지 않는
   로더를 미리 꾸며내는 것(placeholder claim)은 디스크립터 모듈 규칙대로 금지한다.
4. **Forma 불채택 기록**: 아카이브된 엔진은 후보 서베이(E01–E28)나 런타임 레인에 추가하지
   않는다. 본 ADR이 평가 기록이다.

## 근거

- ADR 0003(표면당 주인 하나), ADR 0004(CanvasKit 기준선), ADR 0010(품질 게이트+폴백+프로브
  3조건 채택)과 정합. 갭 커버리지 계약은 0010의 (b) 폴백 체인 존재를 기계 검증으로 승격한 것.
- 참조: [Vello 저장소](https://github.com/linebender/vello),
  [google/forma (아카이브)](https://github.com/google/forma),
  [Skia Graphite 개요](https://deepwiki.com/google/skia/4-graphite:-next-generation-gpu-backend),
  [CanvasKit](https://skia.org/docs/user/modules/canvaskit/),
  [WebGPU/Skia 동향](https://shopify.engineering/webgpu-skia-web-graphics).

## 결과

- 갭 기능이 대안 엔진을 잃으면 조용한 드롭 대신 테스트 실패로 드러난다.
- Graphite 채택 준비가 코드로 존재하고(프로브·체인·테스트), 아티팩트 등장 시 활성화 비용이
  최소화된다. 불안정 시 교체는 자동이다.
- 죽은 엔진(Forma)이 서베이·런타임을 오염시키지 않는다.

## 재검토 조건

- Skia가 Graphite 웹 아티팩트(또는 Graphite CanvasKit 빌드)를 공식 배포할 때 — 즉시
  `registerSkiaGraphiteArtifact` 배선과 토너먼트 편입 검토.
- 업스트림 Vello가 blur/필터 그래프 또는 문단 텍스트를 안정 지원할 때 — 갭 목록 축소 검토.
- Vello Hybrid의 backdrop blend / path-effect 지원이 상륙할 때 — 영구 Skia 레인 재평가.
