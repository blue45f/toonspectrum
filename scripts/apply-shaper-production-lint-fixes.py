#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{path}: expected one replacement, found {count}: {old[:80]!r}"
        )
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


panel = "src/domains/creator/scene-3d/StudioShaperPanel.tsx"
replace_once(
    panel,
    '                  <div className="grid grid-cols-2 gap-2" role="list">',
    '                  <div className="grid grid-cols-2 gap-2">',
)
replace_once(panel, '                          role="listitem"\n', "")
replace_once(
    panel,
    '''            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-card px-3">
              <input
                type="checkbox"
                checked={transparentBackground}''',
    '''            <div className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-card px-3">
              <input
                type="checkbox"
                aria-label="투명 배경"
                checked={transparentBackground}''',
)
replace_once(
    panel,
    '''              </span>
            </label>

            <section className="rounded-xl border border-line bg-card p-3">''',
    '''              </span>
            </div>

            <section className="rounded-xl border border-line bg-card p-3">''',
)

preview = Path("src/domains/creator/scene-3d/StudioShaperPresetPreview.tsx")
preview_source = preview.read_text(encoding="utf-8")
for marker in (
    '  const tall = category === "body" && presetId === "body-tall";\n',
    "  const legBottom = tall ? 96 : 91;\n",
):
    if preview_source.count(marker) != 1:
        raise RuntimeError(
            f"StudioShaperPresetPreview: generated marker changed: {marker!r}"
        )
    preview_source = preview_source.replace(marker, "", 1)
preview.write_text(preview_source, encoding="utf-8")

panel_test = Path("src/domains/creator/scene-3d/StudioShaperPanel.test.tsx")
panel_test_source = panel_test.read_text(encoding="utf-8")
panel_test_source = panel_test_source.replace(
    'getByRole("listitem",',
    'getByRole("button",',
)
panel_test_source = panel_test_source.replace(
    'queryByRole("listitem",',
    'queryByRole("button",',
)
panel_test_source = panel_test_source.replace(
    '/내추럴 웨이브/u',
    '/풍성한 웨이브/u',
)
panel_test_source = panel_test_source.replace(
    '/둥근형/u',
    '/^둥근 동안형마네킹 실시간$/u',
)
panel_test_source = panel_test_source.replace(
    '/기본 계란형/u',
    '/^갸름한 달걀형마네킹 실시간$/u',
)
if (
    'getByRole("listitem",' in panel_test_source
    or 'queryByRole("listitem",' in panel_test_source
):
    raise RuntimeError("StudioShaperPanel tests still query interactive list items")
for stale in (
    '/내추럴 웨이브/u',
    '/둥근형/u',
    '/기본 계란형/u',
):
    if stale in panel_test_source:
        raise RuntimeError(
            f"StudioShaperPanel tests still use a stale or ambiguous label: {stale}"
        )
panel_test.write_text(panel_test_source, encoding="utf-8")

appearance_test = (
    "src/domains/creator/scene-3d/"
    "studio-shaper-mannequin-appearance-three.test.ts"
)
replace_once(
    appearance_test,
    '''import {
  resolveStudioMannequinShaperAppearance,
} from "./studio-shaper-production-model";
import { DEFAULT_SHAPER_SELECTION } from "./studio-shaper-model";''',
    '''import { DEFAULT_SHAPER_SELECTION } from "./studio-shaper-model";
import {
  resolveStudioMannequinShaperAppearance,
} from "./studio-shaper-production-model";''',
)

production_model = "src/domains/creator/scene-3d/studio-shaper-production-model.ts"
replace_once(
    production_model,
    "  let pose = normalizeStudioMannequinPose(input.currentPose);",
    "  // Appearance-only edits must not quantize or otherwise rewrite hand-authored pose values.\n  let pose = input.currentPose;",
)

production_model_test = (
    "src/domains/creator/scene-3d/studio-shaper-production-model.test.ts"
)
replace_once(
    production_model_test,
    '''import {
  createStudioMannequinRestPose,
  findStudioMannequinPosePreset,
} from "./studio-mannequin-poses";''',
    '''import {
  createStudioMannequinRestPose,
  findStudioMannequinPosePreset,
  normalizeStudioMannequinPose,
} from "./studio-mannequin-poses";''',
)
replace_once(
    production_model_test,
    '        eye: "eye-romance",',
    '        eye: "eye-gentle",',
)
replace_once(
    production_model_test,
    "    expect(plan.params.eyeScale).toBe(1.22);",
    "    expect(plan.params.eyeScale).toBe(1.12);",
)
replace_once(
    production_model_test,
    '''    expect(plan.pose.joints.leftUpperLeg).toEqual(run?.pose.joints.leftUpperLeg);
    expect(plan.pose.joints.rightLowerLeg).toEqual(run?.pose.joints.rightLowerLeg);
    expect(plan.pose.joints.rightUpperArm).toEqual(peace?.pose.joints.rightUpperArm);
    expect(plan.pose.pelvisOffset).toEqual(run?.pose.pelvisOffset);''',
    '''    const normalizedRun = normalizeStudioMannequinPose(
      run?.pose ?? createStudioMannequinRestPose(),
    );
    const normalizedPeace = normalizeStudioMannequinPose(
      peace?.pose ?? createStudioMannequinRestPose(),
    );
    expect(plan.pose.joints.leftUpperLeg).toEqual(normalizedRun.joints.leftUpperLeg);
    expect(plan.pose.joints.rightLowerLeg).toEqual(normalizedRun.joints.rightLowerLeg);
    expect(plan.pose.joints.rightUpperArm).toEqual(normalizedPeace.joints.rightUpperArm);
    expect(plan.pose.pelvisOffset).toEqual(normalizedRun.pelvisOffset);''',
)

host = "src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx"
replace_once(
    host,
    '''    sceneRef.current?.setShaperAppearance(
      resolveStudioMannequinShaperAppearance(shaperSelection),
    );''',
    '''    sceneRef.current?.setShaperAppearance?.(
      resolveStudioMannequinShaperAppearance(shaperSelection),
    );''',
)
replace_once(
    host,
    "    sceneRef.current?.setShaperAppearance(plan.appearance);",
    "    sceneRef.current?.setShaperAppearance?.(plan.appearance);",
)

print(
    "Applied generated accessibility, precision, legacy-handle, "
    "and regression corrections."
)
