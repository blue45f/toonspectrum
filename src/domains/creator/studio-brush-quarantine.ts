/**
 * V17.1 quarantine ledger — picker-exposure removal for presets the owner judged low-quality or
 * de-facto duplicates AFTER an in-group alternative was verified (사용자 지시: 그룹 내 대안이 있는
 * 저품질/중복만 제거하되, 제거가 기존 문서를 깨서는 절대 안 된다).
 *
 * Deliberately a leaf module with ZERO imports. The lazy catalogue boundary
 * (`studio-brush-catalog.ts`) filters its default listing on this set while the governance
 * manifest (`studio-brush-variant-group-manifest.ts`) re-exports it as the `quarantined`
 * lifecycle stage and fail-fasts when an entry loses its catalogue row or runtime contract.
 * Keeping the data here breaks the would-be cycle catalogue → manifest → catalogue.
 *
 * Quarantine removes EXPOSURE only (`USED_PRESET_DATA_PRESERVED`):
 * - persisted strokes keep replaying byte-identically — the id stays in `BRUSH_PRESETS`, keeps
 *   its full runtime contract, and must never converge to the pen safe-fallback (지침 3),
 * - `studioBrushCatalogItemById` keeps resolving the id for saved documents and favorites,
 * - no "숨김 포함" affordance exists today, so quarantined ids simply do not appear in any
 *   picker listing or search until they are delisted here.
 */

/**
 * One-line, owner-auditable reason per quarantined preset id — an entry without a reason is a
 * governance bug, so the id list itself is derived from this record.
 */
export const STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID: Readonly<Record<string, string>> =
  Object.freeze({
    // 2026-08-13 wave 3, workstream M §2 duplicate audit: the lane row declares engineVariant
    // "star-dust", but both durable renderers (StudioDrawNode / studio-svg-export) branch glitter
    // modes by exact id string, so this id actually paints the DEFAULT glitter mode — the lane
    // label is not real at paint time (지침 6 honesty) and the preset is a de-facto glitter
    // duplicate. Canvas and SVG agree with each other, so replay stays consistent (지침 5).
    // Reinstatement path: make the glitter dispatch honour the lane's declared engineVariant
    // behind an explicit program pin (지침 4 byte-identity), then delist the id here.
    // 2026-08-14 브러시 품질 웨이브: 이 프리셋은 카탈로그에 preview "soft"(연속 캐리어)로 선언돼
    // 있고 spacingRatio 0.08 / hardness 0.04 로 촘촘히 겹치도록 저작됐는데, 실측은 그 선언과
    // 어긋납니다 — long-route 품질 계측에서 edgePeriodicityScore 0.85, edgePeriodPx 7 로 눈에
    // 보이는 주기적 능선이 남습니다(전체 164개 중 실패 2건에 포함). 같은 stamp family 의
    // pencil--stamp-grain·watercolor--edge-stamp·gouache--flat-stamp 와 같은 airbrush 계열의
    // spray--equal-area·splatter--burst-cloud·ink-particle--scatter-cloud 는 모두 동일 기준을
    // 통과하므로 그룹 내 대안이 충분합니다(지침: 품질이 안 나오고 대체 브러시군이 있으면 제거).
    // 복귀 경로: 스탬프 간격이 저작값대로 적용되도록 고쳐 edgePeriodicity 가 연속 기준을 통과하면
    // 여기서 delist 합니다. 그때까지 저장된 문서는 계속 원래대로 재생됩니다.
    "airbrush--stamp-soft":
      "preview \"soft\"(연속)로 선언됐지만 실측 edgePeriodicityScore 0.85 · period 7px 로 주기적 "
      + "능선이 보이는 품질 미달 — 같은 family 의 통과 대안이 다수 존재(지침 6).",
    "glitter--star-field":
      "선언된 engineVariant(star-dust)가 페인트 시점에 실재하지 않아 기본 glitter 모드로 그려지는 "
      + "사실상 중복 — 실제 star-dust 모드를 가진 star-dust와 기본 glitter가 그룹 내 대안(지침 6).",
    // 2026-08-16 wave 4 duplicate confirm: 아래 두 프리셋은 레인 카탈로그에서 각각
    // engineVariant/profile 변형("side-shade" · causal-ink "round")을 선언하지만, 레인
    // 카탈로그(선언)와 아이콘 매핑(studio-brush-icons.ts) 밖에서 이 id·변형으로 분기하는 렌더러가
    // 하나도 없습니다(grep 근거). 그래서 페인트 시점에는 베이스 매체를 그대로 칠합니다 — 선언과
    // 실재가 어긋나는 정직성 위반(지침 6)이자 사실상 중복입니다.
    // 실측(tests/benchmarks/results/brush-duplicate-confirm.json, 폭 정규화 후 5개 서브픽셀
    // 시프트 최적 정합의 픽셀 |차이| p95): pencil--side-shade↔pencil 0.00000,
    // gpen--causal-round↔gpen--croquis-capsule 0.00014. 두 프리셋은 각각 pencil-path 와
    // causal-ink 캐리어에 있어, angled-nib 캐리어에 최근 들어온 압력 변경과 무관합니다.
    // (marker--chisel-ribbon 은 같은 감사에서 후보였지만 제외했습니다 — angled-nib 캐리어가
    // 스트로크 내부까지 압력을 전달하게 바뀐 뒤 base brush 와 육안으로 구분되므로 그 중복 근거는
    // 더 이상 참이 아니고, 남은 문제는 "압력 모델 미채택"이라 옵트인이 해법입니다.)
    // 복귀 경로: 선언한 변형을 렌더러가 실제로 분기해 베이스와 다른 그림을 그리게 만든 뒤
    // (지침 4 byte-identity 핀 포함) 여기서 delist 합니다. 그때까지 저장된 문서는 원래대로 재생됩니다.
    // 2026-08-16, RETRACTED: pencil--side-shade was quarantined here as a de-facto duplicate of
    // pencil on a measured p95 of 0.00000, and that measurement was wrong. The duplicate probe
    // built its elements without the pins the app applies at pointer-down — brushDynamics, the
    // draw mode and materialPressureModel — so studio-svg-export stripped them and BOTH brushes
    // were compared on the pre-rollout fixed-width route that no artist can reach. Re-measured
    // with the pins in place, the pair is not a duplicate candidate at all: its nearest surviving
    // candidate is web-pressure-flat at p95 0.53074. Delisting a brush for a resemblance it does
    // not have is worse than leaving a weak variant listed, so it is listed again.
    "gpen--causal-round":
      "causal-ink \"round\" 프로파일 변형을 선언하지만 분기하는 렌더러가 없어 같은 레인의 "
      + "gpen--croquis-capsule 과 같은 그림 — 폭 정규화 픽셀 p95 0.00014. 그룹 내 대안 gpen · "
      + "gpen--croquis-capsule 이 노출 상태(지침 6).",
  });

/** Frozen quarantine set consumed by the catalogue listing filter and the lifecycle resolver. */
export const STUDIO_BRUSH_QUARANTINED_PRESET_IDS: readonly string[] = Object.freeze(
  Object.keys(STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID),
);

const QUARANTINED_PRESET_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_BRUSH_QUARANTINED_PRESET_IDS,
);

export function isStudioBrushQuarantinedPresetId(brushId: unknown): boolean {
  return typeof brushId === "string" && QUARANTINED_PRESET_ID_SET.has(brushId);
}
