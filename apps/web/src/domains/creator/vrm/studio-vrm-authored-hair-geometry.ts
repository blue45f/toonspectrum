import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

export type StudioVrmAuthoredHairInstance = Readonly<{
  part: AvatarForgeHairPart;
  matrix: THREE.Matrix4;
}>;

const RADIAL_SEGMENTS = 28;
const CAP_HEIGHT_SEGMENTS = 18;
const CLUMP_LENGTH_SEGMENTS = 24;
const CLUMP_CROSS_SEGMENTS = 8;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolvedShadow(part: AvatarForgeHairPart): THREE.Color {
  const explicit = part.shadowColor;
  if (explicit) return new THREE.Color(explicit);
  return new THREE.Color(part.baseColor).lerp(new THREE.Color("#090708"), 0.48);
}

function resolvedHighlight(part: AvatarForgeHairPart): THREE.Color {
  return new THREE.Color(part.tipColor).lerp(
    new THREE.Color("#fff8f1"),
    0.16 + clamp01(part.shine) * 0.28,
  );
}

function paletteColor(
  part: AvatarForgeHairPart,
  t: number,
  cross: number,
  back = false,
): THREE.Color {
  const base = new THREE.Color(part.baseColor).lerp(new THREE.Color(part.tipColor), t * 0.58);
  const shadow = resolvedShadow(part);
  const highlight = resolvedHighlight(part);
  const edge = Math.pow(Math.abs(cross), 1.35);
  const ridge = Math.pow(1 - Math.abs(cross), 2.2);
  base.lerp(shadow, clamp01(edge * 0.52 + (back ? 0.22 : 0)));
  if (!back) base.lerp(highlight, ridge * (0.08 + clamp01(part.shine) * 0.32));
  return base;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function safeAspect(longAxis: number, crossAxis: number): number {
  const safeLongAxis = Number.isFinite(longAxis) ? Math.abs(longAxis) : 1;
  const safeCrossAxis = Number.isFinite(crossAxis) ? Math.abs(crossAxis) : 1;
  const ratio = safeLongAxis / Math.max(1e-4, safeCrossAxis);
  return Math.sqrt(Math.min(5, Math.max(1, ratio)));
}

/**
 * Head-local clump centre line. The root is pinned to the authored transform and wave amplitude is
 * bounded independently of a very thin/tall part's raw aspect ratio. This keeps style switches from
 * throwing bangs and side locks far away from the skull while retaining visible curl near the tips.
 */
export function resolveStudioVrmAuthoredHairClumpCenter(
  part: AvatarForgeHairPart,
  t: number,
): readonly [number, number] {
  const progress = clamp01(Number.isFinite(t) ? t : 0);
  const curl = Math.min(1.25, Math.max(-1.25, Number.isFinite(part.curl) ? part.curl : 0));
  const waveAmount = Math.min(1, Math.max(-1, Number.isFinite(part.wave) ? (part.wave ?? 0) : 0));
  const waveFrequency = Math.min(6, Math.max(0.5, Number.isFinite(part.waveFrequency)
    ? (part.waveFrequency ?? 2.4)
    : 2.4));
  const aspectX = safeAspect(part.scale[1], part.scale[0]);
  const aspectZ = safeAspect(part.scale[1], part.scale[2]);
  const rootEase = smoothstep(0, 0.24, progress);
  const bodyEnvelope = rootEase * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * progress), 0.72));

  const curveX = Math.sin(progress * Math.PI * 1.72) * curl * 0.31 * rootEase
    + Math.sin(progress * Math.PI * waveFrequency) * waveAmount * 0.072 * aspectX * bodyEnvelope;
  const curveZ = Math.sin(progress * Math.PI) * curl * 0.18 * rootEase
    + (Math.cos(progress * Math.PI * waveFrequency) - 1)
      * waveAmount
      * 0.032
      * aspectZ
      * bodyEnvelope;
  return [curveX, curveZ];
}

function clumpWidth(t: number, taper: number): number {
  const root = 0.76 + 0.24 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5);
  const tip = Math.pow(Math.max(0, 1 - t), 0.62 + taper * 0.42);
  return Math.max(0.018, root * tip);
}

/**
 * A faceted, tapered, closed hair clump. Unlike the legacy radial capsule, this geometry has a
 * broad graphic face, a shallow back, a highlighted centre ridge, and a near-zero-width tip.
 */
