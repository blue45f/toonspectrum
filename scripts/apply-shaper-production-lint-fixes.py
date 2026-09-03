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
if (
    'getByRole("listitem",' in panel_test_source
    or 'queryByRole("listitem",' in panel_test_source
):
    raise RuntimeError("StudioShaperPanel tests still query interactive list items")
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

print("Applied generated accessibility and lint corrections.")
