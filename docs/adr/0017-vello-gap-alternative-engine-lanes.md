# ADR 0017 — Vello 미지원 기능의 대안 차세대 엔진 레인과 Graphite 챌린저 정책

## 상태

수정 승인 (2026-08-31, 자동·강제 런타임 폴백 금지 정책 반영)

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
   contract에서 갭 목록을 유도하고, 명시적으로 계획할 수 있는
   `skia-canvaskit-gpu` 완성 레인, `skia-graphite-webgpu` 챌린저, 그리고 런타임 비소유
   `skia-canvaskit` CPU 참조 레인의 존재와 실제 capability token을 검증한다. 이 목록은
   순차 실행 체인이 아니다. 앱의 shipped universe(`STUDIO_KNOWN_ENGINE_DESCRIPTORS`)에 세 id가
   모두 존재해야 하며, 갭 기능을 Skia 계약이 완성하지 못하면 빌드가 실패한다
   (`src/domains/creator/studio-engine-gap-coverage.test.ts`).
2. **Graphite 적극 채택 = 명시적 챌린저 계획 + 실패 폐쇄**: Graphite는 experimental
   챌린저로 shipped universe에 등재하고 토너먼트 품질 게이트를 통과한 뒤에만 새 실행 계획의
   provider가 될 수 있다. 이미 선택된 Graphite provider가 초기화·실행·device-loss로 실패하면
   그 island는 `unavailable`로 닫히며 CanvasKit WebGL/CPU로 전환하지 않는다. 다른 provider를
   쓰려면 사용자의 명시적 선택 또는 새 문서/세션 계획이 필요하다.
3. **활성화 한 단계화**: `packages/studio-engine-skia/src/graphite-probe.ts`가 기기(WebGPU)와
   빌드(Graphite CanvasKit 아티팩트 등록 여부)를 프로브해 `adoptable / missing-artifact /
   no-webgpu`를 정직하게 답한다. 오늘의 차단 요인은 업스트림 아티팩트 부재이며, 아티팩트가
   등록되는 순간 프로브가 adoptable로 바뀌어 토너먼트 편입이 한 단계가 된다. 존재하지 않는
   로더를 미리 꾸며내는 것(placeholder claim)은 디스크립터 모듈 규칙대로 금지한다.
4. **Forma 불채택 기록**: 아카이브된 엔진은 후보 서베이(E01–E28)나 런타임 레인에 추가하지
   않는다. 본 ADR이 평가 기록이다.

## 근거

- ADR 0003(표면당 주인 하나)의 소유권 규칙과 정합한다. ADR 0010/기존 0017의 자동 폴백
  조항은 본 수정 결정으로 대체한다. 활성화 증거는 대체 provider 성공이 아니라 같은 provider의
  `failureIsolation.behavior = fail-closed`와 fault-injection 전 범위 격리를 검증한다.
- 참조: [Vello 저장소](https://github.com/linebender/vello),
  [google/forma (아카이브)](https://github.com/google/forma),
  [Skia Graphite/Dawn WebGPU context](https://skia.googlesource.com/skia/+/refs/heads/main/include/gpu/graphite/dawn/DawnBackendContext.h),
  [Skia release notes](https://github.com/google/skia/blob/main/RELEASE_NOTES.md),
  [CanvasKit](https://skia.org/docs/user/modules/canvaskit/),
  [CanvasKit changelog](https://github.com/google/skia/blob/main/modules/canvaskit/CHANGELOG.md).

## 결과

- 갭 기능이 대안 엔진을 잃으면 조용한 드롭 대신 테스트 실패로 드러난다.
- Graphite 채택 준비가 코드로 존재하고(프로브·명시적 계획·테스트), 아티팩트 등장 시 활성화
  비용이 최소화된다. 불안정 시 현재 작업은 명시적 오류로 닫히며 엔진은 자동 교체되지 않는다.
- `ProviderDescriptor`, planner/FrameGraph IR, activation evidence 어디에도 런타임 fallback provider
  또는 chain을 표현하는 필드가 없다. legacy 필드는 strict schema가 거부한다.
- 죽은 엔진(Forma)이 서베이·런타임을 오염시키지 않는다.

## 재검토 조건

- Skia가 Graphite 웹 아티팩트(또는 Graphite CanvasKit 빌드)를 공식 배포할 때 — 즉시
  `registerSkiaGraphiteArtifact` 배선과 토너먼트 편입 검토.
- 업스트림 Vello가 blur/필터 그래프 또는 문단 텍스트를 안정 지원할 때 — 갭 목록 축소 검토.
- Vello Hybrid의 backdrop blend / path-effect 지원이 상륙할 때 — 영구 Skia 레인 재평가.
