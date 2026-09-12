import {
  STUDIO_BRUSH_QUALITY_ENGINE_PINS,
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  type StudioBrushQualityMedium,
} from "../brush/studio-brush-quality-portfolio";

import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

const GROUP_BY_MEDIUM: Readonly<Record<StudioBrushQualityMedium, string>> =
  Object.freeze({
    ink: "선화·잉크",
    marker: "마커·형광펜",
    pencil: "연필·목탄·건식",
    watercolor: "수채·수묵·과슈",
    oil: "유화·페인트",
    airbrush: "에어·입자·FX",
    pastel: "연필·목탄·건식",
    tone: "톤·패턴·텍스처",
    fx: "에어·입자·FX",
    texture: "톤·패턴·텍스처",
    eraser: "지우개",
  });

/**
 * The Brush Editor catalogue uses the same 48 product representatives as the normal picker.
 * No separate 72-design vocabulary or migration layer exists.
 */
export const BRUSH_QUALITY_CATALOG: readonly BrushCatalogEntry[] =
  Object.freeze(
    STUDIO_BRUSH_QUALITY_PORTFOLIO.map((entry) => {
      const pin = STUDIO_BRUSH_QUALITY_ENGINE_PINS[entry.enginePin];
      return Object.freeze({
        id: entry.id,
        group: GROUP_BY_MEDIUM[entry.medium],
        name: entry.label,
        signature: entry.distinctness,
        engine: `${pin.liveBackend} → ${pin.commitBackend}`,
        quick: entry.tier === "essential",
      });
    }),
  );

export function brushQualityCatalogGroups(): readonly string[] {
  return Object.freeze([
    ...new Set(BRUSH_QUALITY_CATALOG.map((entry) => entry.group)),
  ]);
}
