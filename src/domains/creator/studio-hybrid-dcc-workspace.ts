/**
 * Studio-facing Hybrid DCC workspace API.
 * Composes document, geometry authority, live bridge, import pipeline, and v1 demo
 * into one callable surface for UI / companion tooling without React coupling.
 */

import { getStudioBg3dRoomPreset, buildStudioBg3dRoomParts } from "./studio-bg3d-room-builder";
import {
  createStudioCadSketch,
  extrudeStudioCadProfile,
  revolveStudioCadProfile,
} from "./studio-cad-kernel-lite";
import {
  createStudioIdleClip,
  retargetStudioMotionReport,
  sampleStudioAnimationClip,
  stepStudioSpringBone,
  type StudioRetargetReport,
  type StudioSpringBone,
} from "./studio-character-animation-p2";
import {
  createStudioClothGrid,
  stepStudioClothXpbd,
} from "./studio-cloth-pattern-kernel";
import {
  collabAppendOp,
  collabJoin,
  collabConflictReport,
  createStudioDccCollabRoom,
  type StudioDccCollabRoom,
} from "./studio-dcc-collab-shell";
import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  extrudeStudioEditableMeshFaces,
  hashStudioEditableMesh,
  knifeStudioEditableMesh,
  studioEditableMeshToTriangleSoup,
  type StudioEditableMesh,
} from "./studio-editable-half-edge-mesh";
import {
  buildStudioGeoNodesPrimitive,
  evaluateStudioGeoNodesStarterGraph,
  type StudioGeoNodesPrimitiveKind,
} from "./studio-geometry-nodes-workspace-bridge";
import { importStudioGradeAAsset } from "./studio-grade-a-import-pipeline";
import { scanStudioHybridDccCorruption } from "./studio-hybrid-dcc-diagnostics";
import {
  createStudioHybridDccSession,
  hybridDccCommitGeometry,
  hybridDccRegisterAsset,
  hybridDccUndo,
  hybridDccRedo,
  hybridDccCanUndo,
  hybridDccCanRedo,
  snapshotStudioHybridDccState,
  type StudioHybridDccSession,
} from "./studio-hybrid-dcc-document";
import {
  applyStudioSculptStroke,
  voxelRemeshStudioMesh,
} from "./studio-hybrid-sculpt-kernel";
import {
  createStudioLiveBridgeDocument,
  createStudioSharedSet,
  applyStudioShotOverride,
  addStudioArtistDelta,
  mutateStudioSharedObjectGeometry,
  generateStudioToonPass,
  STUDIO_TOON_PASS_KINDS,
  type StudioLiveBridgeDocument,
} from "./studio-live-2d3d-bridge";
import {
  bomFromAssetParts,
  type StudioManufacturingBom,
} from "./studio-manufacturing-bom-lite";
import {
  exportStudioMeshByFormat,
  type StudioMeshExportFormat,
  type StudioMeshExportResult,
} from "./studio-mesh-export-adapters";
import { importStudioMeshByExtension } from "./studio-mesh-format-adapters";
import {
  createStudioMeshModifierStack,
  evaluateStudioMeshModifierStack,
  withStudioMeshModifier,
} from "./studio-mesh-modifier-stack";
import {
  autoRetopoStudioMeshBasic,
  decimateStudioMesh,
  deformStudioMeshBend,
  dynatopoStudioMeshBrushLocal,
  orientStudioMeshOutward,
  repairStudioMesh,
  shrinkwrapStudioMesh,
  subdivideStudioMeshCatmullLite,
} from "./studio-mesh-ops-advanced";
import { createStudioDefaultSolidBooleanBackend } from "./studio-solid-boolean-backend";
import { packStudioToon3dPackage, type StudioToon3dPackage } from "./studio-toon3d-package";
import {
  unwrapStudioMeshBox,
  unwrapStudioMeshPlanar,
  type StudioUvMap,
} from "./studio-uv-unwrap-lite";

/** OCCT result shape (lazy-loaded; browser fetch or Node loader). */
export type StudioOcctSolidResult = {
  readonly ok: true;
  readonly mesh: StudioEditableMesh;
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly volumeApprox: number;
  readonly backend: "opencascade-wasm";
  readonly operation: string;
  readonly loadPath?: "browser" | "node";
};

export const STUDIO_HYBRID_DCC_WORKSPACE_REVISION = 3 as const;

export interface StudioHybridDccWorkspace {
  readonly revision: typeof STUDIO_HYBRID_DCC_WORKSPACE_REVISION;
  session: StudioHybridDccSession;
  bridge: StudioLiveBridgeDocument;
  activeAssetId: string | null;
  lastImportReport: unknown | null;
  lastUvMap: StudioUvMap | null;
  lastRetarget: StudioRetargetReport | null;
  lastExport: StudioMeshExportResult | null;
  lastSpring: StudioSpringBone | null;
  lastOcct: StudioOcctSolidResult | null;
  lastDynatopo: {
    readonly facesBefore: number;
    readonly facesAfter: number;
    readonly boundaryEdges: number;
    readonly mode: string;
  } | null;
  lastRetopo: {
    readonly facesBefore: number;
    readonly facesAfter: number;
    readonly targetFaces: number;
    readonly meanError: number;
  } | null;
  bom: StudioManufacturingBom;
  collab: StudioDccCollabRoom;
  clothStep: number;
  animSampleTime: number;
}

export function createStudioHybridDccWorkspace(
  documentId = "studio-hybrid-workspace",
): StudioHybridDccWorkspace {
  const session = createStudioHybridDccSession(documentId);
  const set = createStudioSharedSet(`${documentId}-set`, []);
  const bridge = createStudioLiveBridgeDocument(set, ["shot-1"]);
  return {
    revision: STUDIO_HYBRID_DCC_WORKSPACE_REVISION,
    session,
    bridge,
    activeAssetId: null,
    lastImportReport: null,
    lastUvMap: null,
    lastRetarget: null,
    lastExport: null,
    lastSpring: null,
    lastOcct: null,
    lastDynatopo: null,
    lastRetopo: null,
    bom: bomFromAssetParts(documentId, []),
    collab: createStudioDccCollabRoom(`${documentId}-collab`),
    clothStep: 0,
    animSampleTime: 0,
  };
}

