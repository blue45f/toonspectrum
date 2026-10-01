/**
 * 패키지 메시(노드) 이름 → 파츠 역할(PartRole) 분류와 헤어 LOD 선택.
 *
 * Blender kit 규약(docs/authored-asset-pipeline.md 4절):
 * - `TS_AuthoredHair_<style>_LOD<n>` → hair + lod(n). `<mesh>_Outline` → 외곽선 셸 플래그.
 * - Babylon 로더가 멀티 프리미티브 메시를 `<node>_primitive<i>`로 나누므로 접미를 떼고 같은 역할로 본다.
 * - `Body|Face|Head|Bust|Neck` → skin/head, `Brow|Lash|Eye|Pupil|Iris|Teeth|Tongue` → 해당 역할.
 * - 규약 밖 이름은 unknown(role null)과 한글 사유로 남긴다(무음 대체 금지).
 */
import { AUTHORED_HAIR_MESH_PATTERN, OUTLINE_MESH_SUFFIX, isPartRole, parseAuthoredHairMeshName } from "../../contracts";

import type { PartRole } from "../../contracts";

export interface MeshRoleEntry {
  readonly name: string;
  readonly role: PartRole | null;
  /** 헤어 LOD 번호(헤어 규약 이름일 때) */
  readonly lod: number | null;
  readonly hairStyle: string | null;
  /** `_Outline` 접미(외곽선 셸) */
  readonly outline: boolean;
  /** Babylon 분할 접미(`_primitive<i>`)를 뗀 원 노드 이름 */
  readonly baseName: string;
  readonly reasonKo?: string;
}

/** 키워드(소문자 포함 검사) → 역할. 순서가 우선순위다(brow를 eye보다 먼저). */
const KEYWORD_ROLES: readonly (readonly [RegExp, PartRole])[] = [
  [/eyebrow|brow/u, "brow"],
  [/eyelash|lash/u, "lash"],
  [/highlight/u, "eye-highlight"],
  [/pupil/u, "pupil"],
  [/iris/u, "iris"],
  [/eye/u, "eyeball"],
  [/teeth|tooth/u, "teeth"],
  [/tongue/u, "tongue"],
  [/hair/u, "hair"],
  [/head|face/u, "head"],
  [/body|bust|neck|skin|torso/u, "skin"],
  [/shirt|jacket|hoodie|blazer|sailor|tee|top/u, "top"],
  [/pants|skirt|jeans|shorts|slacks|bottom/u, "bottom"],
  [/shoe|boot|sneaker|loafer|sandal/u, "shoes"],
  [/accessor|glasses|ribbon|cap|earring|choker|headphone/u, "accessory"],
];

const PRIMITIVE_SUFFIX = /_primitive\d+$/u;
const MESH_SUFFIX = /Mesh$/u;

/** 이름 하나를 분류한다. override(이름 → 역할)가 있으면 그 역할을 쓴다. */
export function classifyMeshName(name: string, override?: Readonly<Record<string, string>>): MeshRoleEntry {
  let baseName = name.replace(PRIMITIVE_SUFFIX, "");
  const outline = baseName.endsWith(OUTLINE_MESH_SUFFIX);
  if (outline) baseName = baseName.slice(0, -OUTLINE_MESH_SUFFIX.length);
  const hairName = AUTHORED_HAIR_MESH_PATTERN.test(baseName) ? baseName : baseName.replace(MESH_SUFFIX, "");
  const hair = parseAuthoredHairMeshName(hairName);

  const declared = override?.[name] ?? override?.[baseName];
  if (declared !== undefined) {
    if (isPartRole(declared)) {
      return { name, role: declared, lod: hair?.lod ?? null, hairStyle: hair?.style ?? null, outline, baseName };
    }
    return {
      name,
      role: null,
      lod: hair?.lod ?? null,
      hairStyle: hair?.style ?? null,
      outline,
      baseName,
      reasonKo: `override 역할 '${declared}'이(가) 파츠 역할 어휘 밖입니다.`,
    };
  }
  if (hair) return { name, role: "hair", lod: hair.lod, hairStyle: hair.style, outline, baseName };

  const lower = baseName.toLowerCase();
  for (const [pattern, role] of KEYWORD_ROLES) {
    if (pattern.test(lower)) return { name, role, lod: null, hairStyle: null, outline, baseName };
  }
  return {
    name,
    role: null,
    lod: null,
    hairStyle: null,
    outline,
    baseName,
    reasonKo: `메시 '${name}'은(는) 이름 규약(TS_AuthoredHair_<style>_LOD<n>, Body/Face/Head/Brow/Eye/Pupil 등)에 맞지 않습니다.`,
  };
}

