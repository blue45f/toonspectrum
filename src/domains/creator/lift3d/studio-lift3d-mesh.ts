/**
 * Studio Lift 3D — 마스크와 깊이장을 실제 편집 가능 메시로 굳히는 단계.
 *
 * 두 가지 위상을 만든다.
 *
 * - `inflate`: 앞껍질 + 뒤껍질. 실루엣 테두리 정점은 **하나를 공유**해서 두 껍질이 그 선에서
 *   자동으로 봉합된다. 별도 옆벽(rim wall)을 세우지 않으므로 두께 0 인 퇴화 사각형이 생기지
 *   않고, 결과가 곧바로 닫힌 solid 가 된다.
 * - `relief`: 변위된 앞면 + 평평한 뒷판 + 두 면을 잇는 옆벽. 배경 원화처럼 뒤가 보이지 않는
 *   부조에 쓴다.
 *
 * 결과 메시는 저장소의 정식 편집 권위 포맷(`StudioEditableMesh`)이라 DCC 편집·GLB 내보내기·
 * 기존 진단 도구를 그대로 태울 수 있다.
 */

import {
  STUDIO_EDITABLE_MESH_LIMITS,
  createStudioEditableMeshFromPolygons,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";

import {
  studioLift3dFailure,
  studioLift3dSuccess,
  studioLift3dWarning,
  type StudioLift3dGeometryMode,
  type StudioLift3dResult,
  type StudioLift3dUv,
  type StudioLift3dVec3,
  type StudioLift3dWarning,
} from "./studio-lift3d-contract";

import type { StudioLift3dDepthField } from "./studio-lift3d-depth";
import type { StudioLift3dMask } from "./studio-lift3d-mask";

/** 내부 정점의 최소 두께 비율. 0 이면 앞뒤 껍질이 겹쳐 부피가 사라진다. */
const MIN_INTERIOR_HEIGHT = 0.05;

export interface StudioLift3dGeometryOptions {
  readonly mode: StudioLift3dGeometryMode;
  /** 피사체 최대 변 대비 두께 비율(0..1). inflate 에서는 전체 두께, relief 에서는 돌출 깊이. */
  readonly depthScale: number;
  /** relief 뒷판 두께(같은 비율 기준). */
  readonly baseScale?: number;
  /** 완성 모델의 세로 높이(scene unit). 캐릭터 1.7 = 사람 키. */
  readonly targetHeight: number;
}

export interface StudioLift3dGeometry {
  readonly mesh: StudioEditableMesh;
  /** `mesh.vertices` 와 인덱스가 1:1 로 맞는 UV. 원화가 그대로 베이스컬러가 된다. */
  readonly uvs: readonly StudioLift3dUv[];
  readonly bounds: { readonly min: StudioLift3dVec3; readonly max: StudioLift3dVec3 };
  readonly quadCount: number;
  readonly mode: StudioLift3dGeometryMode;
}

interface FaceGrid {
  readonly present: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly droppedPinches: number;
}

/**
 * 사각형 격자를 세우고, 대각선으로만 이어진 꼬집힘(pinch)을 없앤다.
 *
 * 정점 하나를 사이에 두고 대각 방향 두 사각형만 존재하면 그 정점 주변 면이 두 개의 팬으로
 * 갈라져 non-manifold 가 된다. glTF 로는 나가지만 CSG·섭디비전·법선 계산이 전부 어긋나므로
 * 한 쪽 면을 떨어뜨려 위상을 지킨다.
 */
function buildFaceGrid(mask: StudioLift3dMask): FaceGrid {
  const width = mask.width - 1;
  const height = mask.height - 1;
  const present = new Uint8Array(Math.max(0, width * height));
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const a = mask.cells[j * mask.width + i]!;
      const b = mask.cells[j * mask.width + i + 1]!;
      const c = mask.cells[(j + 1) * mask.width + i + 1]!;
      const d = mask.cells[(j + 1) * mask.width + i]!;
      present[j * width + i] = a === 1 && b === 1 && c === 1 && d === 1 ? 1 : 0;
    }
  }
  let droppedPinches = 0;
  for (let y = 1; y < mask.height - 1; y += 1) {
    for (let x = 1; x < mask.width - 1; x += 1) {
      const nw = present[(y - 1) * width + (x - 1)]!;
      const ne = present[(y - 1) * width + x]!;
      const sw = present[y * width + (x - 1)]!;
      const se = present[y * width + x]!;
      if (nw === 1 && se === 1 && ne === 0 && sw === 0) {
        present[y * width + x] = 0;
        droppedPinches += 1;
      } else if (ne === 1 && sw === 1 && nw === 0 && se === 0) {
        present[y * width + (x - 1)] = 0;
        droppedPinches += 1;
      }
    }
  }
  return { present, width, height, droppedPinches };
}

