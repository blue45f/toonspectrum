#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:100]!r}")
    write(relative, source.replace(old, new, 1))


repo = "src/domains/creator/studio-floating-surface-preferences-sqlite.ts"
replace_once(
    repo,
    '''import {
  encodeStudioFloatingSurfaceLayout,
  normalizeStudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";''',
    '''import {
  normalizeStudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";''',
)
replace_once(
    repo,
    '''function storageKey(surfaceId: string): string {
  return `surface:${surfaceId}`;
}
''',
    '''function storageKey(surfaceId: string): string {
  return `surface:${surfaceId}`;
}

function encodeStudioFloatingSurfaceLayout(
  layout: StudioFloatingSurfaceLayout,
): string {
  const normalized = normalizeStudioFloatingSurfaceLayout(layout);
  return JSON.stringify({
    version: normalized.version,
    xRatio: normalized.xRatio,
    yRatio: normalized.yRatio,
    width: normalized.width,
    height: normalized.height,
    dock: normalized.dock,
    positionLocked: normalized.positionLocked,
    sizeLocked: normalized.sizeLocked,
  });
}
''',
)

page = "src/domains/creator/StudioPageReviewPanel.tsx"
replace_once(
    page,
    '''export const DEFAULT_STUDIO_PAGE_REVIEW_FLOATING_LAYOUT = Object.freeze({
  version: 1 as const,
  xRatio: 0.86,
  yRatio: 0.08,
  width: 760,
  height: 720,
});''',
    '''const DEFAULT_STUDIO_PAGE_REVIEW_FLOATING_LAYOUT = Object.freeze({
  version: 2 as const,
  xRatio: 0.86,
  yRatio: 0.08,
  width: 760,
  height: 720,
  dock: "right" as const,
  positionLocked: false,
  sizeLocked: false,
});''',
)
replace_once(page, "    enabled: open,", "    enabled: open && !isMobile,")

animatic = "src/domains/creator/StudioAnimaticTimelineDialog.tsx"
replace_once(
    animatic,
    '''export const DEFAULT_STUDIO_ANIMATIC_FLOATING_LAYOUT = Object.freeze({
  version: 1 as const,
  xRatio: 0.5,
  yRatio: 1,
  width: 1_100,
  height: 480,
  dock: "bottom" as const,
});''',
    '''const DEFAULT_STUDIO_ANIMATIC_FLOATING_LAYOUT = Object.freeze({
  version: 2 as const,
  xRatio: 0.5,
  yRatio: 1,
  width: 1_100,
  height: 480,
  dock: "bottom" as const,
  positionLocked: false,
  sizeLocked: false,
});''',
)
replace_once(
    animatic,
    "export function studioAnimaticFloatingSurfaceId",
    "function studioAnimaticFloatingSurfaceId",
)
replace_once(animatic, '        allowedDockEdges={["left", "right", "bottom"]}\n', "")
replace_once(
    animatic,
    '''          "data-studio-animatic-presentation": "desktop",
          "data-studio-shortcut-boundary": "true",''',
    '''          "data-studio-animatic-presentation": "desktop",
          "data-dock-edge": layout.dock,
          "data-studio-shortcut-boundary": "true",''',
)

repo_test = "src/domains/creator/studio-floating-surface-preferences-sqlite.test.ts"
replace_once(
    repo_test,
    '''const FALLBACK = Object.freeze({
  version: 1 as const,
  xRatio: 1,
  yRatio: 0,
  width: 336,
  height: 720,
});''',
    '''const FALLBACK = Object.freeze({
  version: 2 as const,
  xRatio: 1,
  yRatio: 0,
  width: 336,
  height: 720,
  dock: "free" as const,
  positionLocked: false,
  sizeLocked: false,
});''',
)
replace_once(
    repo_test,
    '''      "height",
      "dock",
    ]);''',
    '''      "height",
      "dock",
      "positionLocked",
      "sizeLocked",
    ]);''',
)

for relative in (
    repo,
    page,
    animatic,
    repo_test,
    "src/domains/creator/use-studio-floating-surface-layout.ts",
    "src/domains/creator/StudioPageReviewPanel.test.tsx",
    "src/domains/creator/StudioAnimaticTimelineDialog.test.tsx",
):
    source = read(relative)
    if "version: 1 as const" in source:
        raise RuntimeError(f"stale v1 floating layout remains in {relative}")

print("Adapted persistent workspace surfaces to the current v2 floating-window contract")