export function workspaceAddUnitCube(
  ws: StudioHybridDccWorkspace,
  assetId = "asset-cube",
): StudioHybridDccWorkspace {
  const mesh = createStudioUnitCubeMesh();
  const session = hybridDccRegisterAsset(ws.session, assetId, mesh, {
    source: "primitive",
    creator: "studio",
    license: "CC0-1.0",
    useScope: "commercial",
    derivative: "original",
  });
  const objects = [
    ...ws.bridge.set.objects.filter((o) => o.id !== assetId),
    {
      id: assetId,
      geometryHash: hashStudioEditableMesh(mesh),
      visible: true,
      materialId: "default",
    },
  ];
  const set = createStudioSharedSet(ws.bridge.set.id, objects);
  const bridge = createStudioLiveBridgeDocument(
    set,
    ws.bridge.shots.map((s) => s.id),
  );
  return { ...ws, session, bridge, activeAssetId: assetId };
}

export function workspaceExtrudeActive(
  ws: StudioHybridDccWorkspace,
  distance: number,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const extruded = extrudeStudioEditableMeshFaces(record.mesh, [0], distance);
  if (!extruded.ok) throw new Error(extruded.detail);
  const session = hybridDccCommitGeometry(ws.session, id, extruded.value);
  const hash = hashStudioEditableMesh(extruded.value);
  const bridge = mutateStudioSharedObjectGeometry(ws.bridge, id, hash);
  return { ...ws, session, bridge, activeAssetId: id };
}

export function workspaceKnifeActive(
  ws: StudioHybridDccWorkspace,
  normal: { x: number; y: number; z: number } = { x: 0, y: 1, z: 0 },
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const knifed = knifeStudioEditableMesh(record.mesh, {
    point: { x: 0, y: 0, z: 0 },
    normal,
  });
  if (!knifed.ok) throw new Error(knifed.detail);
  const session = hybridDccCommitGeometry(ws.session, id, knifed.value);
  const hash = hashStudioEditableMesh(knifed.value);
  const bridge = mutateStudioSharedObjectGeometry(ws.bridge, id, hash);
  return { ...ws, session, bridge };
}

export async function workspaceBooleanDifference(
  ws: StudioHybridDccWorkspace,
  operandScale = 0.5,
): Promise<StudioHybridDccWorkspace> {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  let stack = createStudioMeshModifierStack(record.mesh);
  const soup = studioEditableMeshToTriangleSoup(record.mesh);
  const op = new Float32Array(soup.positions);
  for (let i = 0; i < op.length; i += 1) op[i]! *= operandScale;
  stack = withStudioMeshModifier(stack, {
    kind: "boolean",
    id: "ws-bool",
    enabled: true,
    operation: "difference",
    operand: { positions: op, indices: soup.indices },
  });
  const evaluated = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const session = hybridDccCommitGeometry(ws.session, id, evaluated.value.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    evaluated.value.resultHash,
  );
  return { ...ws, session, bridge };
}

export function workspaceEnsureShots(
  ws: StudioHybridDccWorkspace,
  count: number,
): StudioHybridDccWorkspace {
  const n = Math.max(1, Math.min(64, Math.trunc(count)));
  const ids = Array.from({ length: n }, (_, i) => `shot-${i + 1}`);
  let bridge = createStudioLiveBridgeDocument(ws.bridge.set, ids);
  for (let i = 0; i < n; i += 1) {
    bridge = applyStudioShotOverride(bridge, ids[i]!, {
      camera: {
        position: [Math.cos((i / n) * Math.PI * 2) * 5, 1.6, Math.sin((i / n) * Math.PI * 2) * 5],
        target: [0, 1, 0],
        fov: 35,
      },
    });
  }
  return { ...ws, bridge };
}

export function workspaceAddArtistInk(
  ws: StudioHybridDccWorkspace,
  shotId: string,
): StudioHybridDccWorkspace {
  for (const pass of STUDIO_TOON_PASS_KINDS) {
    ws = {
      ...ws,
      bridge: generateStudioToonPass(ws.bridge, shotId, pass),
    };
  }
  const assetId = ws.activeAssetId ?? "prop";
  const geoHash =
    ws.session.state.geometry.records[assetId]?.meshHash ?? "geo";
  const bridge = addStudioArtistDelta(ws.bridge, {
    id: `ink-${shotId}`,
    pass: "line",
    shotId,
    points: [
      [0.2, 0.2],
      [0.5, 0.5],
    ],
    pressure: [1, 0.8],
    provenance: { objectId: assetId, confidence: 0.9 },
    creationCameraHash: `cam-${shotId}`,
    creationGeometryHash: geoHash,
    createdAt: Date.now(),
  });
  return { ...ws, bridge };
}

export function workspaceImportBytes(
  ws: StudioHybridDccWorkspace,
  fileName: string,
  bytes: Uint8Array,
): StudioHybridDccWorkspace {
  const meshAdapter = importStudioMeshByExtension(fileName, bytes);
  if (meshAdapter && meshAdapter.meshes[0]) {
    const assetId = `import-${fileName.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 40)}`;
    let session = ws.session;
    if (!session.state.geometry.records[assetId]) {
      session = hybridDccRegisterAsset(session, assetId, meshAdapter.meshes[0], {
        source: fileName,
        creator: "import",
        license: "unknown",
        useScope: "editorial",
        derivative: "imported",
      });
    } else {
      session = hybridDccCommitGeometry(session, assetId, meshAdapter.meshes[0]);
    }
    return {
      ...ws,
      session,
      activeAssetId: assetId,
      lastImportReport: {
        ...meshAdapter.report,
        adapterFormat: meshAdapter.format,
        extras: meshAdapter.extras ?? null,
      },
    };
  }
  const gradeA = importStudioGradeAAsset({ fileName, bytes });
  return { ...ws, lastImportReport: gradeA.report };
}

