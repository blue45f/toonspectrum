/** Editorial starting points; never hardware, comfort or accessibility certification. */
import type { SpatialStoryboardPlan, SpatialStoryboardSettings } from "./studio-bg3d-spatial-storyboard";

export interface SpatialAuthoringPreset {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly settings: Readonly<Omit<SpatialStoryboardSettings, "direction">>;
}
export const SPATIAL_AUTHORING_PRESETS: readonly SpatialAuthoringPreset[] = Object.freeze([
  { id: "portrait", label: "세로 원고 집중", hint: "세로 컷을 한 장씩 비교하는 배치 시작점",
    settings: { layout: "focus", distanceMeters: 2, panelWidthMeters: 0.8, aspectRatio: 0.6, gapMeters: 0.12, eyeHeightMeters: 1.4, maxArcDegrees: 80 } },
  { id: "seated", label: "낮은 시점 콘티", hint: "컷 중심을 낮춘 곡면 배치. 실제 관람 자세에서 다시 확인하세요.",
    settings: { layout: "arc", distanceMeters: 2, panelWidthMeters: 0.65, aspectRatio: 4 / 3, gapMeters: 0.1, eyeHeightMeters: 1.15, maxArcDegrees: 80 } },
  { id: "gallery", label: "가로 컷 전시", hint: "가로 컷을 같은 평면에 놓는 전시형 배치 시작점",
    settings: { layout: "wall", distanceMeters: 2.5, panelWidthMeters: 0.9, aspectRatio: 16 / 9, gapMeters: 0.18, eyeHeightMeters: 1.5, maxArcDegrees: 100 } },
  { id: "comparison", label: "정방형 컷 비교", hint: "정방형 컷의 구도와 대사를 나란히 비교하는 배치 시작점",
    settings: { layout: "wall", distanceMeters: 1.8, panelWidthMeters: 0.75, aspectRatio: 1, gapMeters: 0.15, eyeHeightMeters: 1.4, maxArcDegrees: 70 } },
].map((preset) => Object.freeze({ ...preset, settings: Object.freeze(preset.settings) })) as SpatialAuthoringPreset[]);

/** Reading direction belongs to the project, not to a layout preset. */
export function spatialAuthoringPresetId(settings: SpatialStoryboardSettings): string | null {
  return SPATIAL_AUTHORING_PRESETS.find((preset) =>
    (Object.keys(preset.settings) as (keyof SpatialAuthoringPreset["settings"])[])
      .every((key) => preset.settings[key] === settings[key]))?.id ?? null;
}

/** Center-panel angles only: not a headset field of view or a text-legibility prediction. */
export function spatialAuthoringMetrics(plan: SpatialStoryboardPlan) {
  const { panelWidthMeters: width, aspectRatio, distanceMeters: distance } = plan.settings;
  const angle = (size: number) => Math.round(2 * Math.atan(size / (2 * distance)) * 1800 / Math.PI) / 10;
  const counts = new Map<number, number>();
  for (const panel of plan.panels) counts.set(panel.page, (counts.get(panel.page) ?? 0) + 1);
  return {
    horizontalDegrees: angle(width), verticalDegrees: angle(width / aspectRatio),
    maxPanelsPerPage: Math.max(0, ...counts.values()),
    pageCount: plan.pageCount, panelCount: plan.panels.length,
  };
}

function csvCell(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  // Quote delimiters/newlines and neutralize spreadsheet formulas even after leading whitespace.
  const safe = (/^\s*[=+@-]/u.test(value) ? "'" : "") + value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** A human-review shot list. No model bytes, camera poses, room scans or executable formulas. */
export function serializeSpatialStoryboardCsv(plan: SpatialStoryboardPlan): string {
  const header = ["order", "page", "shot_id", "label", "x_m", "y_m", "z_m", "yaw_deg", "width_m", "height_m"];
  const rows = plan.panels.slice(0, 96).map((panel) => [
    panel.order, panel.page + 1, panel.shotId, panel.label, ...panel.position,
    panel.yawDegrees, panel.widthMeters, panel.heightMeters,
  ].map(csvCell).join(","));
  return `\uFEFF${header.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}
