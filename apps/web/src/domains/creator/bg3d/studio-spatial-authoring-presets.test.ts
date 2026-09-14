import { describe, expect, it } from "vitest";
import { buildSpatialStoryboardPlan, normalizeSpatialStoryboardSettings, SPATIAL_STORYBOARD_DEFAULTS } from "./studio-bg3d-spatial-storyboard";
import { SPATIAL_AUTHORING_PRESETS, serializeSpatialStoryboardCsv, spatialAuthoringMetrics, spatialAuthoringPresetId } from "./studio-spatial-authoring-presets";

const shots = Array.from({ length: 17 }, (_, index) => ({ id: `shot-${index}`, name: `장면 ${index + 1}` }));

describe("spatial authoring starting points", () => {
  it.each(SPATIAL_AUTHORING_PRESETS)("$id uses normalized dimensions without losing shots or direction", (preset) => {
    const settings = normalizeSpatialStoryboardSettings({ ...preset.settings, direction: "rtl" });
    expect(settings).toEqual({ ...preset.settings, direction: "rtl" });
    expect(spatialAuthoringPresetId(settings)).toBe(preset.id);
    const plan = buildSpatialStoryboardPlan(shots, settings);
    expect(plan.panels.map((panel) => panel.shotId)).toEqual(shots.map((shot) => shot.id));
    expect(plan.warnings).toEqual([]);
    expect(plan.settings.direction).toBe("rtl");
    expect(Object.isFrozen(preset.settings)).toBe(true);
  });
  it("marks manual changes as custom rather than claiming an unchanged preset", () => {
    const preset = SPATIAL_AUTHORING_PRESETS[0]!;
    expect(spatialAuthoringPresetId(normalizeSpatialStoryboardSettings({ ...preset.settings, distanceMeters: 3 }))).toBeNull();
    expect(new Set(SPATIAL_AUTHORING_PRESETS.map((preset) => preset.id)).size).toBe(4);
  });
  it("reports center-panel angles, reducing both angles at a greater distance", () => {
    const near = spatialAuthoringMetrics(buildSpatialStoryboardPlan(shots, { distanceMeters: 1 }));
    const far = spatialAuthoringMetrics(buildSpatialStoryboardPlan(shots, { distanceMeters: 3 }));
    expect(near.horizontalDegrees).toBeGreaterThan(far.horizontalDegrees);
    expect(near.verticalDegrees).toBeGreaterThan(far.verticalDegrees);
    expect(far.panelCount).toBe(17);
  });
  it("handles an empty plan without inventing a page", () => {
    expect(spatialAuthoringMetrics(buildSpatialStoryboardPlan([]))).toMatchObject({ maxPanelsPerPage: 0, pageCount: 0, panelCount: 0 });
  });
  it("counts focus pages and vertical angular height independently", () => {
    const plan = buildSpatialStoryboardPlan(shots, SPATIAL_AUTHORING_PRESETS[0]!.settings);
    const metrics = spatialAuthoringMetrics(plan);
    expect(metrics).toMatchObject({ pageCount: 17, maxPanelsPerPage: 1 });
    expect(metrics.verticalDegrees).toBeGreaterThan(metrics.horizontalDegrees);
  });
});

describe("spatial shot-list CSV", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)", " \t=HYPERLINK(1)", "\n=1"])("neutralizes formula label %j", (name) => {
    const plan = buildSpatialStoryboardPlan([{ id: "shot", name }]);
    const csv = serializeSpatialStoryboardCsv(plan);
    expect(csv).toContain(`"'${name.replaceAll('"', '""')}"`);
    expect(plan.panels[0]!.label).toBe(name);
  });
  it("quotes commas, quotes and newlines and keeps page numbers human-readable", () => {
    const plan = buildSpatialStoryboardPlan([{ id: "s", name: '장면, "안녕"\n다음 줄' }], { layout: "focus" });
    const csv = serializeSpatialStoryboardCsv(plan);
    expect(csv.startsWith("\uFEFForder,page,shot_id,label")).toBe(true);
    expect(csv).toContain('1,1,"s","장면, ""안녕""\n다음 줄"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("exports only editorial fields, never hidden scene data", () => {
    const plan = { ...buildSpatialStoryboardPlan(shots, SPATIAL_STORYBOARD_DEFAULTS), camera: "secret-camera", roomScan: "private-room" };
    expect(serializeSpatialStoryboardCsv(plan)).not.toMatch(/secret-camera|private-room/u);
  });
});