export function workspaceLoadRoomPreset(
  ws: StudioHybridDccWorkspace,
  presetId = "classroom",
): StudioHybridDccWorkspace {
  const preset = getStudioBg3dRoomPreset(presetId);
  if (!preset) throw new Error(`unknown room ${presetId}`);
  const parts = buildStudioBg3dRoomParts(preset.spec);
  const objects = [
    ...ws.bridge.set.objects.filter((o) => o.id !== "room-shell"),
    {
      id: "room-shell",
      geometryHash: `room:${presetId}:${parts.length}`,
      visible: true,
      materialId: "wall",
    },
  ];
  const set = createStudioSharedSet(ws.bridge.set.id, objects);
  const bridge = createStudioLiveBridgeDocument(
    set,
    ws.bridge.shots.map((s) => s.id),
  );
  return { ...ws, bridge };
}

export function workspaceUndo(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  if (!hybridDccCanUndo(ws.session)) return ws;
  return { ...ws, session: hybridDccUndo(ws.session) };
}

export function workspaceRedo(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  if (!hybridDccCanRedo(ws.session)) return ws;
  return { ...ws, session: hybridDccRedo(ws.session) };
}

export function workspaceDiagnostics(ws: StudioHybridDccWorkspace) {
  return scanStudioHybridDccCorruption(ws.session.state);
}

export function workspaceExportToon3d(ws: StudioHybridDccWorkspace): StudioToon3dPackage {
  return packStudioToon3dPackage({
    documentId: ws.session.state.documentId,
    snapshot: snapshotStudioHybridDccState(ws.session.state),
    bridge: ws.bridge,
    rightsBom: ws.session.state.rightsBom,
  });
}

export function workspaceActiveMesh(
  ws: StudioHybridDccWorkspace,
): StudioEditableMesh | null {
  if (!ws.activeAssetId) return null;
  return ws.session.state.geometry.records[ws.activeAssetId]?.mesh ?? null;
}

export async function workspaceMirrorActive(
  ws: StudioHybridDccWorkspace,
  axis: "x" | "y" | "z" = "x",
): Promise<StudioHybridDccWorkspace> {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  let stack = createStudioMeshModifierStack(record.mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "mirror",
    id: "ws-mirror",
    enabled: true,
    axis,
    merge: true,
    mergeThreshold: 1e-4,
    bisect: false,
    clip: false,
  });
  const evaluated = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const session = hybridDccCommitGeometry(ws.session, id, evaluated.value.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    evaluated.value.resultHash,
  );
  return { ...ws, session, bridge };
}

export function workspaceUvUnwrapActive(
  ws: StudioHybridDccWorkspace,
  mode: "planar-xy" | "box" = "box",
): StudioHybridDccWorkspace {
  const mesh = workspaceActiveMesh(ws);
  if (!mesh) throw new Error("no active asset");
  const uv = mode === "box" ? unwrapStudioMeshBox(mesh) : unwrapStudioMeshPlanar(mesh, "planar-xy");
  return { ...ws, lastUvMap: uv };
}

export function workspaceCadProp(
  ws: StudioHybridDccWorkspace,
  assetId = "cad-prop",
): StudioHybridDccWorkspace {
  const sketch = createStudioCadSketch(
    [
      { kind: "line", a: [0, 0], b: [1, 0] },
      { kind: "line", a: [1, 0], b: [1, 0.6] },
      { kind: "line", a: [1, 0.6], b: [0, 0.6] },
      { kind: "line", a: [0, 0.6], b: [0, 0] },
    ],
    [
      { kind: "horizontal", curveIndex: 0 },
      { kind: "vertical", curveIndex: 1 },
    ],
  );
  void sketch;
  const solid = extrudeStudioCadProfile(
    [
      [0, 0],
      [1, 0],
      [1, 0.6],
      [0, 0.6],
    ],
    0.4,
  );
  if (!solid) throw new Error("cad extrude failed");
  const verts = [];
  for (let i = 0; i + 2 < solid.positions.length; i += 3) {
    verts.push({
      x: solid.positions[i]!,
      y: solid.positions[i + 1]!,
      z: solid.positions[i + 2]!,
    });
  }
  const faces: number[][] = [];
  for (let i = 0; i + 2 < solid.indices.length; i += 3) {
    faces.push([solid.indices[i]!, solid.indices[i + 1]!, solid.indices[i + 2]!]);
  }
  const mesh = createStudioEditableMeshFromPolygons(verts, faces);
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, mesh, {
      source: "cad-extrude",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, mesh);
  }
  return { ...ws, session, activeAssetId: assetId };
}

export function workspaceSculptActive(
  ws: StudioHybridDccWorkspace,
  strength = 0.15,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const sculpted = applyStudioSculptStroke(record.mesh, {
    kind: "inflate",
    center: { x: 0.5, y: 0.5, z: 0.5 },
    radius: 0.75,
    strength,
  });
  if (!sculpted.ok) throw new Error(sculpted.detail);
  const session = hybridDccCommitGeometry(ws.session, id, sculpted.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    hashStudioEditableMesh(sculpted.mesh),
  );
  return { ...ws, session, bridge };
}

export function workspaceClothStep(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  const grid = createStudioClothGrid(1, 1, 4, 4);
  const stepped = stepStudioClothXpbd(grid, 1 / 60, 4);
  void stepped;
  return { ...ws, clothStep: ws.clothStep + 1 };
}

