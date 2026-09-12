/**
 * Character Shaper — semantic render passes and the layered PSD they assemble into.
 *
 * SHAPER's "layer-separated PSD" is the one output a webtoon studio actually finishes work with:
 * flat colours per body part, a shadow layer to multiply, a highlight layer to screen, and the ink
 * on top. This module produces that from the live VRM scene without a second renderer:
 *
 *  - **beauty** — the viewport as it is, cleared transparent.
 *  - **flat** — the same frame with MToon shading neutralised (`shadeColorFactor` := base colour,
 *    `shadingShiftFactor`/`shadingToonyFactor` := 1). The light rig is untouched, so the only
 *    difference between the two frames is the toon shading itself.
 *  - **shadow/highlight** — normalized Multiply/Screen factors that reconstruct opaque beauty
 *    from flat colour; translucent edges still require separate composite quality checks.
 *  - **line** — Sobel over the flat pass (alpha edge ∪ luminance edge). Flat colour excludes toon
 *    shadow boundaries. A dark surface is not itself ink: only its boundaries contribute.
 *  - **surface-paint** — only when the paint runtime hands over its paint-only textures.
 *  - **mask-**\* — one alpha silhouette per semantic group, rendered by hiding every other mesh.
 *
 * Honesty rules: a pass that cannot be produced is reported in `skipped` with a Korean reason and
 * never faked, an empty pass never becomes a blank layer, and every mutation the capture makes to
 * the live scene (material factors, mesh visibility, texture bindings) is restored in `finally` —
 * including when a render throws or the caller aborts.
 */

import { classifyMeshName } from "../vrm/studio-vrm-costume";
import { collectStudioVrmCostumeMeshes } from "../vrm/studio-vrm-costume-runtime";
import { isStudioVrmMtoonMaterial } from "../vrm/studio-vrm-mtoon-brand";
import { captureStudioVrmRgba } from "../vrm/studio-vrm-raster-capture";

import {
  CHARACTER_INK_HEX,
  alphaOnly,
  deriveCharacterShadingLayers,
  isEmptyPass,
  sobelEdgeAlpha,
} from "./character-shaper-image-math";

import { CHARACTER_SEMANTIC_MASK_LABELS, CHARACTER_SEMANTIC_MASK_ORDER } from "./character-shaper-psd-assembly";
import { assembleCharacterPsdInWorker } from "./character-shaper-psd-worker-client";
import { validateCharacterPsdPasses } from "./character-shaper-psd-worker-protocol";

import type { BuildCharacterSemanticPsdOptions, CharacterSemanticMaskId, CharacterSemanticPsdResult,
  CharacterSemanticSkip } from "./character-shaper-psd-assembly";

import type {
  CharacterSemanticPass,
  CharacterSemanticPassId,
} from "./character-shaper-contract";
import type { ProtectedCategory } from "../vrm/studio-vrm-costume";
import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";

export { buildCharacterSemanticPsd, CHARACTER_PSD_GROUP_NAMES, CHARACTER_PSD_PREVIEW_LAYER_NAME,
  CHARACTER_SEMANTIC_MASK_LABELS, CHARACTER_SEMANTIC_MASK_ORDER, PSD_MIME } from "./character-shaper-psd-assembly";
export type { BuildCharacterSemanticPsdOptions, CharacterSemanticMaskId, CharacterSemanticPsdResult,
  CharacterSemanticSkip } from "./character-shaper-psd-assembly";

/* -------------------------------------------------------------------------- */
/* Public shapes                                                               */
/* -------------------------------------------------------------------------- */

export interface CharacterSemanticCaptureState {
  readonly gl: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
}

/** Material → paint-only texture. `null` (or an empty map) means nothing has been painted. */
export type CharacterPaintTextureProvider = () => Map<THREE.Material, THREE.Texture> | null;

