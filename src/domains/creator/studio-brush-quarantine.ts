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
    "glitter--star-field":
      "선언된 engineVariant(star-dust)가 페인트 시점에 실재하지 않아 기본 glitter 모드로 그려지는 "
      + "사실상 중복 — 실제 star-dust 모드를 가진 star-dust와 기본 glitter가 그룹 내 대안(지침 6).",
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