/** 정점이 속한 사각형 개수. 4 면 내부, 1~3 이면 껍질 경계, 0 이면 미사용. */
function faceDegree(grid: FaceGrid, x: number, y: number): number {
  let degree = 0;
  const has = (i: number, j: number): boolean => (
    i >= 0 && j >= 0 && i < grid.width && j < grid.height && grid.present[j * grid.width + i] === 1
  );
  if (has(x - 1, y - 1)) degree += 1;
  if (has(x, y - 1)) degree += 1;
  if (has(x - 1, y)) degree += 1;
  if (has(x, y)) degree += 1;
  return degree;
}

interface Accumulator {
  readonly positions: StudioLift3dVec3[];
  readonly uvs: StudioLift3dUv[];
  readonly faces: number[][];
}

function pushVertex(
  accumulator: Accumulator,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
): number {
  accumulator.positions.push({ x, y, z });
  accumulator.uvs.push({ u, v });
  return accumulator.positions.length - 1;
}

function estimatedVertexBudget(mask: StudioLift3dMask): number {
  let inside = 0;
  for (let index = 0; index < mask.cells.length; index += 1) inside += mask.cells[index]!;
  return inside * 2;
}

/**
 * 마스크·깊이장을 삼각형화 이전의 사각형 메시로 굳힌다.
 *
 * 좌표계: 이미지 x 는 월드 +X, 이미지 y 는 월드 −Y(위가 +Y), 두께는 ±Z.
 * 앞면 사각형은 +Z 에서 봤을 때 CCW 가 되도록 감는다.
 */
export function buildStudioLift3dGeometry(
  mask: StudioLift3dMask,
  depth: StudioLift3dDepthField,
  options: StudioLift3dGeometryOptions,
): StudioLift3dResult<StudioLift3dGeometry> {
  if (mask.bounds === null) {
    return studioLift3dFailure("empty-subject", "실루엣을 찾지 못했습니다");
  }
  if (!Number.isFinite(options.targetHeight) || options.targetHeight <= 0) {
    return studioLift3dFailure("invalid-option", "targetHeight 는 양수여야 합니다");
  }
  if (estimatedVertexBudget(mask) > STUDIO_EDITABLE_MESH_LIMITS.maxVertices) {
    return studioLift3dFailure("budget-exceeded", "해상도를 낮춰 주세요(정점 예산 초과)");
  }

  const warnings: StudioLift3dWarning[] = [];
  const grid = buildFaceGrid(mask);
  if (grid.droppedPinches > 0) {
    warnings.push(studioLift3dWarning(
      "pinch-faces-dropped",
      `위상이 꼬이는 대각 연결 ${grid.droppedPinches}곳을 정리했습니다`,
    ));
  }

  const gridWidth = mask.width;
  const gridHeight = mask.height;
  const spanX = Math.max(1, mask.bounds.maxX - mask.bounds.minX);
  const spanY = Math.max(1, mask.bounds.maxY - mask.bounds.minY);
  const thickness = Math.max(spanX, spanY) * Math.max(0, options.depthScale);
  const baseThickness = Math.max(spanX, spanY) * Math.max(0, options.baseScale ?? 0.05);
  const uScale = 1 / Math.max(1, gridWidth - 1);
  const vScale = 1 / Math.max(1, gridHeight - 1);
  const centerX = (gridWidth - 1) / 2;
  const centerY = (gridHeight - 1) / 2;

  const accumulator: Accumulator = { positions: [], uvs: [], faces: [] };
  const frontIndex = new Int32Array(gridWidth * gridHeight).fill(-1);
  const backIndex = new Int32Array(gridWidth * gridHeight).fill(-1);
  let interiorCount = 0;

  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const key = y * gridWidth + x;
      const degree = faceDegree(grid, x, y);
      if (degree === 0) continue;
      const worldX = x - centerX;
      const worldY = centerY - y;
      const u = x * uScale;
      const v = y * vScale;
      const rim = degree < 4;
      if (!rim) interiorCount += 1;

      if (options.mode === "inflate") {
        const half = rim
          ? 0
          : (thickness / 2) * Math.max(MIN_INTERIOR_HEIGHT, depth.heights[key]!);
        frontIndex[key] = pushVertex(accumulator, worldX, worldY, half, u, v);
        // 봉합선에서는 앞뒤가 같은 정점을 공유한다 — 여기가 닫힌 solid 를 만드는 지점이다.
        backIndex[key] = rim
          ? frontIndex[key]!
          : pushVertex(accumulator, worldX, worldY, -half, u, v);
      } else {
        frontIndex[key] = pushVertex(
          accumulator,
          worldX,
          worldY,
          thickness * depth.heights[key]!,
          u,
          v,
        );
        backIndex[key] = pushVertex(accumulator, worldX, worldY, -baseThickness, u, v);
      }
    }
  }

  if (options.mode === "inflate" && interiorCount === 0) {
    return studioLift3dFailure(
      "degenerate-geometry",
      "피사체가 너무 얇아 부피를 만들 수 없습니다. 해상도를 올리거나 원화를 확대해 보세요",
    );
  }

  const corner = (x: number, y: number): number => y * gridWidth + x;
  let quadCount = 0;
  for (let j = 0; j < grid.height; j += 1) {
    for (let i = 0; i < grid.width; i += 1) {
      if (grid.present[j * grid.width + i] === 0) continue;
      const a = corner(i, j);
      const b = corner(i + 1, j);
      const c = corner(i + 1, j + 1);
      const d = corner(i, j + 1);
      // +Z 에서 봤을 때 CCW: 좌상 → 좌하 → 우하 → 우상.
      accumulator.faces.push([frontIndex[a]!, frontIndex[d]!, frontIndex[c]!, frontIndex[b]!]);
      // 뒷면은 −Z 를 향해야 하므로 같은 루프를 뒤집는다.
      accumulator.faces.push([backIndex[a]!, backIndex[b]!, backIndex[c]!, backIndex[d]!]);
      quadCount += 2;
    }
  }

  if (options.mode === "relief") {
    const hasFace = (i: number, j: number): boolean => (
      i >= 0 && j >= 0 && i < grid.width && j < grid.height && grid.present[j * grid.width + i] === 1
    );
    for (let j = 0; j < grid.height; j += 1) {
      for (let i = 0; i < grid.width; i += 1) {
        if (grid.present[j * grid.width + i] === 0) continue;
        const a = corner(i, j);
        const b = corner(i + 1, j);
        const c = corner(i + 1, j + 1);
        const d = corner(i, j + 1);
        // 앞면 CCW 루프(a→d→c→b)의 각 변과, 그 변 너머 이웃 사각형.
        const edges: readonly (readonly [number, number, boolean])[] = [
          [a, d, hasFace(i - 1, j)],
          [d, c, hasFace(i, j + 1)],
          [c, b, hasFace(i + 1, j)],
          [b, a, hasFace(i, j - 1)],
        ];
        for (const [from, to, shared] of edges) {
          if (shared) continue;
          // 바깥을 향하도록: 앞(from) → 뒤(from) → 뒤(to) → 앞(to).
          accumulator.faces.push([
            frontIndex[from]!,
            backIndex[from]!,
            backIndex[to]!,
            frontIndex[to]!,
          ]);
          quadCount += 1;
        }
      }
    }
  }

  if (accumulator.faces.length === 0) {
    return studioLift3dFailure("degenerate-geometry", "면을 하나도 만들지 못했습니다");
  }
  if (accumulator.faces.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) {
    return studioLift3dFailure("budget-exceeded", "해상도를 낮춰 주세요(면 예산 초과)");
  }

  const scaled = normalizeStudioLift3dPositions(accumulator.positions, options.targetHeight);
  const mesh = createStudioEditableMeshFromPolygons(scaled.positions, accumulator.faces);

  return studioLift3dSuccess(
    {
      mesh,
      uvs: Object.freeze([...accumulator.uvs]),
      bounds: scaled.bounds,
      quadCount,
      mode: options.mode,
    },
    warnings,
  );
}