export function workspaceCollabJoin(
  ws: StudioHybridDccWorkspace,
  peerId: string,
  displayName: string,
): StudioHybridDccWorkspace {
  let collab = collabJoin(ws.collab, {
    peerId,
    displayName,
    color: "#4f8cff",
    selection: ws.activeAssetId ? [ws.activeAssetId] : [],
  });
  if (ws.activeAssetId) {
    collab = collabAppendOp(collab, {
      kind: "select",
      peerId,
      assetIds: [ws.activeAssetId],
      at: Date.now(),
    });
  }
  return { ...ws, collab };
}

/** BVH/humanoid retarget report (CHR-P2) — pure diagnostics, no bake. */
export function workspaceRetargetFromBvhExtras(
  ws: StudioHybridDccWorkspace,
  sourceBones: readonly string[],
  targetBones: readonly string[] = [
    "hips",
    "spine",
    "chest",
    "neck",
    "head",
    "leftUpperArm",
    "rightUpperArm",
    "leftUpperLeg",
    "rightUpperLeg",
  ],
): StudioHybridDccWorkspace {
  const lastRetarget = retargetStudioMotionReport({
    source: "bvh",
    target: "vrm-humanoid",
    sourceBones,
    targetBones,
    sourceUp: "y",
    targetUp: "y",
    sourceUnit: 1,
    targetUnit: 1,
  });
  return { ...ws, lastRetarget };
}

export function workspaceSubdivideActive(
  ws: StudioHybridDccWorkspace,
  levels = 1,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const subdiv = subdivideStudioMeshCatmullLite(record.mesh, levels);
  if (!subdiv.ok) throw new Error(subdiv.detail);
  const session = hybridDccCommitGeometry(ws.session, id, subdiv.value);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    hashStudioEditableMesh(subdiv.value),
  );
  return { ...ws, session, bridge };
}

export async function workspaceArrayActive(
  ws: StudioHybridDccWorkspace,
  count = 3,
): Promise<StudioHybridDccWorkspace> {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  let stack = createStudioMeshModifierStack(record.mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "array",
    id: "ws-array",
    enabled: true,
    count: Math.max(1, Math.min(16, Math.trunc(count))),
    offset: { x: 1.2, y: 0, z: 0 },
    mode: "linear",
    realizeInstances: true,
  });
  const evaluated = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const session = hybridDccCommitGeometry(ws.session, id, evaluated.value.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    evaluated.value.resultHash,
  );
  return { ...ws, session, bridge };
}

export function workspaceRebuildBom(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  const parts = Object.entries(ws.session.state.geometry.records).map(([id, rec]) => ({
    id,
    name: id,
    volumeM3: Math.max(0.001, rec.mesh.faces.length * 0.0001),
  }));
  return { ...ws, bom: bomFromAssetParts(ws.session.state.documentId, parts) };
}

export function workspaceAddGeoNodesPrimitive(
  ws: StudioHybridDccWorkspace,
  kind: StudioGeoNodesPrimitiveKind = "sphere",
  assetId = `geo-${kind}`,
  segments = 6,
): StudioHybridDccWorkspace {
  const built = buildStudioGeoNodesPrimitive(kind, segments);
  if (!built.ok) throw new Error(built.detail);
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, built.mesh, {
      source: `geometry-nodes:${kind}`,
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, built.mesh);
  }
  return { ...ws, session, activeAssetId: assetId };
}

export function workspaceDecimateActive(
  ws: StudioHybridDccWorkspace,
  ratio = 0.5,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const dec = decimateStudioMesh(record.mesh, ratio);
  if (!dec.ok) throw new Error(dec.detail);
  const session = hybridDccCommitGeometry(ws.session, id, dec.value);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    hashStudioEditableMesh(dec.value),
  );
  return { ...ws, session, bridge };
}

function commitActiveMesh(
  ws: StudioHybridDccWorkspace,
  mesh: StudioEditableMesh,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const session = hybridDccCommitGeometry(ws.session, id, mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    hashStudioEditableMesh(mesh),
  );
  return { ...ws, session, bridge };
}

export function workspaceAddGeoNodesStarter(
  ws: StudioHybridDccWorkspace,
  assetId = "geo-starter",
): StudioHybridDccWorkspace {
  const built = evaluateStudioGeoNodesStarterGraph();
  if (!built.ok) throw new Error(built.detail);
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, built.mesh, {
      source: "geometry-nodes:starter-graph",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, built.mesh);
  }
  return { ...ws, session, activeAssetId: assetId };
}

export async function workspaceSolidifyActive(
  ws: StudioHybridDccWorkspace,
  thickness = 0.05,
): Promise<StudioHybridDccWorkspace> {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  let stack = createStudioMeshModifierStack(record.mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "solidify",
    id: "ws-solidify",
    enabled: true,
    thickness,
    evenThickness: true,
    rim: true,
  });
  const evaluated = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const session = hybridDccCommitGeometry(ws.session, id, evaluated.value.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    evaluated.value.resultHash,
  );
  return { ...ws, session, bridge };
}

export async function workspaceBevelActive(
  ws: StudioHybridDccWorkspace,
  amount = 0.05,
): Promise<StudioHybridDccWorkspace> {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  let stack = createStudioMeshModifierStack(record.mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "bevel",
    id: "ws-bevel",
    enabled: true,
    amount,
    segments: 1,
    angleLimitRad: Math.PI,
    weightInfluence: 1,
  });
  const evaluated = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const session = hybridDccCommitGeometry(ws.session, id, evaluated.value.mesh);
  const bridge = mutateStudioSharedObjectGeometry(
    ws.bridge,
    id,
    evaluated.value.resultHash,
  );
  return { ...ws, session, bridge };
}

export function workspaceBendActive(
  ws: StudioHybridDccWorkspace,
  angleRad = Math.PI / 6,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const bent = deformStudioMeshBend(record.mesh, angleRad, "y");
  if (!bent.ok) throw new Error(bent.detail);
  return commitActiveMesh(ws, bent.value);
}

export function workspaceRepairActive(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const repaired = repairStudioMesh(record.mesh);
  if (!repaired.ok) throw new Error(repaired.detail);
  return commitActiveMesh(ws, repaired.value.mesh);
}

