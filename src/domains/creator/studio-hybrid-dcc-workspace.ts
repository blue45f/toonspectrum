/**
 * Studio-facing Hybrid DCC workspace API.
 * Composes document, geometry authority, live bridge, import pipeline, and v1 demo
 * into one callable surface for UI / companion tooling without React coupling.
 */

import { getStudioBg3dRoomPreset, buildStudioBg3dRoomParts } from "./studio-bg3d-room-builder";
import {
  createStudioUnitCubeMesh,
  extrudeStudioEditableMeshFaces,
  hashStudioEditableMesh,
  knifeStudioEditableMesh,
  type StudioEditableMesh,
} from "./studio-editable-half-edge-mesh";
import { studioEditableMeshToTriangleSoup } from "./studio-editable-half-edge-mesh";
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
  createStudioLiveBridgeDocument,
  createStudioSharedSet,
  applyStudioShotOverride,
  addStudioArtistDelta,
  mutateStudioSharedObjectGeometry,
  generateStudioToonPass,
  STUDIO_TOON_PASS_KINDS,
  type StudioLiveBridgeDocument,
} from "./studio-live-2d3d-bridge";
import { importStudioMeshByExtension } from "./studio-mesh-format-adapters";
import {
  createStudioMeshModifierStack,
  evaluateStudioMeshModifierStack,
  withStudioMeshModifier,
} from "./studio-mesh-modifier-stack";
import { createStudioDefaultSolidBooleanBackend } from "./studio-solid-boolean-backend";
import { packStudioToon3dPackage, type StudioToon3dPackage } from "./studio-toon3d-package";

export const STUDIO_HYBRID_DCC_WORKSPACE_REVISION = 1 as const;

export interface StudioHybridDccWorkspace {
  readonly revision: typeof STUDIO_HYBRID_DCC_WORKSPACE_REVISION;
  session: StudioHybridDccSession;
  bridge: StudioLiveBridgeDocument;
  activeAssetId: string | null;
  lastImportReport: unknown | null;
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
