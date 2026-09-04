#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src/domains/creator/vrm/studio-vrm-component-psd-export-job.ts"


def replace_once(old: str, new: str) -> None:
    source = MODULE.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match, found {count}: {old[:120]!r}")
    MODULE.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    '''function passFromCapture(\n''',
    '''function expectedRgbaBytes(scene: StudioVrmLinkedSceneDescriptor): number {\n  for (const [key, value] of [["width", scene.width], ["height", scene.height]] as const) {\n    if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) {\n      throw new Error(`scene.${key} must be a safe integer between 1 and 16384`);\n    }\n  }\n  const pixels = scene.width * scene.height;\n  if (pixels > 67_108_864) throw new Error("linked render dimensions exceed the 64-megapixel safety budget");\n  return pixels * 4;\n}\n\nfunction passFromCapture(\n''',
)
replace_once(
    '''  const signal = input.signal ?? new AbortController().signal;\n  throwIfAborted(signal);\n  emit(input.onProgress, { phase: "planning", completed: 0, total: 0 });\n\n  const plan = buildStudioVrmComponentCapturePlan(input.renderables);\n''',
    '''  const signal = input.signal ?? new AbortController().signal;\n  throwIfAborted(signal);\n  const expectedBytes = expectedRgbaBytes(input.scene);\n  emit(input.onProgress, { phase: "planning", completed: 0, total: 0 });\n\n  const plan = buildStudioVrmComponentCapturePlan(input.renderables);\n''',
)
replace_once(
    '''  if (plan.requiresReview && input.allowReviewedAmbiguity !== true) {\n    const preview = plan.unclassifiedRenderableIds.slice(0, 5).join(", ");\n    throw new Error(\n      `VRM component classification requires review before PSD export${preview ? `: ${preview}` : ""}`,\n    );\n  }\n''',
    '''  if (plan.requiresReview && input.allowReviewedAmbiguity !== true) {\n    const reviewIds = plan.classifications\n      .filter(({ confidence }) => confidence === "weak" || confidence === "unclassified")\n      .slice(0, 5)\n      .map(({ renderableId }) => renderableId)\n      .join(", ");\n    throw new Error(\n      `VRM component classification requires review before PSD export${reviewIds ? `: ${reviewIds}` : ""}`,\n    );\n  }\n''',
)
replace_once(
    '''    if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) {\n      throw new Error(`capture provider returned an invalid RGBA buffer for ${request.id}`);\n    }\n    passes.push(passFromCapture(request, input.scene, rgba));\n''',
    '''    if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) {\n      throw new Error(`capture provider returned an invalid RGBA buffer for ${request.id}`);\n    }\n    if (rgba.byteLength !== expectedBytes) {\n      throw new Error(\n        `capture provider must return exactly ${expectedBytes} RGBA bytes for ${request.id}`,\n      );\n    }\n    passes.push(passFromCapture(request, input.scene, rgba));\n''',
)

source = MODULE.read_text(encoding="utf-8")
for marker in (
    "function expectedRgbaBytes",
    "const expectedBytes = expectedRgbaBytes(input.scene)",
    "rgba.byteLength !== expectedBytes",
):
    if marker not in source:
        raise RuntimeError(f"missing component export hardening marker: {marker}")

print("Hardened component PSD export dimensions, review reporting, and per-pass byte validation")
