import { Color, Mesh } from "three";

import type { CharacterMaterialOverrideV3 } from "../document/character-document-v3";
import type { Material, Object3D } from "three";

type Value = Color | number | boolean;
interface FieldPatch { readonly key: string; before: Value; readonly applied: Value }
interface MaterialPatch { readonly material: Material; readonly fields: FieldPatch[] }

function copy(value: Value): Value { return value instanceof Color ? value.clone() : value; }
function same(left: unknown, right: Value): boolean {
  return left instanceof Color && right instanceof Color ? left.equals(right) : left === right;
}
function write(material: Material, key: string, value: Value): void {
  const current: unknown = Reflect.get(material, key);
  if (current instanceof Color && value instanceof Color) current.copy(value);
  else Reflect.set(material, key, value);
  material.needsUpdate = true;
}

function synchronize(patch: MaterialPatch): void {
  for (const field of patch.fields) {
    const current: unknown = Reflect.get(patch.material, field.key);
    if (same(current, field.applied)) continue;
    // 호스트 palette가 갱신한 값은 새 바탕색이다. override를 해제할 때 그 값을 복원한다.
    if (current instanceof Color || typeof current === "number" || typeof current === "boolean") field.before = copy(current);
    write(patch.material, field.key, field.applied);
  }
}

function materialIds(material: Material): readonly string[] {
  const explicit: unknown = material.userData.characterMaterialId;
  return [material.uuid, material.name, `material:${material.name}`, ...(typeof explicit === "string" ? [explicit] : [])];
}

/** 실제 재질 위에 문서 값을 재생하며, 해제·모델 교체 때 자신이 쓴 필드만 복구한다. */
export class CharacterMaterialOverrideRuntime {
  #patches: MaterialPatch[] = [];
  #callbacks: { mesh: Mesh; previous: Mesh["onBeforeRender"]; installed: Mesh["onBeforeRender"] }[] = [];

  constructor(readonly root: Object3D, readonly captureActive: () => boolean = () => false) {}

  update(overrides: readonly CharacterMaterialOverrideV3[], delegatedMaterialIds: readonly string[] = []): { readonly materialCount: number; readonly warnings: readonly string[] } {
    this.clear();
    const materials = new Set<Material>();
    const meshes: Mesh[] = [];
    const groomMaterials = new Set<string>(delegatedMaterialIds);
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      if (node.userData.characterAuthoringDerivative === "groom") {
        const groomMaterialId: unknown = node.userData.characterGroomMaterialId;
        if (typeof groomMaterialId === "string") groomMaterials.add(groomMaterialId);
        return;
      }
      meshes.push(node);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    });
    const warnings: string[] = [];
    const assigned = new Set<Material>();
    for (const override of overrides) {
      const targets = [...materials].filter((material) => materialIds(material).includes(override.materialId));
      // Groom은 Worker 교체와 함께 동일 원본 override를 자체 적용한다.
      if (!targets.length && groomMaterials.has(override.materialId)) continue;
      if (!targets.length) { warnings.push(`${override.materialId}: 일치하는 재질을 찾지 못해 원본을 보존했습니다.`); continue; }
      // 동일한 ID의 서로 다른 재질은 원본을 확정할 수 없다.
      if (targets.length > 1) { warnings.push(`${override.materialId}: 재질 ID가 중복되어 적용하지 않았습니다.`); continue; }
      const material = targets[0];
      if (!material || assigned.has(material)) { warnings.push(`${override.materialId}: 같은 재질을 지정하는 override가 중복되었습니다.`); continue; }
      assigned.add(material);
      const fields: FieldPatch[] = [];
      const add = (key: string, value: Value | undefined) => {
        if (value === undefined) return;
        const current: unknown = Reflect.get(material, key);
        if (!(current instanceof Color && value instanceof Color) && typeof current !== typeof value) {
          warnings.push(`${override.materialId}: 현재 재질은 ${key} 속성을 지원하지 않습니다.`);
          return;
        }
        if (current instanceof Color || typeof current === "number" || typeof current === "boolean") {
          fields.push({ key, before: copy(current), applied: copy(value) });
          write(material, key, value);
        }
      };
      add("color", override.baseColor === undefined ? undefined : new Color(override.baseColor.slice(0, 7)));
      add("shadeColorFactor", override.shadowColor === undefined ? undefined : new Color(override.shadowColor.slice(0, 7)));
      add("outlineColorFactor", override.outlineColor === undefined ? undefined : new Color(override.outlineColor.slice(0, 7)));
      add("outlineWidthFactor", override.outlineWidth);
      const alpha = override.baseColor?.length === 9 ? Number.parseInt(override.baseColor.slice(7), 16) / 255 : null;
      const opacity = alpha === null ? override.opacity : (override.opacity ?? material.opacity) * alpha;
      add("opacity", opacity);
      if (opacity !== undefined && opacity < 1) add("transparent", true);
      if ([override.shadowColor, override.outlineColor].some((color) => color?.length === 9 && color.slice(7).toLowerCase() !== "ff")) {
        warnings.push(`${override.materialId}: 그림자·외곽선의 개별 alpha는 현재 재질에서 지원하지 않습니다.`);
      }
      if (fields.length) this.#patches.push({ material, fields });
    }
    const owned = new Map(this.#patches.map((patch) => [patch.material, patch]));
    const captureActive = this.captureActive;
    for (const mesh of meshes) {
      if (!(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((material) => owned.has(material))) continue;
      const previous = mesh.onBeforeRender;
      const installed: Mesh["onBeforeRender"] = function (this: Mesh, ...args) {
        previous.apply(this, args);
        const patch = owned.get(args[4]);
        // PSD가 잠시 중립화한 음영·paint-only 색을 사용자 변경으로 오인하지 않는다.
        if (patch && !captureActive()) synchronize(patch);
      };
      mesh.onBeforeRender = installed;
      this.#callbacks.push({ mesh, previous, installed });
    }
    return { materialCount: this.#patches.length, warnings };
  }

  clear(): void {
    for (const { mesh, previous, installed } of this.#callbacks) if (mesh.onBeforeRender === installed) mesh.onBeforeRender = previous;
    this.#callbacks = [];
    for (const { material, fields } of this.#patches) {
      for (const field of fields) if (same(Reflect.get(material, field.key), field.applied)) write(material, field.key, field.before);
    }
    this.#patches = [];
  }

  dispose(): void { this.clear(); }
}
