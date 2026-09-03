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
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:140]!r}")
    write(relative, source.replace(old, new, 1))


WORKSHOP = "src/domains/creator/scene-3d/StudioShaperPanel.tsx"
replace_once(
    WORKSHOP,
    "  const fallback = DEFAULT_COMPLETE_PARAMS[control.key];",
    "  const fallback = DEFAULT_COMPLETE_PARAMS[control.key] ?? 1;",
)
replace_once(
    WORKSHOP,
    '                onClick={() => onNavigateToTab?.(activeCategory === "body" ? "body" : "body")}',
    '                onClick={() => onNavigateToTab?.("body")}',
)

POSER = "src/domains/creator/scene-3d/StudioMannequinPoserPanel.tsx"
replace_once(
    POSER,
    '      applyPosePreset("neutral");',
    '      applyPosePreset("stand");',
)

# The semantic capture path must always restore product materials after the ID pass. The existing
# selection-tint authority owns that restoration; pin the exact marker before verification.
scene = read("src/domains/creator/scene-3d/studio-mannequin-scene.ts")
for marker in [
    "captureSemanticLayers(",
    "partitionStudioMannequinSemanticLayers({",
    "restoreCaptureGraph(previousSelection)",
    "semanticIdMaterials.clear()",
]:
    if marker not in scene:
        raise RuntimeError(f"semantic capture marker is missing: {marker}")

panel = read(WORKSHOP)
for stale in [
    "3D 셰이퍼 (Webtoon Shaper)",
    "NAVER WEBTOON",
    "cosine",
    "켜짐 (Active)",
]:
    if stale in panel:
        raise RuntimeError(f"stale misleading product copy remains: {stale}")

for marker in [
    "6/14 슬롯 적용",
    "실제 장면 연동",
    "부위 레이어 PSD 내려받기",
    "가짜 토글을 제공하지 않습니다",
]:
    if marker not in panel:
        raise RuntimeError(f"workshop product marker is missing: {marker}")

print("Finalized character workshop integration contracts.")
