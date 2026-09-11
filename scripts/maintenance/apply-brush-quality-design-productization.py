from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


required_markers: dict[str, tuple[str, ...]] = {
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-catalog.ts": (
        "STUDIO_BRUSH_QUALITY_DESIGNS",
        "studioBrushQualityDesignGroups",
        '"rainbow", "레인보우 플로우"',
    ),
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.ts": (
        "STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS",
        "attachStudioBrushQualityDesignAliases",
        '"palette-knife": "palette-knife-edge"',
    ),
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.test.ts": (
        "STUDIO_BRUSH_QUALITY_DESIGN_COUNT",
        "filterStudioBrushCatalogItems",
        "without inventing new persisted catalogue ids",
    ),
    "apps/web/src/domains/creator/brush/studio-brush-catalog.ts": (
        "attachStudioBrushQualityDesignAliases",
        "STUDIO_REGISTERED_BRUSH_CATALOG_ITEMS",
    ),
    "apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality-catalog.ts": (
        "STUDIO_BRUSH_QUALITY_DESIGNS",
        "Compatibility facade for the V5 quality workbench",
    ),
    "apps/web/src/domains/creator/brush-lab/StudioBrushLegacyCataloguePanel.tsx": (
        "studioBrushQualityDesignProductId",
        "data-studio-brush-quality-product-target",
        "일반 브러시 ·",
    ),
    "docs/rewrite/brush-quality-design-productization-20260912.md": (
        "정본 설계 택소노미",
        "등록된 제품 카탈로그 ID 수는 변하지 않는다",
    ),
}

for path, markers in required_markers.items():
    content = read(path)
    missing = [marker for marker in markers if marker not in content]
    if missing:
        raise RuntimeError(f"{path}: missing productization markers: {missing}")

selection_path = "apps/web/src/domains/creator/brush/studio-brush-selection.ts"
selection = read(selection_path)
old_comment = " * One fail-closed selector for the complete 234-tool catalogue."
new_comment = " * One fail-closed selector for the complete registered product catalogue."
if old_comment in selection:
    write(selection_path, selection.replace(old_comment, new_comment, 1))
elif new_comment not in selection:
    raise RuntimeError("studio-brush-selection catalogue contract comment drifted")

print("Validated staged Brush Studio 72-design productization sources.")