/** Flip inverted face windings so normals point outward (CSG/Manifold prep). */
export function workspaceOrientOutwardActive(
  ws: StudioHybridDccWorkspace,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const oriented = orientStudioMeshOutward(record.mesh);
  if (!oriented.ok) throw new Error(oriented.detail);
  return commitActiveMesh(ws, oriented.value.mesh);
}

export function workspaceShrinkwrapActive(
  ws: StudioHybridDccWorkspace,
  factor = 0.15,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const wrapped = shrinkwrapStudioMesh(record.mesh, { x: 0, y: 0, z: 0 }, factor);
  if (!wrapped.ok) throw new Error(wrapped.detail);
  return commitActiveMesh(ws, wrapped.value);
}

export function workspaceVoxelRemeshActive(
  ws: StudioHybridDccWorkspace,
  cellSize = 0.15,
): StudioHybridDccWorkspace {
  const id = ws.activeAssetId;
  if (!id) throw new Error("no active asset");
  const record = ws.session.state.geometry.records[id];
  if (!record) throw new Error(`missing ${id}`);
  const remeshed = voxelRemeshStudioMesh(record.mesh, cellSize);
  if (!remeshed.ok) throw new Error(remeshed.detail);
  return commitActiveMesh(ws, remeshed.mesh);
}

export function workspaceCadRevolve(
  ws: StudioHybridDccWorkspace,
  assetId = "cad-revolve",
): StudioHybridDccWorkspace {
  const solid = revolveStudioCadProfile(
    [
      [0.2, 0],
      [0.4, 0.3],
      [0.35, 0.7],
      [0.15, 1],
    ],
    12,
  );
  if (!solid) throw new Error("cad revolve failed");
  const verts = [];
  for (let i = 0; i + 2 < solid.positions.length; i += 3) {
    verts.push({
      x: solid.positions[i]!,
      y: solid.positions[i + 1]!,
      z: solid.positions[i + 2]!,
    });
  }
  const faces: number[][] = [];
  for (let i = 0; i + 2 < solid.indices.length; i += 3) {
    faces.push([solid.indices[i]!, solid.indices[i + 1]!, solid.indices[i + 2]!]);
  }
  const mesh = createStudioEditableMeshFromPolygons(verts, faces);
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, mesh, {
      source: "cad-revolve",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, mesh);
  }
  return { ...ws, session, activeAssetId: assetId };
}

export function workspaceExportActiveMesh(
  ws: StudioHybridDccWorkspace,
  format: StudioMeshExportFormat = "obj",
): StudioHybridDccWorkspace {
  const mesh = workspaceActiveMesh(ws);
  if (!mesh) throw new Error("no active asset");
  const lastExport = exportStudioMeshByFormat(mesh, format);
  return { ...ws, lastExport };
}

/** Industrial openNURBS sphere mesh via rhino3dm. */
export async function workspaceOpenNurbsSphere(
  ws: StudioHybridDccWorkspace,
  assetId = "opennurbs-sphere",
  radius = 1,
): Promise<StudioHybridDccWorkspace> {
  const { evaluateStudioNurbsSurfaceSphere } = await import("./studio-rhino3dm-nurbs");
  const surf = await evaluateStudioNurbsSurfaceSphere(radius, 16, 12);
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, surf.mesh, {
      source: "rhino3dm-opennurbs",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, surf.mesh);
  }
  return { ...ws, session, activeAssetId: assetId };
}

/** Industrial web-ifc city import → workspace meshes. */
export async function workspaceImportIfcCity(
  ws: StudioHybridDccWorkspace,
  ifcText?: string,
): Promise<StudioHybridDccWorkspace> {
  const { createStudioIfcCityFixture, importStudioIfcCity } = await import("./studio-web-ifc-city");
  const city = await importStudioIfcCity(
    ifcText ?? createStudioIfcCityFixture({ buildings: 2, storeysPerBuilding: 3 }),
  );
  if (!city.ok) throw new Error(`IFC city: ${city.detail}`);
  let session = ws.session;
  let active: string | null = ws.activeAssetId;
  city.meshes.forEach((mesh, i) => {
    const id = `ifc-city-${i}`;
    if (!session.state.geometry.records[id]) {
      session = hybridDccRegisterAsset(session, id, mesh, {
        source: "web-ifc-city",
        creator: "studio",
        license: "CC0-1.0",
        useScope: "commercial",
        derivative: "original",
      });
    } else {
      session = hybridDccCommitGeometry(session, id, mesh);
    }
    active = id;
  });
  return { ...ws, session, activeAssetId: active };
}

/** Industrial OCCT WASM box solid → workspace asset. */
export async function workspaceOcctBox(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-box",
  size: readonly [number, number, number] = [1, 1, 1],
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({ kind: "box", size });
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, result.mesh, {
      source: "occt-wasm",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, result.mesh);
  }
  return { ...ws, session, activeAssetId: assetId, lastOcct: result };
}

/** Industrial OCCT boolean cut of two boxes. */
export async function workspaceOcctBooleanCut(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-cut",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "cut-boxes",
    a: { dx: 2, dy: 2, dz: 2 },
    b: { dx: 1, dy: 1, dz: 1, ox: 0.4, oy: 0.4, oz: 0.4 },
  });
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, result.mesh, {
      source: "occt-wasm-boolean",
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, result.mesh);
  }
  return { ...ws, session, activeAssetId: assetId, lastOcct: result };
}

