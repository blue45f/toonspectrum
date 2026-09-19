import { BufferAttribute, BufferGeometry, Box3, Vector3 } from "three";
import {
  init,
  NavMeshQuery,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
  Raw,
} from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import { extractStaticGeometry, geometryDocument } from "./specialist-geometry";
import { glbArtifact, readSpecialistDocument, sha256 } from "./specialist-gltf";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";
import type { WebIO } from "@gltf-transform/core";

export async function processNavigation(
  io: WebIO,
  source: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "navigation" }>,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const document = await readSpecialistDocument(io, source);
  const geometries = await extractStaticGeometry(document);
  const positions: number[] = [];
  const indices: number[] = [];
  const bounds = new Box3();
  const point = new Vector3();
  try {
    for (const geometry of geometries) {
      const position = geometry.getAttribute("position");
      const offset = positions.length / 3;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        positions.push(point.x, point.y, point.z);
        bounds.expandByPoint(point);
      }
      for (let i = 0; i < geometry.index!.count; i++)
        indices.push(offset + geometry.index!.getX(i));
    }
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
  }
  const size = bounds.getSize(new Vector3());
  const cs = options.cellSize;
  const ch = cs / 2;
  if (
    Math.ceil(size.x / cs) * Math.ceil(size.z / cs) >
      SPECIALIST_LIMITS.navCells ||
    size.y / ch > 65500
  )
    throw new SpecialistError(
      "budget",
      "Navigation voxel grid exceeds the memory budget. Increase cell size.",
    );
  await init();
  const generated = generateSoloNavMesh(
    positions,
    indices,
    {
      cs,
      ch,
      walkableHeight: Math.ceil(options.agentHeight / ch),
      walkableRadius: Math.ceil(options.agentRadius / cs),
      walkableClimb: Math.floor(0.3 / ch),
      walkableSlopeAngle: 45,
      minRegionArea: 0,
      mergeRegionArea: 0,
    },
    false,
  );
  let query: NavMeshQuery | undefined;
  try {
    if (!generated.success)
      throw new SpecialistError(
        "runtime",
        "NavMesh generation failed: " + generated.error,
      );
    query = new NavMeshQuery(generated.navMesh);
    const vector = (p: readonly number[]) => ({ x: p[0]!, y: p[1]!, z: p[2]! });
    const endpointTolerance = {
      horizontal: Math.max(0.1, cs * 2),
      vertical: Math.max(0.1, ch * 2),
    };
    const projection = {
      halfExtents: { x: cs * 2, y: options.agentHeight, z: cs * 2 },
    };
    const projectedStart = query.findClosestPoint(
      vector(options.start),
      projection,
    );
    const projectedEnd = query.findClosestPoint(
      vector(options.end),
      projection,
    );
    if (!projectedStart.success || !projectedEnd.success)
      throw new SpecialistError(
        "runtime",
        "Navigation endpoints are outside the walkable surface.",
      );
    validateNavigationEndpoints(
      [projectedStart.point, projectedEnd.point],
      options.start,
      options.end,
      endpointTolerance,
    );
    const result = query.computePath(projectedStart.point, projectedEnd.point, {
      halfExtents: { x: cs * 2, y: options.agentHeight, z: cs * 2 },
      maxPathPolys: 2048,
      maxStraightPathPoints: 2048,
    });
    if (!result.success || result.path.length < 2)
      throw new SpecialistError(
        "runtime",
        "No path connects the requested positions on this walkable surface.",
      );
    validateNavigationEndpoints(
      result.path,
      options.start,
      options.end,
      endpointTolerance,
    );
    const [navPositions, navIndices] = getNavMeshPositionsAndIndices(
      generated.navMesh,
    );
    const geometry = new BufferGeometry()
      .setAttribute(
        "position",
        new BufferAttribute(new Float32Array(navPositions), 3),
      )
      .setIndex(new BufferAttribute(new Uint32Array(navIndices), 1));
    let preview: SpecialistArtifact;
    try {
      geometry.computeVertexNormals();
      preview = await glbArtifact(
        io,
        geometryDocument(geometry, "Walkable surface"),
        "navmesh.glb",
      );
    } finally {
      geometry.dispose();
    }
    const binary = new Uint8Array(exportNavMesh(generated.navMesh));
    const path = new TextEncoder().encode(
      JSON.stringify(
        {
          version: 1,
          coordinates: "meter/right/Y/-Z",
          options,
          path: result.path,
          endpointTolerance,
          sourceSha256: sha256(source),
        },
        null,
        2,
      ),
    );
    return {
      artifacts: [
        preview,
        {
          name: "navmesh.bin",
          mime: "application/octet-stream",
          bytes: binary,
          sha256: sha256(binary),
        },
        {
          name: "navigation-path.json",
          mime: "application/json",
          bytes: path,
          sha256: sha256(path),
        },
      ],
      warnings: [
        "Navigation is an exported static derivative, not live crowd simulation or multiplayer movement authority. Source geometry must use meters and Y-up.",
      ],
    };
  } finally {
    query?.destroy();
    if (generated.success) generated.navMesh.destroy();
    Raw.destroy(generated.intermediates.buildContext.raw);
  }
}

/** Detour may snap to a nearby polygon; never silently route on a different floor. */
export function validateNavigationEndpoints(
  route: readonly { x: number; y: number; z: number }[],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  tolerance: { horizontal: number; vertical: number },
): void {
  for (const [actual, requested, label] of [
    [route[0], start, "start"],
    [route.at(-1), end, "end"],
  ] as const) {
    if (
      !actual ||
      ![actual.x, actual.y, actual.z].every(Number.isFinite) ||
      Math.hypot(actual.x - requested[0], actual.z - requested[2]) >
        tolerance.horizontal ||
      Math.abs(actual.y - requested[1]) > tolerance.vertical
    ) {
      throw new SpecialistError(
        "runtime",
        `Navigation ${label} is outside the allowed XYZ projection tolerance; select the intended walkable surface.`,
      );
    }
  }
}