export interface CaptureCharacterSemanticPassesInput {
  readonly capture: CharacterSemanticCaptureState;
  readonly vrm: VRM;
  readonly width: number;
  readonly height: number;
  readonly signal?: AbortSignal;
  /** Reject a stale model or editing authority before every rendered pass. */
  readonly assertCurrent?: () => void;
  /** Procedural wardrobe mounts; their meshes join 상의/하의/신발 masks. */
  readonly garmentRoots?: readonly THREE.Object3D[];
  /** Procedural prop mounts; their meshes join the 액세서리 mask. */
  readonly propRoots?: readonly THREE.Object3D[];
  readonly paintTextureProvider?: CharacterPaintTextureProvider;
}

export interface CharacterSemanticCaptureResult {
  readonly passes: readonly CharacterSemanticPass[];
  readonly skipped: readonly CharacterSemanticSkip[];
}

export interface ExportCharacterSemanticPsdInput
  extends CaptureCharacterSemanticPassesInput, BuildCharacterSemanticPsdOptions {
  /** All GPU/material scopes are restored and validated; release helper visibility before encoding. */
  readonly onCaptured?: () => void;
  readonly timeoutMs?: number;
}

/** Seam for tests: the product path renders through `captureStudioVrmRgba`. */
export interface CharacterSemanticCaptureDependencies {
  readonly captureRgba: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    dimensions: { readonly width: number; readonly height: number },
  ) => Uint8ClampedArray;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Retained GPU/pass-memory budget. Moving file assembly to a Worker does not raise this limit. */
export const CHARACTER_SEMANTIC_PASS_MAX_EDGE = 2048;

const MASK_NOT_FOUND_REASONS: Readonly<Record<CharacterSemanticMaskId, string>> = Object.freeze({
  "mask-face": "얼굴 메시를 찾지 못했습니다.",
  "mask-eyes": "눈으로 읽히는 메시도 재질도 없습니다. 눈이 얼굴과 한 재질로 합쳐진 모델은 분리할 수 없습니다.",
  "mask-hair": "머리카락 메시를 찾지 못했습니다.",
  "mask-skin": "피부 메시를 찾지 못했습니다.",
  "mask-top": "상의로 분류된 메시가 없습니다.",
  "mask-bottom": "하의로 분류된 메시가 없습니다.",
  "mask-shoes": "신발로 분류된 메시가 없습니다.",
  "mask-accessory": "액세서리·소품으로 분류된 메시가 없습니다.",
});

const PROTECTED_MASK: Readonly<Record<ProtectedCategory, CharacterSemanticMaskId>> = Object.freeze({
  face: "mask-face",
  eye: "mask-eyes",
  hair: "mask-hair",
  skin: "mask-skin",
  body: "mask-skin",
});

const WARDROBE_ROOT_MASK: Readonly<Record<string, CharacterSemanticMaskId>> = Object.freeze({
  outer: "mask-top",
  top: "mask-top",
  bottom: "mask-bottom",
  shoes: "mask-shoes",
});

const COSTUME_SLOT_MASK: Readonly<Record<string, CharacterSemanticMaskId>> = Object.freeze({
  outer: "mask-top",
  tops: "mask-top",
  onepiece: "mask-top",
  innerwear: "mask-top",
  bottoms: "mask-bottom",
  shoes: "mask-shoes",
  accessory: "mask-accessory",
});

const WARDROBE_ROOT_NAME = /^wardrobe:(outer|top|bottom|shoes)\b/u;
const PROP_ROOT_NAME = /^prop:/u;
/** Guard against a cyclic or pathologically deep graph while walking parents. */
const ANCESTRY_DEPTH = 32;

/* -------------------------------------------------------------------------- */
/* Structural material views (no @pixiv import — MToon is a transitive dep)     */
/* -------------------------------------------------------------------------- */

type ColorLike = { copy(value: ColorLike): unknown; clone(): ColorLike; set(value: number): unknown };

type ShadingMaterial = THREE.Material & {
  color?: ColorLike;
  shadeColorFactor?: ColorLike;
  shadingShiftFactor?: number;
  shadingToonyFactor?: number;
  isOutline?: boolean;
  isMToonMaterial?: boolean;
  isMToonNodeMaterial?: boolean;
};

type PaintableMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  color?: ColorLike;
};

/* -------------------------------------------------------------------------- */
/* Size + abort helpers                                                        */
/* -------------------------------------------------------------------------- */

function abortError(): Error {
  const error = new Error("캐릭터 레이어 캡처를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

/** Clamp to the main-thread budget while keeping the viewport's aspect ratio. */
export function boundCharacterSemanticCaptureSize(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new RangeError("캐릭터 레이어 캡처 크기가 올바르지 않습니다.");
  }
  const scale = Math.min(
    1,
    CHARACTER_SEMANTIC_PASS_MAX_EDGE / width,
    CHARACTER_SEMANTIC_PASS_MAX_EDGE / height,
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/**
 * Yield the main thread between passes. Fourteen 2048² renders back to back would freeze the
 * viewport with no chance to paint progress, and the abort check has to happen somewhere.
 */
async function betweenPasses(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  if (signal?.aborted) throw abortError();
}

/* -------------------------------------------------------------------------- */
/* Scene classification                                                        */
/* -------------------------------------------------------------------------- */

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as Partial<THREE.Mesh>).isMesh === true;
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  const value = mesh.material;
  const list = Array.isArray(value) ? value : [value];
  return list.filter((material): material is THREE.Material => Boolean(material));
}

/** Procedural wardrobe / prop mounts name their root `wardrobe:<slot>:<id>` or `prop:<id>`. */
function maskFromAncestry(object: THREE.Object3D): CharacterSemanticMaskId | null {
  let node: THREE.Object3D | null = object;
  for (let depth = 0; node && depth < ANCESTRY_DEPTH; depth += 1) {
    const name = node.name;
    if (name) {
      const wardrobe = WARDROBE_ROOT_NAME.exec(name);
      if (wardrobe) return WARDROBE_ROOT_MASK[wardrobe[1]] ?? null;
      if (PROP_ROOT_NAME.test(name)) return "mask-accessory";
    }
    node = node.parent;
  }
  return null;
}

/**
 * Fall back to the protected-category heuristics the costume system already uses. The mesh's own
 * name wins; material names decide only when they agree and the node name says nothing, so a
 * multi-material "Body" primitive is not mislabelled by one of its materials.
 */
function maskFromNames(mesh: THREE.Mesh): CharacterSemanticMaskId | null {
  const own = classifyMeshName(mesh.name);
  if (own.protected) return PROTECTED_MASK[own.protected];

  const categories = new Set<ProtectedCategory>();
  for (const material of materialsOf(mesh)) {
    const category = classifyMeshName(material.name).protected;
    if (category) categories.add(category);
  }
  if (categories.size !== 1) return null;
  const [only] = [...categories];
  return PROTECTED_MASK[only];
}

/**
 * VRoid 계열은 눈·눈썹·속눈썹·얼굴을 한 메시(대개 이름에 Head가 들어간다)에 재질로만 나눠 담는다.
 * 메시 단위로만 분류하면 그 모델에서는 「눈」 레이어를 영영 만들 수 없으므로, 재질이 서로 다른
 * 부위를 가리키는 메시는 슬롯 단위로 쪼갠다. 재질 이름이 더 구체적이라 메시 이름을 이긴다.
 * 아무 말도 하지 않는 슬롯만 메시 이름의 분류로 되돌린다 — 얼굴을 눈이라 부르느니 그 슬롯을
 * 얼굴에 두는 쪽이 정직하다.
 */
function maskSlotsFromMaterials(mesh: THREE.Mesh): Map<number, CharacterSemanticMaskId> | null {
  if (!Array.isArray(mesh.material) || mesh.material.length < 2) return null;
  const own = classifyMeshName(mesh.name).protected;
  const fallback = own ? PROTECTED_MASK[own] : null;
  const slots = new Map<number, CharacterSemanticMaskId>();
  const seen = new Set<CharacterSemanticMaskId>();
  mesh.material.forEach((material, slot) => {
    if (!material) return;
    const category = classifyMeshName(material.name).protected;
    const mask = category ? PROTECTED_MASK[category] : fallback;
    if (!mask) return;
    slots.set(slot, mask);
    seen.add(mask);
  });
  // 슬롯이 전부 같은 마스크를 가리키면 쪼갤 이유가 없다 — 메시 단위 분류가 그대로 맞다.
  return seen.size > 1 ? slots : null;
}

/** 마스크 하나가 붙잡는 대상. `slots`가 있으면 그 메시의 해당 재질 슬롯만 이 마스크의 것이다. */
interface CharacterMaskTarget {
  readonly mesh: THREE.Mesh;
  readonly slots: ReadonlySet<number> | null;
}

interface CharacterMeshIndex {
  /** Every mesh the capture may toggle, in traversal order. */
  readonly meshes: readonly THREE.Mesh[];
  readonly groups: ReadonlyMap<CharacterSemanticMaskId, readonly CharacterMaskTarget[]>;
}

function indexCharacterMeshes(
  vrm: VRM,
  garmentRoots: readonly THREE.Object3D[],
  propRoots: readonly THREE.Object3D[],
): CharacterMeshIndex {
  const meshes: THREE.Mesh[] = [];
  const seen = new Set<THREE.Mesh>();
  const assigned = new Map<THREE.Mesh, CharacterSemanticMaskId>();

  const visit = (root: THREE.Object3D, forced: CharacterSemanticMaskId | null) => {
    root.traverse((object) => {
      if (!isMesh(object) || seen.has(object)) return;
      seen.add(object);
      meshes.push(object);
      const mask = forced ?? maskFromAncestry(object);
      if (mask) assigned.set(object, mask);
    });
  };

  visit(vrm.scene, null);
  for (const root of garmentRoots) visit(root, maskFromAncestry(root));
  for (const root of propRoots) visit(root, maskFromAncestry(root) ?? "mask-accessory");

  // Baked costume meshes are classified by the same collector the wardrobe panel uses.
  for (const entry of collectStudioVrmCostumeMeshes(vrm)) {
    if (assigned.has(entry.mesh)) continue;
    const mask = COSTUME_SLOT_MASK[entry.slot];
    if (mask) assigned.set(entry.mesh, mask);
  }

  const slotAssigned = new Map<THREE.Mesh, Map<number, CharacterSemanticMaskId>>();
  for (const mesh of meshes) {
    if (assigned.has(mesh)) continue;
    // 슬롯 분해가 먼저다. 메시 이름은 합쳐진 머리를 통째로 「얼굴」이라 부르므로, 그 판단을
    // 먼저 받아들이면 눈은 영원히 얼굴 안에 갇힌다.
    const slots = maskSlotsFromMaterials(mesh);
    if (slots) {
      slotAssigned.set(mesh, slots);
      continue;
    }
    const mask = maskFromNames(mesh);
    if (mask) assigned.set(mesh, mask);
  }

  const groups = new Map<CharacterSemanticMaskId, CharacterMaskTarget[]>();
  const push = (mask: CharacterSemanticMaskId, target: CharacterMaskTarget) => {
    const bucket = groups.get(mask) ?? [];
    bucket.push(target);
    groups.set(mask, bucket);
  };
  for (const [mesh, mask] of assigned) push(mask, { mesh, slots: null });
  for (const [mesh, slots] of slotAssigned) {
    const byMask = new Map<CharacterSemanticMaskId, Set<number>>();
    for (const [slot, mask] of slots) {
      const bucket = byMask.get(mask) ?? new Set<number>();
      bucket.add(slot);
      byMask.set(mask, bucket);
    }
    for (const [mask, slotSet] of byMask) push(mask, { mesh, slots: slotSet });
  }
  return { meshes, groups };
}

/* -------------------------------------------------------------------------- */
/* Reversible scene mutations                                                  */
/* -------------------------------------------------------------------------- */

function uniqueMaterials(meshes: readonly THREE.Mesh[]): THREE.Material[] {
  const seen = new Set<THREE.Material>();
  for (const mesh of meshes) {
    for (const material of materialsOf(mesh)) seen.add(material);
  }
  return [...seen];
}

interface ShadingRestore {
  readonly material: ShadingMaterial;
  readonly shade: ColorLike;
  readonly shift: number | undefined;
  readonly toony: number | undefined;
}

/**
 * Make MToon render its lit colour everywhere: the shade colour becomes the base colour and the
 * shading ramp is pushed fully to the lit side. Outline materials are left alone so the outline
 * draw survives into the flat pass, which is what the line pass harvests.
 */
function neutralizeCharacterShading(meshes: readonly THREE.Mesh[]): {
  readonly restore: () => void;
  readonly count: number;
} {
  const saved: ShadingRestore[] = [];
  for (const raw of uniqueMaterials(meshes)) {
    const material = raw as ShadingMaterial;
    if (!isStudioVrmMtoonMaterial(material)) continue;
    if (material.isOutline === true) continue;
    const shade = material.shadeColorFactor;
    if (!shade) continue;
    saved.push({
      material,
      shade: shade.clone(),
      shift: material.shadingShiftFactor,
      toony: material.shadingToonyFactor,
    });
    if (material.color) shade.copy(material.color);
    else shade.set(0xffffff);
    material.shadingShiftFactor = 1;
    material.shadingToonyFactor = 1;
    material.needsUpdate = true;
  }

  return {
    count: saved.length,
    restore: () => {
      for (const entry of saved) {
        entry.material.shadeColorFactor?.copy(entry.shade);
        entry.material.shadingShiftFactor = entry.shift;
        entry.material.shadingToonyFactor = entry.toony;
        entry.material.needsUpdate = true;
      }
    },
  };
}

/** Run one render with a scene mutation in place, undoing it even when the render throws. */
function withRestore<T>(restore: () => void, run: () => T): T {
  try {
    return run();
  } finally {
    restore();
  }
}

/**
 * Hide everything outside `targets`; the returned closure puts every flag back as it was.
 *
 * 슬롯만 남기는 대상은 메시를 켜 둔 채 나머지 재질의 색 기록만 끈다 — 재질을 갈아 끼우면
 * 셰이더가 다시 컴파일되고 복원이 어긋날 수 있는데, `colorWrite`는 둘 다 일으키지 않는다.
 */
function isolateVisibility(
  meshes: readonly THREE.Mesh[],
  targets: readonly CharacterMaskTarget[],
): () => void {
  const kept = new Map<THREE.Mesh, ReadonlySet<number> | null>();
  for (const target of targets) {
    // 같은 메시를 통째로 요구한 대상이 하나라도 있으면 그쪽이 이긴다.
    if (kept.get(target.mesh) === null) continue;
    if (target.slots === null) {
      kept.set(target.mesh, null);
      continue;
    }
    const merged = new Set(kept.get(target.mesh) ?? []);
    for (const slot of target.slots) merged.add(slot);
    kept.set(target.mesh, merged);
  }

  const previousVisible = meshes.map((mesh) => mesh.visible);
  const muted = new Map<THREE.Material, { colorWrite: boolean; depthWrite: boolean }>();
  for (const mesh of meshes) {
    if (!kept.has(mesh)) {
      mesh.visible = false;
      continue;
    }
    const slots = kept.get(mesh) ?? null;
    if (slots === null || !Array.isArray(mesh.material)) continue;
    mesh.material.forEach((material, slot) => {
      if (!material || slots.has(slot)) return;
      // Meshes and material slots can share the same instance. Snapshot before its first
      // mutation only; a second snapshot would save our temporary false flags as the original.
      if (!muted.has(material)) {
        muted.set(material, { colorWrite: material.colorWrite, depthWrite: material.depthWrite });
      }
      material.colorWrite = false;
      // 깊이까지 꺼야 숨긴 슬롯이 남긴 슬롯을 가리지 않는다 — 메시 통째로 끌 때와 같은 결과다.
      material.depthWrite = false;
    });
  }

  return () => {
    meshes.forEach((mesh, index) => {
      mesh.visible = previousVisible[index];
    });
    for (const [material, flags] of muted) {
      material.colorWrite = flags.colorWrite;
      material.depthWrite = flags.depthWrite;
    }
  };
}

interface PaintRestore {
  readonly material: PaintableMaterial;
  readonly map: THREE.Texture | null | undefined;
  readonly color: ColorLike | undefined;
  readonly transparent: boolean;
  readonly colorWrite: boolean;
  readonly depthWrite: boolean;
}

/**
 * Bind the paint-only textures and mute every other material. Muting uses `colorWrite`/`depthWrite`
 * rather than mesh visibility because a mesh can mix a painted material with unpainted ones.
 */
function bindPaintTextures(
  meshes: readonly THREE.Mesh[],
  paint: ReadonlyMap<THREE.Material, THREE.Texture>,
): { readonly restore: () => void; readonly painted: number } {
  const saved: PaintRestore[] = [];
  let painted = 0;
  for (const raw of uniqueMaterials(meshes)) {
    const material = raw as PaintableMaterial;
    saved.push({
      material,
      map: material.map,
      color: material.color?.clone(),
      transparent: material.transparent,
      colorWrite: material.colorWrite,
      depthWrite: material.depthWrite,
    });
    const texture = paint.get(raw);
    if (texture) {
      material.map = texture;
      material.color?.set(0xffffff);
      material.transparent = true;
      material.needsUpdate = true;
      painted += 1;
    } else {
      material.colorWrite = false;
      material.depthWrite = false;
    }
  }

  return {
    painted,
    restore: () => {
      for (const entry of saved) {
        entry.material.map = entry.map;
        if (entry.color) entry.material.color?.copy(entry.color);
        entry.material.transparent = entry.transparent;
        entry.material.colorWrite = entry.colorWrite;
        entry.material.depthWrite = entry.depthWrite;
        entry.material.needsUpdate = true;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

const DEFAULT_DEPENDENCIES: CharacterSemanticCaptureDependencies = {
  captureRgba: (renderer, scene, camera, dimensions) =>
    captureStudioVrmRgba(renderer, scene, camera, dimensions, { alpha: 0 }),
};

/**
 * Render every semantic pass the loaded model can honour. Scene mutations are always undone in
 * `finally`, so an abort or a WebGL failure leaves the viewport exactly as it was found.
 */
export async function captureCharacterSemanticPasses(
  input: CaptureCharacterSemanticPassesInput,
  dependencies: CharacterSemanticCaptureDependencies = DEFAULT_DEPENDENCIES,
): Promise<CharacterSemanticCaptureResult> {
  const { capture, vrm, signal } = input;
  const dimensions = boundCharacterSemanticCaptureSize(input.width, input.height);
  const { width, height } = dimensions;
  const passes: CharacterSemanticPass[] = [];
  const skipped: CharacterSemanticSkip[] = [];
  const record = (id: CharacterSemanticPassId, rgba: Uint8ClampedArray, emptyReason: string) => {
    if (isEmptyPass(rgba)) skipped.push({ pass: id, reason: emptyReason });
    else passes.push({ id, width, height, rgba });
  };
  const render = () => {
    if (signal?.aborted) throw abortError();
    input.assertCurrent?.();
    return dependencies.captureRgba(capture.gl, capture.scene, capture.camera, dimensions);
  };

  if (signal?.aborted) throw abortError();
  const index = indexCharacterMeshes(vrm, input.garmentRoots ?? [], input.propRoots ?? []);

  const beauty = render();
  record("beauty", beauty, "모델이 화면에 보이지 않아 미리보기 패스를 만들지 못했습니다.");

  await betweenPasses(signal);
  const shading = neutralizeCharacterShading(index.meshes);
  const flat = withRestore(shading.restore, render);
  record("flat", flat, "모델이 화면에 보이지 않아 밑색 패스를 만들지 못했습니다.");

  const shadingReason = shading.count === 0
    ? "MToon(툰) 재질이 없어 음영과 하이라이트를 분리하지 못했습니다."
    : "빛과 그림자 차이가 없어 레이어를 만들지 않았습니다.";
  const shadingLayers = deriveCharacterShadingLayers(flat, beauty);
  record("shadow", shadingLayers.shadow, shadingReason);
  record("highlight", shadingLayers.highlight, shadingReason);
  record(
    "line",
    sobelEdgeAlpha(flat, width, height, { inkColor: CHARACTER_INK_HEX }),
    "외곽선으로 뽑을 만한 경계가 없습니다.",
  );

  await betweenPasses(signal);
  const paint = input.paintTextureProvider ? input.paintTextureProvider() : null;
  if (!input.paintTextureProvider) {
    skipped.push({
      pass: "surface-paint",
      reason: "독립된 표면 드로잉 텍스처가 제공되지 않아 드로잉 레이어를 만들지 않았습니다.",
    });
  } else if (!paint || paint.size === 0) {
    skipped.push({
      pass: "surface-paint",
      reason: "모델 위에 칠한 획이 없어 드로잉 레이어를 만들지 않았습니다.",
    });
  } else {
    // The drawing layer must carry the strokes, not the strokes with the light rig baked in. Bind
    // the paint textures first so neutralising shading picks up the white base the binding just
    // set; the restores then run in reverse order.
    const bound = bindPaintTextures(index.meshes, paint);
    const paintShading = neutralizeCharacterShading(index.meshes);
    const painted = withRestore(() => {
      paintShading.restore();
      bound.restore();
    }, render);
    record(
      "surface-paint",
      painted,
      bound.painted === 0
        ? "표면 드로잉 텍스처가 현재 모델의 재질과 연결되지 않았습니다."
        : "칠한 획이 현재 시점에서 보이지 않습니다.",
    );
  }

  for (const mask of CHARACTER_SEMANTIC_MASK_ORDER) {
    const keep = index.groups.get(mask);
    if (!keep || keep.length === 0) {
      skipped.push({ pass: mask, reason: MASK_NOT_FOUND_REASONS[mask] });
      continue;
    }
    await betweenPasses(signal);
    const isolated = withRestore(isolateVisibility(index.meshes, keep), render);
    record(
      mask,
      alphaOnly(isolated),
      `${CHARACTER_SEMANTIC_MASK_LABELS[mask]} 영역이 현재 시점에서 보이지 않습니다.`,
    );
  }

  return { passes, skipped };
}

/* -------------------------------------------------------------------------- */
/* PSD assembly                                                                */
/* -------------------------------------------------------------------------- */

/** Capture the passes and assemble the PSD in one call — what the output dock invokes. */
export async function exportCharacterSemanticPsd(
  input: ExportCharacterSemanticPsdInput,
  dependencies: CharacterSemanticCaptureDependencies & { readonly assemblePsd?: typeof assembleCharacterPsdInWorker } = DEFAULT_DEPENDENCIES,
): Promise<CharacterSemanticPsdResult> {
  const { passes, skipped } = await captureCharacterSemanticPasses(input, dependencies);
  if (input.signal?.aborted) throw abortError();
  input.assertCurrent?.();
  validateCharacterPsdPasses(passes, skipped, input.title);
  input.onCaptured?.();
  if (input.signal?.aborted) throw abortError();
  input.assertCurrent?.();
  const result = await (dependencies.assemblePsd ?? assembleCharacterPsdInWorker)(passes, skipped, {
    title: input.title, signal: input.signal, timeoutMs: input.timeoutMs,
    // Only the native capture dependency creates storage owned exclusively by this export.
    ownership: dependencies === DEFAULT_DEPENDENCIES ? "transfer" : "copy",
  });
  if (input.signal?.aborted) throw abortError();
  input.assertCurrent?.();
  return result;
}
