import { Material } from "three";

import type { Mesh, Object3D } from "three";

export interface CharacterMaskTarget {
  readonly mesh: Mesh;
  readonly slots: ReadonlySet<number> | null;
}

/**
 * Isolate a semantic mask without suppressing kept draws that share a muted material.
 * Ancestor meshes remain traversable: their own draw is muted instead of hiding their children.
 * This is a synchronous scope; restore it before every event-loop yield.
 */
export function isolateCharacterMask(
  meshes: readonly Mesh[],
  targets: readonly CharacterMaskTarget[],
): () => void {
  const kept = new Map<Mesh, ReadonlySet<number> | null>();
  for (const target of targets) {
    if (kept.get(target.mesh) === null) continue;
    if (target.slots === null) kept.set(target.mesh, null);
    else kept.set(target.mesh, new Set([...(kept.get(target.mesh) ?? []), ...target.slots]));
  }
  const ancestors = new Set<Object3D>();
  for (const mesh of kept.keys()) {
    // A visited set also terminates malformed cyclic ancestry without a depth guess.
    let parent = mesh.parent;
    while (parent && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = parent.parent;
    }
  }
  const snapshots = meshes.map((mesh) => ({ mesh, visible: mesh.visible, material: mesh.material }));
  const drawn = new Set<Material>();
  for (const { mesh, material } of snapshots) {
    if (!kept.has(mesh)) continue;
    const slots = kept.get(mesh);
    const list = Array.isArray(material) ? material : [material];
    list.forEach((entry, slot) => {
      if (entry && (slots === null || slots?.has(slot))) drawn.add(entry);
    });
  }
  const flags = new Map<Material, { colorWrite: boolean; depthWrite: boolean }>();
  const placeholders = new Map<Material, Material>();
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const snapshot of snapshots) {
      snapshot.mesh.visible = snapshot.visible;
      snapshot.mesh.material = snapshot.material;
    }
    for (const [material, saved] of flags) {
      material.colorWrite = saved.colorWrite;
      material.depthWrite = saved.depthWrite;
    }
    for (const placeholder of placeholders.values()) placeholder.dispose();
  };
  const mute = (material: Material): Material => {
    if (!drawn.has(material)) {
      if (!flags.has(material)) flags.set(material, { colorWrite: material.colorWrite, depthWrite: material.depthWrite });
      material.colorWrite = false;
      material.depthWrite = false;
      return material;
    }
    let placeholder = placeholders.get(material);
    if (!placeholder) {
      // A non-rendered base Material owns no cloned textures, uniforms or shader programs.
      placeholder = new Material();
      placeholder.name = material.name;
      placeholder.visible = false;
      placeholder.colorWrite = false;
      placeholder.depthWrite = false;
      placeholders.set(material, placeholder);
    }
    return placeholder;
  };
  try {
    for (const { mesh, material } of snapshots) {
      if (!kept.has(mesh) && !ancestors.has(mesh)) {
        mesh.visible = false;
        continue;
      }
      const wholeMesh = kept.has(mesh) && kept.get(mesh) === null;
      if (wholeMesh) continue;
      const slots = kept.get(mesh);
      if (Array.isArray(material)) {
        const replacement = material.map((entry, slot) => entry && !slots?.has(slot) ? mute(entry) : entry);
        if (replacement.some((entry, slot) => entry !== material[slot])) mesh.material = replacement;
      } else if (material && !slots?.has(0)) {
        mesh.material = mute(material);
      }
    }
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}
