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
import { buildNavigationRoute, navigationBuildSettings } from "./specialist-navigation-path";
import { addNavigationRoutePreview } from "./specialist-navigation-preview";
import type { WebIO } from "@gltf-transform/core";

export { validateNavigationEndpoints } from "./specialist-navigation-path";

export async function processNavigation(
  io: WebIO,
  source: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "navigation" }>,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const settings = navigationBuildSettings(options);
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
    settings,
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
    const route = buildNavigationRoute(query, options);
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
    let routePreview: SpecialistArtifact;
    try {
      geometry.computeVertexNormals();
      const previewDocument = geometryDocument(geometry, "Walkable surface");
      preview = await glbArtifact(io, previewDocument, "navmesh.glb");
      addNavigationRoutePreview(previewDocument, route, cs);
      routePreview = await glbArtifact(io, previewDocument, "navigation-route.glb");
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
          ...route,
          buildSettings: settings,
          effectiveAgent: {
            minimumClearanceMeters: settings.walkableHeight * ch,
            radiusMeters: settings.walkableRadius * cs,
            maximumStepMeters: settings.walkableClimb * ch,
            maximumSlopeDegrees: settings.walkableSlopeAngle,
          },
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
        routePreview,
      ],
      warnings: [
        "Clearance/radius round up to cells; maximum step rounds down. The separate route preview uses a display offset. JSON route length is corner-polyline length, not sampled terrain motion.",
        "Navigation is an exported static derivative, not live crowd simulation or multiplayer movement authority. Source geometry must use meters and Y-up.",
      ],
    };
  } finally {
    query?.destroy();
    if (generated.success) generated.navMesh.destroy();
    Raw.destroy(generated.intermediates.buildContext.raw);
  }
}