/**
 * 모델을 요청한 키에 맞춰 균일 스케일하고, XZ 중심·바닥(y=0) 기준으로 옮긴다.
 * bg3d 씬은 지면 위에 놓인 모델을 전제하므로 여기서 접지시켜 두면 배치가 곧바로 맞는다.
 */
export function normalizeStudioLift3dPositions(
  positions: readonly StudioLift3dVec3[],
  targetHeight: number,
): {
  readonly positions: readonly StudioLift3dVec3[];
  readonly bounds: { readonly min: StudioLift3dVec3; readonly max: StudioLift3dVec3 };
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    if (position.x < minX) minX = position.x;
    if (position.y < minY) minY = position.y;
    if (position.z < minZ) minZ = position.z;
    if (position.x > maxX) maxX = position.x;
    if (position.y > maxY) maxY = position.y;
    if (position.z > maxZ) maxZ = position.z;
  }
  const extentY = maxY - minY;
  const scale = extentY > 1e-9 ? targetHeight / extentY : 1;
  const offsetX = (minX + maxX) / 2;
  const offsetZ = (minZ + maxZ) / 2;
  const moved = positions.map((position) => ({
    x: (position.x - offsetX) * scale,
    y: (position.y - minY) * scale,
    z: (position.z - offsetZ) * scale,
  }));
  return {
    positions: moved,
    bounds: {
      min: { x: (minX - offsetX) * scale, y: 0, z: (minZ - offsetZ) * scale },
      max: { x: (maxX - offsetX) * scale, y: extentY * scale, z: (maxZ - offsetZ) * scale },
    },
  };
}
