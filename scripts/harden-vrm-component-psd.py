#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src/domains/creator/vrm/studio-vrm-component-psd.ts"
TEST = ROOT / "src/domains/creator/vrm/studio-vrm-component-psd.test.ts"


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


replace_once(
    MODULE,
    '''function preparePasses(\n  scene: StudioVrmLinkedSceneDescriptor,\n  passes: readonly StudioVrmComponentPass[],\n): readonly PreparedPass[] {\n  if (!passes.length) throw new Error("at least one component pass is required");\n  const ids = new Set<string>();\n  return Object.freeze(passes.map((pass) => {\n''',
    '''function preparePasses(\n  scene: StudioVrmLinkedSceneDescriptor,\n  passes: readonly StudioVrmComponentPass[],\n): readonly PreparedPass[] {\n  if (!passes.length) throw new Error("at least one component pass is required");\n  const ids = new Set<string>();\n  const layerNameCounts = new Map<string, number>();\n  return Object.freeze(passes.map((pass) => {\n''',
)
replace_once(
    MODULE,
    '''    return Object.freeze({\n      source: pass,\n      id,\n      layerName: safeLayerName(pass.name),\n      groupName: GROUP_LABELS[pass.kind],\n      blendMode,\n      opacity: finiteUnit(pass.opacity, 1, `component pass ${id} opacity`),\n      visible: pass.visible !== false,\n      rgba: new Uint8ClampedArray(pass.rgba),\n    });\n''',
    '''    const baseLayerName = safeLayerName(pass.name);\n    const nameKey = `${pass.kind}:${baseLayerName.toLocaleLowerCase("en-US")}`;\n    const occurrence = (layerNameCounts.get(nameKey) ?? 0) + 1;\n    layerNameCounts.set(nameKey, occurrence);\n    const layerName = occurrence === 1\n      ? baseLayerName\n      : `${baseLayerName.slice(0, 110)} · ${occurrence}`;\n    const visible = pass.visible ?? (pass.kind !== "depth" && pass.kind !== "material-id");\n    return Object.freeze({\n      source: pass,\n      id,\n      layerName,\n      groupName: GROUP_LABELS[pass.kind],\n      blendMode,\n      opacity: finiteUnit(pass.opacity, 1, `component pass ${id} opacity`),\n      visible,\n      rgba: new Uint8ClampedArray(pass.rgba),\n    });\n''',
)
replace_once(
    MODULE,
    '''function canonicalJson(value: unknown): string {\n  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;\n  if (value && typeof value === "object") {\n    const entries = Object.entries(value as Record<string, unknown>)\n      .sort(([left], [right]) => left.localeCompare(right))\n      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);\n    return `{${entries.join(",")}}`;\n  }\n  return JSON.stringify(value);\n}\n''',
    '''function canonicalJson(value: unknown): string {\n  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;\n  if (value && typeof value === "object") {\n    const entries = Object.entries(value as Record<string, unknown>)\n      .sort(([left], [right]) => left.localeCompare(right))\n      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);\n    return `{${entries.join(",")}}`;\n  }\n  const encoded = JSON.stringify(value);\n  if (encoded === undefined) throw new Error("linked render manifest contains an unsupported value");\n  return encoded;\n}\n''',
)
replace_once(
    MODULE,
    '''    opacity: Math.round(pass.opacity * 255),\n''',
    '''    opacity: pass.opacity,\n''',
)
replace_once(
    TEST,
    '''    expect(document.children[0]?.children[3]?.children[0]?.blendMode).toBe("multiply");\n  });\n''',
    '''    expect(document.children[0]?.children[3]?.children[0]?.blendMode).toBe("multiply");\n    expect(document.children[0]?.children[0]?.children[0]?.opacity).toBe(1);\n  });\n\n  it("hides utility passes by default and disambiguates duplicate portable layer names", () => {\n    const document = buildStudioVrmComponentPsdDocument(SCENE, [\n      pass({ id: "depth-a", kind: "depth", name: "Utility / Depth", rgba: rgba(5) }),\n      pass({ id: "depth-b", kind: "depth", name: "Utility : Depth", rgba: rgba(9) }),\n      pass({ id: "depth-visible", kind: "depth", name: "Artist Depth", visible: true, rgba: rgba(13) }),\n    ]) as unknown as { children: Array<{ children: Array<{ children: Array<{ name: string; hidden: boolean }> }> }> };\n    const layers = document.children[0]?.children[0]?.children ?? [];\n    expect(layers.map((layer) => layer.name)).toEqual([\n      "Utility Depth",\n      "Utility Depth · 2",\n      "Artist Depth",\n    ]);\n    expect(layers.map((layer) => layer.hidden)).toEqual([true, true, false]);\n  });\n''',
)

print("Hardened component PSD opacity, utility visibility, deterministic naming, and canonical JSON")