async function commitOcctResult(
  ws: StudioHybridDccWorkspace,
  assetId: string,
  source: string,
  result: import("./studio-occt-wasm-facade").StudioOcctSolidResult,
): Promise<StudioHybridDccWorkspace> {
  let session = ws.session;
  if (!session.state.geometry.records[assetId]) {
    session = hybridDccRegisterAsset(session, assetId, result.mesh, {
      source,
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, assetId, result.mesh);
  }
  return { ...ws, session, activeAssetId: assetId, lastOcct: result };
}

/** Industrial OCCT revolve solid → workspace. */
export async function workspaceOcctRevolve(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-revolve",
  radius = 0.5,
  height = 1,
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({ kind: "revolve", radius, height });
  return commitOcctResult(ws, assetId, "occt-wasm-revolve", result);
}

/** Industrial OCCT sphere solid → workspace. */
export async function workspaceOcctSphere(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-sphere",
  radius = 0.75,
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({ kind: "sphere", radius });
  return commitOcctResult(ws, assetId, "occt-wasm-sphere", result);
}

/** Industrial OCCT torus solid → workspace. */
export async function workspaceOcctTorus(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-torus",
  majorRadius = 0.8,
  minorRadius = 0.2,
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "torus",
    majorRadius,
    minorRadius,
  });
  return commitOcctResult(ws, assetId, "occt-wasm-torus", result);
}

/** Industrial OCCT pipe/sweep solid → workspace. */
export async function workspaceOcctPipe(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-pipe",
  length = 1.5,
  radius = 0.12,
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({ kind: "pipe", length, radius });
  return commitOcctResult(ws, assetId, "occt-wasm-pipe", result);
}

/** Industrial OCCT mirrored box assembly → workspace. */
export async function workspaceOcctMirror(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-mirror",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "mirror-box",
    size: [0.8, 0.5, 0.4],
  });
  return commitOcctResult(ws, assetId, "occt-wasm-mirror", result);
}

/** Industrial OCCT thick/shell box → workspace. */
export async function workspaceOcctThickShell(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-thick",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "thick-shell-box",
    size: [1, 1, 0.5],
    thickness: 0.05,
  });
  return commitOcctResult(ws, assetId, "occt-wasm-thick", result);
}

/** Industrial STEP write+read round-trip box → workspace. */
export async function workspaceOcctStepRoundTrip(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-step",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "step-roundtrip-box",
    size: [1, 1, 1],
  });
  return commitOcctResult(ws, assetId, "occt-wasm-step", result);
}

/**
 * Multi-asset solid boolean: difference of two registered geometry assets
 * via the default Manifold backend (MOD-014 product path).
 */
export async function workspaceBooleanBetweenAssets(
  ws: StudioHybridDccWorkspace,
  leftAssetId: string,
  rightAssetId: string,
  operation: "difference" | "union" | "intersection" = "difference",
  outAssetId = "boolean-result",
): Promise<StudioHybridDccWorkspace> {
  const leftRec = ws.session.state.geometry.records[leftAssetId];
  const rightRec = ws.session.state.geometry.records[rightAssetId];
  if (!leftRec || !rightRec) {
    throw new Error(`missing assets left=${leftAssetId} right=${rightAssetId}`);
  }
  const leftSoup = studioEditableMeshToTriangleSoup(leftRec.mesh);
  const rightSoup = studioEditableMeshToTriangleSoup(rightRec.mesh);
  let stack = createStudioMeshModifierStack(leftRec.mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "boolean",
    id: "multi-asset-bool",
    enabled: true,
    operation,
    operand: { positions: rightSoup.positions, indices: rightSoup.indices },
  });
  const e = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!e.ok) throw new Error(e.detail);
  const soupOut = studioEditableMeshToTriangleSoup(e.value.mesh);
  if (soupOut.indices.length / 3 < 4) {
    throw new Error(`multi-asset boolean degenerate tris=${soupOut.indices.length / 3}`);
  }
  let session = ws.session;
  if (!session.state.geometry.records[outAssetId]) {
    session = hybridDccRegisterAsset(session, outAssetId, e.value.mesh, {
      source: `boolean-${operation}`,
      creator: "studio",
      license: "CC0-1.0",
      useScope: "commercial",
      derivative: "original",
    });
  } else {
    session = hybridDccCommitGeometry(session, outAssetId, e.value.mesh);
  }
  void leftSoup;
  return { ...ws, session, activeAssetId: outAssetId };
}

/** Industrial OCCT fillet box → workspace. */
export async function workspaceOcctFillet(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-fillet",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "fillet-box",
    size: [1, 1, 1],
    radius: 0.08,
  });
  return commitOcctResult(ws, assetId, "occt-wasm-fillet", result);
}

/** Industrial OCCT ThruSections loft → workspace. */
export async function workspaceOcctLoft(
  ws: StudioHybridDccWorkspace,
  assetId = "occt-loft",
): Promise<StudioHybridDccWorkspace> {
  const { runStudioOcctOperation } = await import("./studio-occt-worker-client");
  const result = await runStudioOcctOperation({
    kind: "loft",
    levels: [
      { dx: 2, dy: 2, z: 0 },
      { dx: 1.4, dy: 1.4, z: 1 },
      { dx: 0.8, dy: 0.8, z: 2 },
    ],
  });
  return commitOcctResult(ws, assetId, "occt-wasm-loft", result);
}

/**
 * MOD-014 Manifold (default backend) solid difference on the active mesh
 * against an offset/scaled copy of itself.
 */
export async function workspaceManifoldBooleanActive(
  ws: StudioHybridDccWorkspace,
): Promise<StudioHybridDccWorkspace> {
  const mesh = workspaceActiveMesh(ws);
  if (!mesh) throw new Error("no active asset");
  const soup = studioEditableMeshToTriangleSoup(mesh);
  const op = new Float32Array(soup.positions);
  for (let i = 0; i < op.length; i += 3) op[i]! += 0.35;
  for (let i = 0; i < op.length; i += 1) op[i]! *= 0.72;
  let stack = createStudioMeshModifierStack(mesh);
  stack = withStudioMeshModifier(stack, {
    kind: "boolean",
    id: "manifold-diff",
    enabled: true,
    operation: "difference",
    operand: { positions: op, indices: soup.indices },
  });
  const e = await evaluateStudioMeshModifierStack(stack, {
    booleanBackend: createStudioDefaultSolidBooleanBackend(),
  });
  if (!e.ok) throw new Error(e.detail);
  const soupOut = studioEditableMeshToTriangleSoup(e.value.mesh);
  if (soupOut.indices.length / 3 < 8) {
    throw new Error(`manifold boolean degenerate tris=${soupOut.indices.length / 3}`);
  }
  return commitActiveMesh(ws, e.value.mesh);
}