export function createStudioVrmAuthoredHairClumpGeometry(
  part: AvatarForgeHairPart,
): THREE.BufferGeometry {
  const columns = CLUMP_CROSS_SEGMENTS + 1;
  const rows = CLUMP_LENGTH_SEGMENTS + 1;
  const layerStride = rows * columns;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const back of [false, true]) {
    for (let row = 0; row < rows; row += 1) {
      const t = row / CLUMP_LENGTH_SEGMENTS;
      const y = 1 - t * 2;
      const width = clumpWidth(t, part.taper);
      const depth = width * (0.16 + 0.10 * (1 - t));
      const [centerX, centerZ] = resolveStudioVrmAuthoredHairClumpCenter(part, t);
      for (let column = 0; column < columns; column += 1) {
        const u = column / CLUMP_CROSS_SEGMENTS;
        const cross = u * 2 - 1;
        const crown = Math.pow(Math.max(0, 1 - cross * cross), 0.72);
        const z = centerZ + (back ? -depth * 0.42 : depth) * crown;
        positions.push(centerX + cross * width, y, z);
        const color = paletteColor(part, t, cross, back);
        colors.push(color.r, color.g, color.b);
        uvs.push(u, t);
      }
    }
  }

  for (let row = 0; row < CLUMP_LENGTH_SEGMENTS; row += 1) {
    for (let column = 0; column < CLUMP_CROSS_SEGMENTS; column += 1) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);

      const backOffset = layerStride;
      const ba = backOffset + a;
      const bb = backOffset + b;
      const bc = backOffset + c;
      const bd = backOffset + d;
      indices.push(ba, bb, bc, bb, bd, bc);
    }
  }

  const connectEdge = (column: number, reverse: boolean) => {
    for (let row = 0; row < CLUMP_LENGTH_SEGMENTS; row += 1) {
      const frontA = row * columns + column;
      const frontB = (row + 1) * columns + column;
      const backA = layerStride + frontA;
      const backB = layerStride + frontB;
      if (reverse) indices.push(frontA, backA, frontB, frontB, backA, backB);
      else indices.push(frontA, frontB, backA, frontB, backB, backA);
    }
  };
  connectEdge(0, true);
  connectEdge(CLUMP_CROSS_SEGMENTS, false);

  for (const row of [0, CLUMP_LENGTH_SEGMENTS]) {
    for (let column = 0; column < CLUMP_CROSS_SEGMENTS; column += 1) {
      const frontA = row * columns + column;
      const frontB = frontA + 1;
      const backA = layerStride + frontA;
      const backB = backA + 1;
      if (row === 0) indices.push(frontA, frontB, backA, frontB, backB, backA);
      else indices.push(frontA, backA, frontB, frontB, backA, backB);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function setShellColors(geometry: THREE.BufferGeometry, part: AvatarForgeHairPart): void {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const box = geometry.boundingBox;
  if (!position || !box) return;
  const height = Math.max(1e-5, box.max.y - box.min.y);
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const t = clamp01((box.max.y - position.getY(index)) / height);
    const cross = position.getX(index) / Math.max(1e-5, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)));
    const front = normal ? Math.max(0, normal.getZ(index)) : 0.5;
    const color = paletteColor(part, t * 0.55, cross, front < 0.1);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createShellGeometry(part: AvatarForgeHairPart): THREE.BufferGeometry {
  const geometry = part.role === "cap"
    ? new THREE.SphereGeometry(1, RADIAL_SEGMENTS, CAP_HEIGHT_SEGMENTS, 0, Math.PI * 2, 0, Math.PI * 0.72)
    : new THREE.SphereGeometry(1, 28, 20);
  setShellColors(geometry, part);
  return geometry;
}

export function createStudioVrmAuthoredHairGeometry(
  part: AvatarForgeHairPart,
): THREE.BufferGeometry {
  return part.primitive === "tapered-capsule"
    ? createStudioVrmAuthoredHairClumpGeometry(part)
    : createShellGeometry(part);
}

/** Bakes every authored clump into one head-local buffer, reducing a style to two draw calls. */
export function mergeStudioVrmAuthoredHairGeometry(
  instances: readonly StudioVrmAuthoredHairInstance[],
): THREE.BufferGeometry | null {
  const geometries = instances.map(({ part, matrix }) => {
    const geometry = createStudioVrmAuthoredHairGeometry(part);
    geometry.applyMatrix4(matrix);
    return geometry;
  });
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createStudioVrmAuthoredHairGradientTexture(): THREE.DataTexture {
  const data = new Uint8Array([
    64, 64, 64, 255,
    124, 124, 124, 255,
    194, 194, 194, 255,
    244, 244, 244, 255,
  ]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
