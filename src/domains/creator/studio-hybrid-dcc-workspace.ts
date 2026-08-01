/**
 * Studio-facing Hybrid DCC workspace API.
 * Composes document, geometry authority, live bridge, import pipeline, and v1 demo
 * into one callable surface for UI / companion tooling without React coupling.
 */

import { getStudioBg3dRoomPreset, buildStudioBg3dRoomParts } from "./studio-bg3d-room-builder";
import {
  createStudioCadSketch,
  extrudeStudioCadProfile,
} from "./studio-cad-kernel-lite";
import {
  retargetStudioMotionReport,
  type StudioRetargetReport,
} from "./studio-character-animation-p2";
import {
  createStudioClothGrid,
  stepStudioClothXpbd,
} from "./studio-cloth-pattern-kernel";
import {
  collabAppendOp,
  collabJoin,
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
import { applyStudioSculptStroke } from "./studio-hybrid-sculpt-kernel";
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
import { importStudioMeshByExtension } from "./studio-mesh-format-adapters";
import {
  createStudioMeshModifierStack,
  evaluateStudioMeshModifierStack,
  withStudioMeshModifier,
} from "./studio-mesh-modifier-stack";
import {
  decimateStudioMesh,
  subdivideStudioMeshCatmullLite,
} from "./studio-mesh-ops-advanced";
import { createStudioDefaultSolidBooleanBackend } from "./studio-solid-boolean-backend";
import { packStudioToon3dPackage, type StudioToon3dPackage } from "./studio-toon3d-package";
import {
  unwrapStudioMeshBox,
  unwrapStudioMeshPlanar,
  type StudioUvMap,
} from "./studio-uv-unwrap-lite";

export const STUDIO_HYBRID_DCC_WORKSPACE_REVISION = 2 as const;

export interface StudioHybridDccWorkspace {
  readonly revision: typeof STUDIO_HYBRID_DCC_WORKSPACE_REVISION;
  session: StudioHybridDccSession;
  bridge: StudioLiveBridgeDocument;
  activeAssetId: string | null;
  lastImportReport: unknown | null;
  lastUvMap: StudioUvMap | null;
  lastRetarget: StudioRetargetReport | null;
  bom: StudioManufacturingBom;
  collab: StudioDccCollabRoom;
  clothStep: number;
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
    bom: bomFromAssetParts(documentId, []),
    collab: createStudioDccCollabRoom(`${documentId}-collab`),
    clothStep: 0,
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
      lastImportReport: meshAdapter.report,
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
