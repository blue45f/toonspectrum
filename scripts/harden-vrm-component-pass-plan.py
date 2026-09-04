#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src/domains/creator/vrm/studio-vrm-component-pass-plan.ts"


def replace_once(old: str, new: str) -> None:
    source = MODULE.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"expected one match, found {count}: {old[:120]!r}")
    MODULE.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    '''  if (!/^[\\p{L}\\p{N}][\\p{L}\\p{N}._:@/-]*$/u.test(resolved)) {\n''',
    '''  if (!/^[\\p{L}\\p{N}][\\p{L}\\p{N}._@-]*$/u.test(resolved)) {\n''',
)
replace_once(
    '''  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));\n  const [winner, score] = ranked[0] ?? ["unclassified", 0];\n  const runnerUp = ranked[1]?.[1] ?? 0;\n''',
    '''  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));\n  const winnerEntry = ranked[0];\n  if (!winnerEntry) {\n    return Object.freeze({\n      renderableId,\n      component: "unclassified",\n      confidence: "unclassified",\n      reason: "component token catalogue is empty",\n    });\n  }\n  const [winner, score] = winnerEntry;\n  const runnerUp = ranked[1]?.[1] ?? 0;\n''',
)
replace_once(
    '''  const ids = new Set<string>();\n  const visibleDescriptors = rawDescriptors.filter((descriptor) => descriptor.visible !== false);\n  const classifications = visibleDescriptors.map(classify).sort((left, right) => left.renderableId.localeCompare(right.renderableId));\n  for (const classification of classifications) {\n    if (ids.has(classification.renderableId)) {\n      throw new Error(`duplicate VRM renderable id: ${classification.renderableId}`);\n    }\n    ids.add(classification.renderableId);\n  }\n''',
    '''  const ids = new Set<string>();\n  const validated = rawDescriptors.map((descriptor) => ({\n    descriptor,\n    classification: classify(descriptor),\n  }));\n  for (const { classification } of validated) {\n    if (ids.has(classification.renderableId)) {\n      throw new Error(`duplicate VRM renderable id: ${classification.renderableId}`);\n    }\n    ids.add(classification.renderableId);\n  }\n  const visibleDescriptors = validated.filter(({ descriptor }) => descriptor.visible !== false);\n  const classifications = visibleDescriptors\n    .map(({ classification }) => classification)\n    .sort((left, right) => left.renderableId.localeCompare(right.renderableId));\n''',
)
replace_once(
    '''    visibleRenderableCount: visibleDescriptors.length,\n''',
    '''    visibleRenderableCount: classifications.length,\n''',
)

source = MODULE.read_text(encoding="utf-8")
for marker in (
    "const winnerEntry = ranked[0]",
    "const validated = rawDescriptors.map",
    "^[\\p{L}\\p{N}][\\p{L}\\p{N}._@-]*$",
):
    if marker not in source:
        raise RuntimeError(f"missing component-plan hardening marker: {marker}")

print("Hardened component pass planning IDs, typing, and hidden-input validation")
