import * as THREE from "three";

import {
  classifyMeshName,
  tintColor,
  type CostumeSlot,
  type CostumeState,
} from "./studio-vrm-costume";

import type { VRM } from "@pixiv/three-vrm";

export interface StudioVrmCostumeMeshEntry {
  /** 직렬화·식별 키(노드 이름 우선, 비면 머티리얼 이름). */
  key: string;
  /** 표시용 이름. */
  label: string;
  slot: CostumeSlot;
  mesh: THREE.Mesh;
}

// 원본 머티리얼 색(hex)을 메시별로 1회 캡처해 둔다(틴트는 항상 원본 기준 — 중첩 누적 방지).
const costumeBaseColorCache = new WeakMap<THREE.Material, string>();
const isolatedCostumeMaterialMeshes = new WeakSet<THREE.Mesh>();

function materialBaseHex(mat: THREE.Material): string {
  const cached = costumeBaseColorCache.get(mat);
  if (cached) return cached;
  const color = (mat as unknown as { color?: THREE.Color }).color;
  const hex = color ? `#${color.getHexString()}` : "#cccccc";
  costumeBaseColorCache.set(mat, hex);
  return hex;
}

/** 씬그래프를 순회해 의상 슬롯에 해당하는 메시를 수집한다(피부·얼굴·눈·머리 제외). */
export function collectStudioVrmCostumeMeshes(vrm: VRM): StudioVrmCostumeMeshEntry[] {
  const entries: StudioVrmCostumeMeshEntry[] = [];
  const seenKeys = new Set<string>();
  vrm.scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    let materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matNames = materials.map((m) => (m as THREE.Material | undefined)?.name)
      .filter(Boolean) as string[];
    const materialClasses = matNames.map((name) => classifyMeshName(name));
    const explicitMaterialSlot = materialClasses
      .find((entry) => entry.slot !== null && entry.protected === null)?.slot ?? null;
    const hasProtectedMaterial = materialClasses.some((entry) => entry.protected !== null);
    // Exporters sometimes name every primitive simply "Body". An explicit clothing material is
    // stronger evidence than that generic node name, but a truly mixed skin+cloth material array
    // remains protected because mesh-level visibility would hide skin with the outfit.
    const cls = explicitMaterialSlot && !hasProtectedMaterial
      ? { slot: explicitMaterialSlot, protected: null }
      : classifyMeshName(mesh.name, ...matNames);
    if (cls.slot === null || cls.protected !== null) return;
    const baseKey = mesh.name || matNames[0] || `mesh-${entries.length}`;
    let key = baseKey;
    let duplicateIndex = 2;
    while (seenKeys.has(key)) {
      key = `${baseKey}#${duplicateIndex}`;
      duplicateIndex += 1;
    }
    seenKeys.add(key);
    // Costume recolor must never mutate a material shared by skin, hair, or another primitive.
    // Clone once per installed mesh and keep MToon/physical subclasses through Material.clone().
    if (!isolatedCostumeMaterialMeshes.has(mesh)) {
      materials = materials.map((material) => material.clone());
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
      isolatedCostumeMaterialMeshes.add(mesh);
    }
    // 원본 색 캡처
    materials.forEach((m) => {
      if (m) materialBaseHex(m as THREE.Material);
    });
    entries.push({ key, label: mesh.name || matNames[0] || "메시", slot: cls.slot, mesh });
  });
  return entries;
}

/** 수집된 의상 메시에 표시/숨김·리컬러 상태를 적용한다. */
export function applyStudioVrmCostumeState(
  entries: StudioVrmCostumeMeshEntry[],
  state: CostumeState,
) {
  for (const entry of entries) {
    entry.mesh.visible = !state.hidden.includes(entry.key);
    const target = state.recolor[entry.key];
    const materials = Array.isArray(entry.mesh.material)
      ? entry.mesh.material
      : [entry.mesh.material];
    materials.forEach((m) => {
      const mat = m as (THREE.Material & { color?: THREE.Color }) | undefined;
      if (!mat || !mat.color) return;
      const base = materialBaseHex(mat);
      const next = target ? tintColor(base, target) : base;
      mat.color.set(next);
      mat.needsUpdate = true;
    });
  }
}
