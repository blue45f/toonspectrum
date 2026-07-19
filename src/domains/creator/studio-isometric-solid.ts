import type { DrawEl } from "./studio-element-model";

/**
 * Editable isometric primitive generation.
 *
 * This deliberately produces ordinary Studio draw elements instead of a private 3D payload. Each
 * visible face can therefore be recoloured, node-edited, duplicated and exported by the existing
 * document pipeline. It is a drafting primitive, not a hidden perspective renderer.
 */

export interface StudioIsometricPoint3 {
  x: number;
  y: number;
  z: number;
}
export interface StudioIsometricPoint2 {
  x: number;
  y: number;
}

export interface StudioIsometricSolidInput {
  originX: number;
  originY: number;
  angleDeg: number;
  width: number;
  depth: number;
  height: number;
}

export type StudioIsometricFaceId = "left" | "right" | "top";

export interface StudioIsometricSolidFace {
  id: StudioIsometricFaceId;
  points: readonly [
    StudioIsometricPoint2,
    StudioIsometricPoint2,
    StudioIsometricPoint2,
    StudioIsometricPoint2,
  ];
}

export interface StudioIsometricSolidPlan {
  input: StudioIsometricSolidInput;
  vertices: Readonly<Record<
    "origin" | "x" | "y" | "xy" | "z" | "xz" | "yz" | "xyz",
    StudioIsometricPoint2
  >>;
  faces: readonly [StudioIsometricSolidFace, StudioIsometricSolidFace, StudioIsometricSolidFace];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface StudioIsometricSolidElementOptions {
  ids: readonly [string, string, string];
  baseColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  namePrefix?: string;
}

const MIN_ANGLE_DEG = 1;
const MAX_ANGLE_DEG = 89;
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 1_000_000;
const MAX_COORDINATE = 10_000_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coordinate(value: unknown): number {
  return clamp(finite(value, 0), -MAX_COORDINATE, MAX_COORDINATE);
}

function dimension(value: unknown): number {
  return clamp(Math.abs(finite(value, MIN_DIMENSION)), MIN_DIMENSION, MAX_DIMENSION);
}

export function normalizeStudioIsometricSolidInput(
  input: StudioIsometricSolidInput
): StudioIsometricSolidInput {
  return {
    originX: coordinate(input.originX),
    originY: coordinate(input.originY),
    angleDeg: clamp(finite(input.angleDeg, 30), MIN_ANGLE_DEG, MAX_ANGLE_DEG),
    width: dimension(input.width),
    depth: dimension(input.depth),
    height: dimension(input.height),
  };
}

/** Projects drafting-space x/y/depth and z/height onto the Studio canvas. */
export function projectStudioIsometricPoint(
  point: StudioIsometricPoint3,
  input: Pick<StudioIsometricSolidInput, "originX" | "originY" | "angleDeg">
): StudioIsometricPoint2 {
  const safeOriginX = coordinate(input.originX);
  const safeOriginY = coordinate(input.originY);
  const angle = clamp(finite(input.angleDeg, 30), MIN_ANGLE_DEG, MAX_ANGLE_DEG)
    * Math.PI / 180;
  const x = coordinate(point.x);
  const depth = coordinate(point.y);
  const z = coordinate(point.z);
  return {
    x: safeOriginX + (x - depth) * Math.cos(angle),
    y: safeOriginY + (x + depth) * Math.sin(angle) - z,
  };
}

export function planStudioIsometricSolid(
  input: StudioIsometricSolidInput
): StudioIsometricSolidPlan {
  const safe = normalizeStudioIsometricSolidInput(input);
  const project = (x: number, y: number, z: number) => projectStudioIsometricPoint(
    { x, y, z },
    safe
  );
  const vertices = {
    origin: project(0, 0, 0),
    x: project(safe.width, 0, 0),
    y: project(0, safe.depth, 0),
    xy: project(safe.width, safe.depth, 0),
    z: project(0, 0, safe.height),
    xz: project(safe.width, 0, safe.height),
    yz: project(0, safe.depth, safe.height),
    xyz: project(safe.width, safe.depth, safe.height),
  } as const;

  // Far faces are intentionally omitted: the output is the three visible drafting faces.
  const faces = [
    { id: "left", points: [vertices.origin, vertices.y, vertices.yz, vertices.z] },
    { id: "right", points: [vertices.origin, vertices.z, vertices.xz, vertices.x] },
    { id: "top", points: [vertices.z, vertices.yz, vertices.xyz, vertices.xz] },
  ] as const satisfies readonly StudioIsometricSolidFace[];
  const all = Object.values(vertices);
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    input: safe,
    vertices,
    faces,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

function parseHexColor(value: string): [number, number, number] {
  const source = value.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(source);
  if (short) {
    return short.slice(1).map((part) => Number.parseInt(`${part}${part}`, 16)) as [number, number, number];
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(source);
  if (!full) return [99, 102, 241];
  return full.slice(1).map((part) => Number.parseInt(part, 16)) as [number, number, number];
}

function shadeHexColor(value: string, amount: number): string {
  const channels = parseHexColor(value).map((channel) => (
    Math.round(clamp(channel + (amount >= 0 ? 255 - channel : channel) * amount, 0, 255))
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Converts the three visible faces into ordinary closed, filled vector paths. */
export function createStudioIsometricSolidElements(
  plan: StudioIsometricSolidPlan,
  options: StudioIsometricSolidElementOptions
): DrawEl[] {
  const strokeWidth = clamp(finite(options.strokeWidth, 2), 0.25, 256);
  const opacity = clamp(finite(options.opacity, 1), 0, 1);
  const namePrefix = options.namePrefix?.trim() || "아이소메트릭 상자";
  const fills: Record<StudioIsometricFaceId, string> = {
    left: shadeHexColor(options.baseColor, -0.2),
    right: shadeHexColor(options.baseColor, -0.08),
    top: shadeHexColor(options.baseColor, 0.22),
  };
  const labels: Record<StudioIsometricFaceId, string> = {
    left: "왼쪽 면",
    right: "오른쪽 면",
    top: "윗면",
  };
  return plan.faces.map((face, index) => ({
    id: options.ids[index],
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: face.points.flatMap(({ x, y }) => [x, y]),
    stroke: options.strokeColor ?? shadeHexColor(options.baseColor, -0.52),
    strokeWidth,
    opacity,
    fill: fills[face.id],
    // Marks the path as an authored, already-clean vector. Canvas must not re-smooth its corners.
    sampleSpacing: 1,
    name: `${namePrefix} · ${labels[face.id]}`,
  }));
}
