#!/usr/bin/env python3
from pathlib import Path

path = Path("src/domains/creator/vrm/studio-vrm-semantic-face-morph.ts")
source = path.read_text(encoding="utf-8")
old = '''  const controls = SEMANTIC_SPECS.flatMap((spec) => {
    const matching = bindings.filter((binding) => binding.semanticId === spec.id);
    const positiveTargetCount = matching.filter((binding) => binding.direction === 1).length;
    const negativeTargetCount = matching.length - positiveTargetCount;
    if (matching.length > 0) {
      return [Object.freeze({
        id: spec.id,
        label: spec.label,
        hint: spec.hint,
        minimum: negativeTargetCount > 0 ? -1 as const : 0 as const,
        maximum: positiveTargetCount > 0 ? 1 as const : 0 as const,
        positiveTargetCount,
        negativeTargetCount,
        targetNames: Object.freeze([...new Set(matching.map((binding) => binding.targetName))].sort()),
        provider: "native-morph" as const,
        adaptiveMeshCount: 0,
      })];
    }
    const adaptiveCapability = adaptive.capabilities.find((capability) => capability.id === spec.id);
    if (!adaptiveCapability) return [];
    return [Object.freeze({
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
      minimum: -1 as const,
      maximum: 1 as const,
      positiveTargetCount: 0,
      negativeTargetCount: 0,
      targetNames: Object.freeze([]),
      provider: "adaptive-mesh" as const,
      adaptiveMeshCount: adaptiveCapability.meshCount,
    })];
  });'''
new = '''  const controls: StudioVrmSemanticFaceMorphControl[] = [];
  for (const spec of SEMANTIC_SPECS) {
    const matching = bindings.filter((binding) => binding.semanticId === spec.id);
    const positiveTargetCount = matching.filter((binding) => binding.direction === 1).length;
    const negativeTargetCount = matching.length - positiveTargetCount;
    if (matching.length > 0) {
      controls.push(Object.freeze({
        id: spec.id,
        label: spec.label,
        hint: spec.hint,
        minimum: negativeTargetCount > 0 ? -1 : 0,
        maximum: positiveTargetCount > 0 ? 1 : 0,
        positiveTargetCount,
        negativeTargetCount,
        targetNames: Object.freeze([...new Set(matching.map((binding) => binding.targetName))].sort()),
        provider: "native-morph",
        adaptiveMeshCount: 0,
      }));
      continue;
    }
    const adaptiveCapability = adaptive.capabilities.find((capability) => capability.id === spec.id);
    if (!adaptiveCapability) continue;
    controls.push(Object.freeze({
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
      minimum: -1,
      maximum: 1,
      positiveTargetCount: 0,
      negativeTargetCount: 0,
      targetNames: Object.freeze([]),
      provider: "adaptive-mesh",
      adaptiveMeshCount: adaptiveCapability.meshCount,
    }));
  }'''
if source.count(old) != 1:
    raise SystemExit("semantic controls block did not match exactly")
path.write_text(source.replace(old, new), encoding="utf-8")
print("fixed explicit semantic control typing")