export interface UnknownMesh {
  readonly name: string;
  readonly reasonKo: string;
}

export interface MeshClassification {
  readonly entries: readonly MeshRoleEntry[];
  readonly roles: Readonly<Record<string, PartRole>>;
  readonly unknown: readonly UnknownMesh[];
  /** 외곽선 셸 이름 목록 */
  readonly outlines: readonly string[];
}

export function classifyMeshRoles(names: readonly string[], override?: Readonly<Record<string, string>>): MeshClassification {
  const entries: MeshRoleEntry[] = [];
  const roles: Record<string, PartRole> = {};
  const unknown: UnknownMesh[] = [];
  const outlines: string[] = [];
  const seen = new Set<string>();
  const all = [...Object.keys(override ?? {}), ...names];
  for (const name of all) {
    if (seen.has(name)) continue;
    seen.add(name);
    const entry = classifyMeshName(name, override);
    entries.push(entry);
    if (entry.outline) outlines.push(name);
    if (entry.role) roles[name] = entry.role;
    else unknown.push({ name, reasonKo: entry.reasonKo ?? "분류 불가" });
  }
  return { entries, roles, unknown, outlines };
}

/** 스펙 공개 API: 메시 이름 → 파츠 역할(분류된 것만) */
export function mapMeshRoles(names: readonly string[], override?: Readonly<Record<string, string>>): Record<string, PartRole> {
  return { ...classifyMeshRoles(names, override).roles };
}

export interface HairLodSelection {
  readonly style: string | null;
  /** 존재하는 LOD 번호(오름차순) */
  readonly lods: readonly number[];
  /** 선택된 LOD(없으면 null) */
  readonly chosen: number | null;
  readonly visible: readonly string[];
  readonly hidden: readonly string[];
}

/**
 * 헤어 LOD 메시 중 하나만 보이게 고른다. preferredLod가 없으면 그보다 낮은(더 상세한) 것 중 가장 가까운 LOD,
 * 그것도 없으면 가장 상세한 LOD. 외곽선 셸은 본체 LOD와 같은 가시성을 따른다.
 */
export function selectHairLod(names: readonly string[], preferredLod = 0): HairLodSelection {
  const classified = names.map((name) => classifyMeshName(name));
  const hairEntries = classified.filter((entry) => entry.role === "hair" && entry.lod !== null);
  const lods = [...new Set(hairEntries.map((entry) => entry.lod ?? 0))].sort((a, b) => a - b);
  const style = hairEntries.find((entry) => entry.hairStyle !== null)?.hairStyle ?? null;
  if (lods.length === 0) return { style, lods, chosen: null, visible: [], hidden: [] };
  const atOrBelow = lods.filter((lod) => lod <= preferredLod);
  const chosen = atOrBelow.length > 0 ? (atOrBelow[atOrBelow.length - 1] ?? lods[0] ?? 0) : (lods[0] ?? 0);
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const entry of hairEntries) (entry.lod === chosen ? visible : hidden).push(entry.name);
  return { style, lods, chosen, visible, hidden };
}

/** 삼각형 예산 이하인 가장 상세한 LOD 인덱스. 전부 초과하면 마지막(가장 거친) LOD. 빈 배열이면 0. */
export function chooseLodForTriangleBudget(lodTriangles: readonly number[], budget: number): number {
  if (lodTriangles.length === 0) return 0;
  for (let index = 0; index < lodTriangles.length; index += 1) {
    if ((lodTriangles[index] ?? Number.POSITIVE_INFINITY) <= budget) return index;
  }
  return lodTriangles.length - 1;
}