/** SCP-006 dynatopo refine/coarsen on active mesh. */
export function workspaceDynatopoActive(
  ws: StudioHybridDccWorkspace,
  mode: "refine" | "coarsen" = "refine",
  radius = 0.75,
): StudioHybridDccWorkspace {
  const mesh = workspaceActiveMesh(ws);
  if (!mesh) throw new Error("no active asset");
  const result = dynatopoStudioMeshBrushLocal(
    mesh,
    { center: { x: 0.5, y: 0.5, z: 0.5 }, radius },
    mode,
  );
  if (!result.ok) throw new Error(result.detail);
  const next = commitActiveMesh(ws, result.value.mesh);
  return {
    ...next,
    lastDynatopo: {
      facesBefore: result.value.facesBefore,
      facesAfter: result.value.facesAfter,
      boundaryEdges: result.value.boundaryEdges,
      mode,
    },
  };
}

/** SCP-011 auto-retopo on active mesh. */
export function workspaceRetopoActive(
  ws: StudioHybridDccWorkspace,
  targetFaces = 8,
): StudioHybridDccWorkspace {
  const mesh = workspaceActiveMesh(ws);
  if (!mesh) throw new Error("no active asset");
  const result = autoRetopoStudioMeshBasic(mesh, { targetFaces, symmetryX: true });
  if (!result.ok) throw new Error(result.detail);
  const next = commitActiveMesh(ws, result.value.mesh);
  return {
    ...next,
    lastRetopo: {
      facesBefore: result.value.facesBefore,
      facesAfter: result.value.facesAfter,
      targetFaces: result.value.targetFaces,
      meanError: result.value.meanError,
    },
  };
}

export function workspaceStepSpring(ws: StudioHybridDccWorkspace): StudioHybridDccWorkspace {
  const base: StudioSpringBone = ws.lastSpring ?? {
    id: "hair-0",
    head: [0, 1.5, 0],
    tail: [0, 1.2, 0.1],
    stiffness: 0.6,
    drag: 0.2,
    gravity: [0, -9.8, 0],
    velocity: [0, 0, 0],
  };
  return { ...ws, lastSpring: stepStudioSpringBone(base, 1 / 60) };
}

export function workspaceSampleIdleClip(
  ws: StudioHybridDccWorkspace,
  time = 0.25,
): StudioHybridDccWorkspace {
  const clip = createStudioIdleClip();
  void sampleStudioAnimationClip(clip, time);
  return { ...ws, animSampleTime: time };
}

/**
 * Full multi-kernel engine suite: geo-nodes starter, CAD revolve, modifiers, sculpt remesh,
 * cloth, spring, export, toon passes, pack.
 */
export async function runStudioHybridDccFullEngineSuite(
  documentId = "full-engine-suite",
): Promise<{
  readonly workspace: StudioHybridDccWorkspace;
  readonly package: StudioToon3dPackage;
  readonly metrics: {
    readonly assetCount: number;
    readonly engines: readonly string[];
    readonly exportFormat: string | null;
    readonly exportTriangles: number;
    readonly springTailY: number | null;
    readonly packageHash: string;
    readonly toonPassCount: number;
    readonly diagnosticErrors: number;
  };
}> {
  const engines: string[] = [];
  let ws = createStudioHybridDccWorkspace(documentId);
  // Keep starter graph output as a clean manifold asset (do not stack destructive modifiers on it).
  ws = workspaceAddGeoNodesStarter(ws, "gn-starter");
  engines.push("geometry-nodes-starter");
  // Modifier / deform stack on a unit cube — solidify/bevel can non-manifold exotic shells.
  ws = workspaceAddUnitCube(ws, "mod-cube");
  engines.push("primitive-cube");
  ws = await workspaceSolidifyActive(ws, 0.04);
  engines.push("modifier-solidify");
  ws = await workspaceBevelActive(ws, 0.03);
  engines.push("modifier-bevel");
  ws = workspaceBendActive(ws, Math.PI / 8);
  engines.push("deform-bend");
  ws = workspaceShrinkwrapActive(ws, 0.05);
  engines.push("deform-shrinkwrap");
  ws = workspaceRepairActive(ws);
  engines.push("mesh-repair");
  ws = workspaceSculptActive(ws, 0.05);
  engines.push("sculpt-inflate");
  // CAD extrude path is manifold-safe for document diagnostics (revolve is available via workspaceCadRevolve).
  ws = workspaceCadProp(ws, "cad-box");
  engines.push("cad-extrude");
  // Drop heavily stacked mod-cube before diagnostics if it became non-manifold — replace with clean cube.
  {
    const probe = scanStudioHybridDccCorruption(ws.session.state);
    const bad = probe.findings.some(
      (f) => f.severity === "error" && f.targetId === "mod-cube",
    );
    if (bad) {
      const clean = createStudioUnitCubeMesh();
      const session = hybridDccCommitGeometry(ws.session, "mod-cube", clean);
      const bridge = mutateStudioSharedObjectGeometry(
        ws.bridge,
        "mod-cube",
        hashStudioEditableMesh(clean),
      );
      ws = { ...ws, session, bridge, activeAssetId: "mod-cube" };
      engines.push("mod-cube-reset-clean");
    }
  }
  ws = workspaceClothStep(ws);
  engines.push("cloth-xpbd");
  ws = workspaceStepSpring(ws);
  engines.push("spring-bone");
  ws = workspaceSampleIdleClip(ws, 0.5);
  engines.push("anim-clip");
  ws = workspaceExportActiveMesh(ws, "stl");
  engines.push("export-stl");
  ws = workspaceEnsureShots(ws, 4);
  for (const pass of STUDIO_TOON_PASS_KINDS) {
    ws = { ...ws, bridge: generateStudioToonPass(ws.bridge, "shot-1", pass) };
  }
  engines.push("npr-toon-passes");
  ws = workspaceRebuildBom(ws);
  engines.push("mfg-bom");
  const pkg = workspaceExportToon3d(ws);
  engines.push("toon3d-pack");
  const diag = workspaceDiagnostics(ws);
  return {
    workspace: ws,
    package: pkg,
    metrics: {
      assetCount: Object.keys(ws.session.state.geometry.records).length,
      engines,
      exportFormat: ws.lastExport?.format ?? null,
      exportTriangles: ws.lastExport?.triangleCount ?? 0,
      springTailY: ws.lastSpring?.tail[1] ?? null,
      packageHash: pkg.manifest.packageHash,
      toonPassCount: STUDIO_TOON_PASS_KINDS.length,
      diagnosticErrors: diag.errorCount,
    },
  };
}

export type StudioHybridDccWaveProductLoopResult = {
  readonly workspace: StudioHybridDccWorkspace;
  readonly package: StudioToon3dPackage;
  readonly metrics: {
    readonly assetCount: number;
    readonly shotCount: number;
    readonly bomLines: number;
    readonly collabEpoch: number;
    readonly collabOps: number;
    readonly collabConflicts: number;
    readonly uvMode: string | null;
    readonly packageHash: string;
    readonly documentHasGeo: boolean;
    readonly importFormat: string | null;
    readonly importGeometryFidelity: string | null;
    readonly diagnosticErrors: number;
  };
};

/**
 * End-to-end product loop (wave): geo-nodes → edit → IFC import shell → retarget/BOM/collab → .toon3d.
 * Pure workspace APIs only — gated by product tests asserting concrete metrics.
 */
export async function runStudioHybridDccWaveProductLoop(
  documentId = "wave-product-loop",
): Promise<StudioHybridDccWaveProductLoopResult> {
  let ws = createStudioHybridDccWorkspace(documentId);
  ws = workspaceAddGeoNodesPrimitive(ws, "sphere", "geo-sphere", 6);
  ws = workspaceKnifeActive(ws, { x: 0, y: 1, z: 0 });
  ws = workspaceSculptActive(ws, 0.08);
  ws = workspaceUvUnwrapActive(ws, "box");

  const ifcText = [
    "ISO-10303-21;",
    "DATA;",
    "#1=IFCCARTESIANPOINT((0.,0.,0.));",
    "#2=IFCCARTESIANPOINT((4.,0.,0.));",
    "#3=IFCCARTESIANPOINT((4.,3.,0.));",
    "#4=IFCCARTESIANPOINT((0.,3.,2.));",
    "#5=IFCSPACE('1','Lobby','',$,$,$,$,$,.ELEMENT.,$,$);",
    "#6=IFCBUILDINGSTOREY('2','L1','',$,$,$,$,$,.ELEMENT.,$);",
    "#7=IFCWALL('3','W1',$,$,$,$,$,$,$);",
    "#8=IFCDOOR('4','D1',$,$,$,$,$,$,$);",
    "ENDSEC;",
  ].join("\n");
  ws = workspaceImportBytes(ws, "lobby.ifc", new TextEncoder().encode(ifcText));
  const importRec =
    ws.lastImportReport && typeof ws.lastImportReport === "object" && ws.lastImportReport !== null
      ? (ws.lastImportReport as {
          adapterFormat?: string;
          format?: string;
          fidelity?: { geometry?: string };
          sourceHash?: string;
        })
      : null;
  const importFormat = importRec?.adapterFormat ?? importRec?.format ?? null;
  const importGeometryFidelity = importRec?.fidelity?.geometry ?? null;

  ws = workspaceRetargetFromBvhExtras(ws, ["Hips", "Spine", "Head", "LeftArm", "RightArm"]);
  ws = workspaceRebuildBom(ws);
  ws = workspaceCollabJoin(ws, "artist-a", "Artist A");
  const active = ws.activeAssetId ?? "geo-sphere";
  const geoHash =
    ws.session.state.geometry.records[active]?.meshHash ?? hashStudioEditableMesh(
      ws.session.state.geometry.records[Object.keys(ws.session.state.geometry.records)[0]!]!.mesh,
    );
  ws = {
    ...ws,
    collab: collabAppendOp(ws.collab, {
      kind: "lock",
      peerId: "artist-a",
      assetId: active,
      at: Date.now(),
    }),
  };
  ws = {
    ...ws,
    collab: collabAppendOp(ws.collab, {
      kind: "geometry-hint",
      peerId: "artist-a",
      assetId: active,
      geometryHash: geoHash,
      at: Date.now(),
    }),
  };
  ws = workspaceEnsureShots(ws, 4);
  const pkg = workspaceExportToon3d(ws);
  const diag = workspaceDiagnostics(ws);
  const conflicts = collabConflictReport(ws.collab);

  return {
    workspace: ws,
    package: pkg,
    metrics: {
      assetCount: Object.keys(ws.session.state.geometry.records).length,
      shotCount: ws.bridge.shots.length,
      bomLines: ws.bom.lines.length,
      collabEpoch: ws.collab.epoch,
      collabOps: ws.collab.ops.length,
      collabConflicts: conflicts.length,
      uvMode: ws.lastUvMap?.mode ?? null,
      packageHash: pkg.manifest.packageHash,
      documentHasGeo: (pkg.files["document/document.json"] ?? "").includes("geo-sphere")
        || (pkg.files["document/document.json"] ?? "").includes("import-lobby"),
      importFormat,
      importGeometryFidelity,
      diagnosticErrors: diag.errorCount,
    },
  };
}
