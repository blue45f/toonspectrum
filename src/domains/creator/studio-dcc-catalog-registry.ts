/**
 * SSOT registry: doc §6 catalog ID → shipped module + status.
 * Used by gating tests to assert every §12.1 / P0–P1 ID has a concrete API.
 */

export const STUDIO_DCC_CATALOG_REGISTRY_REVISION = 3 as const;

export type StudioCatalogStatus =
  | "shipped"
  | "partial"
  | "deferred-p2"
  | "deferred-p3"
  | "deferred-p4"
  | "deferred-p5"
  | "bridge-only";

export interface StudioCatalogEntry {
  readonly id: string;
  readonly priority: "P0" | "P1" | "P2" | "P3" | "P4" | "P5";
  readonly status: StudioCatalogStatus;
  readonly apis: readonly string[];
  readonly module: string;
}

export const STUDIO_DCC_CATALOG_REGISTRY: readonly StudioCatalogEntry[] = [
  // DOC
  { id: "DOC-001", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["createStudioHybridDccSession"] },
  { id: "DOC-002", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccUndo", "hybridDccRedo"] },
  { id: "DOC-003", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccPropagateDirty"] },
  { id: "DOC-004", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccRecoverFromJournal"] },
  { id: "DOC-005", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccContentAddressAsset"] },
  { id: "DOC-006", priority: "P0", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccAutosaveCheckpoint"] },
  { id: "DOC-007", priority: "P1", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccSelectiveUndo"] },
  { id: "DOC-012", priority: "P1", status: "shipped", module: "studio-hybrid-dcc-document.ts", apis: ["hybridDccRegisterAsset"] },
  { id: "DOC-015", priority: "P1", status: "shipped", module: "studio-hybrid-dcc-diagnostics.ts", apis: ["scanStudioHybridDccCorruption"] },
  { id: "DOC-008", priority: "P2", status: "partial", module: "studio-dcc-collab-shell.ts", apis: ["createStudioDccCollabRoom", "collabJoin", "collabAppendOp"] },
  // MOD
  { id: "MOD-001", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["selectStudioMeshElements"] },
  { id: "MOD-002", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["selectStudioMeshEdgeLoop", "selectStudioMeshFaceRing"] },
  { id: "MOD-003", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["transformStudioEditableMesh"] },
  { id: "MOD-004", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["extrudeStudioEditableMeshFaces"] },
  { id: "MOD-005", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["insetStudioEditableMeshFaces"] },
  { id: "MOD-006", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["bevelStudioEditableMeshEdges"] },
  { id: "MOD-007", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["loopCutStudioEditableMesh"] },
  { id: "MOD-008", priority: "P2", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["knifeStudioEditableMesh", "bisectStudioEditableMesh"] },
  { id: "MOD-009", priority: "P2", status: "shipped", module: "studio-mesh-ops-advanced.ts", apis: ["bridgeStudioFaceLoops"] },
  { id: "MOD-010", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["weldStudioEditableMesh", "dissolveStudioEditableMeshFaces"] },
  { id: "MOD-011", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["setStudioEditableMeshCrease"] },
  { id: "MOD-012", priority: "P1", status: "shipped", module: "studio-mesh-modifier-stack.ts", apis: ["evaluateStudioMeshModifierStack"] },
  { id: "MOD-013", priority: "P1", status: "shipped", module: "studio-mesh-modifier-stack.ts", apis: ["evaluateStudioMeshModifierStack"] },
  { id: "MOD-014", priority: "P1", status: "shipped", module: "studio-solid-boolean-backend.ts", apis: ["createStudioManifoldSolidBooleanBackend"] },
  { id: "MOD-015", priority: "P1", status: "shipped", module: "studio-mesh-modifier-stack.ts", apis: ["evaluateStudioMeshModifierStack"] },
  { id: "MOD-016", priority: "P1", status: "shipped", module: "studio-mesh-modifier-stack.ts", apis: ["evaluateStudioMeshModifierStack"] },
  { id: "MOD-017", priority: "P2", status: "shipped", module: "studio-mesh-ops-advanced.ts", apis: ["subdivideStudioMeshCatmullLite"] },
  { id: "MOD-024", priority: "P1", status: "shipped", module: "studio-editable-half-edge-mesh.ts", apis: ["diagnoseStudioEditableMesh"] },
  // BLD
  { id: "BLD-001", priority: "P1", status: "shipped", module: "studio-build-inference-snap.ts", apis: ["resolveStudioBuildInferenceSnap"] },
  { id: "BLD-002", priority: "P1", status: "shipped", module: "studio-build-inference-snap.ts", apis: ["cycleStudioInferenceAxisLock"] },
  { id: "BLD-003", priority: "P1", status: "shipped", module: "studio-bg3d-push-pull.ts", apis: ["planStudioBg3dPushPull"] },
  { id: "BLD-004", priority: "P1", status: "shipped", module: "studio-build-generators.ts", apis: ["offsetStudioFloorPlanPolygon"] },
  { id: "BLD-006", priority: "P1", status: "shipped", module: "studio-component-instance-core.ts", apis: ["planStudioComponentMakeUnique"] },
  { id: "BLD-007", priority: "P1", status: "shipped", module: "studio-build-tags-outliner.ts", apis: ["resolveStudioOutlinerVisibility"] },
  { id: "BLD-009", priority: "P1", status: "shipped", module: "studio-build-generators.ts", apis: ["buildStudioWallsFromFloorPlan"] },
  { id: "BLD-010", priority: "P1", status: "shipped", module: "studio-bg3d-room-builder.ts", apis: ["buildStudioBg3dRoomParts"] },
  { id: "BLD-011", priority: "P1", status: "shipped", module: "studio-build-generators.ts", apis: ["generateStudioStairs"] },
  { id: "BLD-012", priority: "P1", status: "shipped", module: "studio-build-generators.ts", apis: ["generateStudioSlab"] },
  { id: "BLD-015", priority: "P1", status: "shipped", module: "studio-bg3d-room-builder.ts", apis: ["getStudioBg3dRoomPreset"] },
  { id: "BLD-016", priority: "P1", status: "shipped", module: "studio-build-generators.ts", apis: ["createStudioDimension"] },
  { id: "BLD-018", priority: "P1", status: "shipped", module: "studio-camera-wall-hide.ts", apis: ["resolveStudioCameraWallHide"] },
  // CHR / import
  { id: "CHR-001", priority: "P1", status: "shipped", module: "studio-grade-a-import-pipeline.ts", apis: ["importStudioGradeAAsset"] },
  { id: "CHR-002", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["diagnoseStudioHumanoidMapping"] },
  { id: "CHR-003", priority: "P1", status: "shipped", module: "studio-character-ik-fk.ts", apis: ["poseStudioBodyChainIk", "poseStudioBodyChainFk"] },
  { id: "CHR-007", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["STUDIO_HAND_POSE_LIBRARY"] },
  { id: "CHR-008", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["mixStudioExpressions"] },
  { id: "CHR-009", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["createStudioLookAt"] },
  { id: "CHR-018", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["createStudioPoseAssetMetadata"] },
  // SHT / NPR
  { id: "SHT-001", priority: "P0", status: "shipped", module: "studio-live-2d3d-bridge.ts", apis: ["createStudioLiveBridgeDocument"] },
  { id: "SHT-002", priority: "P1", status: "shipped", module: "studio-shot-continuity.ts", apis: ["studioCameraFovY"] },
  { id: "SHT-003", priority: "P1", status: "shipped", module: "studio-live-2d3d-bridge.ts", apis: ["applyStudioShotOverride"] },
  { id: "SHT-005", priority: "P1", status: "shipped", module: "studio-camera-wall-hide.ts", apis: ["resolveStudioCameraWallHide"] },
  { id: "NPR-001", priority: "P0", status: "shipped", module: "studio-live-2d3d-bridge.ts", apis: ["STUDIO_TOON_PASS_KINDS"] },
  { id: "NPR-005", priority: "P1", status: "shipped", module: "studio-live-2d3d-bridge.ts", apis: ["generateStudioToonPass"] },
  { id: "NPR-006", priority: "P1", status: "shipped", module: "studio-artist-correction-delta.ts", apis: ["appendStudioArtistCorrection"] },
  { id: "NPR-008", priority: "P1", status: "shipped", module: "studio-artist-correction-delta.ts", apis: ["reprojectStudioArtistCorrections"] },
  // MAT / formats
  { id: "MAT-006", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["createStudioDecalPlacement"] },
  { id: "MAT-009", priority: "P1", status: "shipped", module: "studio-character-pose-p1.ts", apis: ["studioKtx2DerivativeForProfile"] },
  { id: "PRC-005", priority: "P1", status: "shipped", module: "studio-bg3d-room-builder.ts", apis: ["buildStudioBg3dRoomParts"] },
  // Formats §12.1
  { id: "FMT-GLB", priority: "P0", status: "shipped", module: "studio-glb-scene-ir.ts", apis: ["importStudioGlbDocument"] },
  { id: "FMT-VRM", priority: "P0", status: "shipped", module: "studio-glb-scene-ir.ts", apis: ["importStudioGlbDocument"] },
  { id: "FMT-OBJ", priority: "P0", status: "shipped", module: "studio-import-compatibility-report.ts", apis: ["parseStudioObjToSceneIR"] },
  { id: "FMT-FBX", priority: "P1", status: "partial", module: "studio-fbx-ascii-import.ts", apis: ["importStudioFbxAsciiDocument", "importStudioFbxDocument", "isStudioFbxBinary"] },
  { id: "FMT-STL", priority: "P1", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioStl"] },
  { id: "FMT-PLY", priority: "P1", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioPlyAscii"] },
  { id: "FMT-DAE", priority: "P2", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioDaeMinimal"] },
  { id: "FMT-DXF", priority: "P2", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioDxfPlan"] },
  { id: "FMT-OFF", priority: "P3", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioOff"] },
  { id: "FMT-3MF", priority: "P2", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudio3mfMinimal"] },
  { id: "FMT-BVH", priority: "P2", status: "shipped", module: "studio-mesh-format-adapters.ts", apis: ["importStudioBvhMotion"] },
  { id: "FMT-IFC", priority: "P3", status: "partial", module: "studio-mesh-format-adapters.ts", apis: ["importStudioIfcShell"] },
  { id: "FMT-STEP", priority: "P3", status: "partial", module: "studio-mesh-format-adapters.ts", apis: ["importStudioStepShell"] },
  { id: "FMT-TOON3D", priority: "P0", status: "shipped", module: "studio-toon3d-package.ts", apis: ["packStudioToon3dPackage"] },
  { id: "MAT-004", priority: "P2", status: "shipped", module: "studio-uv-unwrap-lite.ts", apis: ["unwrapStudioMeshBox", "unwrapStudioMeshPlanar"] },
  { id: "CHR-RETARGET", priority: "P2", status: "shipped", module: "studio-character-animation-p2.ts", apis: ["retargetStudioMotionReport", "workspaceRetargetFromBvhExtras"] },
  { id: "CAD-BOM", priority: "P4", status: "shipped", module: "studio-manufacturing-bom-lite.ts", apis: ["bomFromAssetParts", "bomRollupByMaterial", "workspaceRebuildBom"] },
  { id: "MOD-ARRAY-WS", priority: "P1", status: "shipped", module: "studio-hybrid-dcc-workspace.ts", apis: ["workspaceArrayActive", "workspaceSubdivideActive"] },
  // Workspace vertical
  { id: "V1-VERTICAL", priority: "P1", status: "shipped", module: "studio-webtoon-object-creator-v1-demo.ts", apis: ["runStudioWebtoonObjectCreatorV1Demo"] },
  { id: "WS-API", priority: "P1", status: "shipped", module: "studio-hybrid-dcc-workspace.ts", apis: ["createStudioHybridDccWorkspace"] },
  { id: "UI-HYBRID-PANEL", priority: "P1", status: "shipped", module: "StudioHybridDccPanel.tsx", apis: ["StudioHybridDccPanel", "StudioHybridDccDialog"] },
  // CAD / sculpt / cloth promoted from deferred lite kernels
  { id: "CAD-001", priority: "P3", status: "partial", module: "studio-cad-kernel-lite.ts", apis: ["createStudioCadSketch", "diagnoseStudioCadConstraints"] },
  { id: "CAD-015", priority: "P3", status: "shipped", module: "studio-cad-kernel-lite.ts", apis: ["extrudeStudioCadProfile", "workspaceCadProp"] },
  { id: "SCP-001", priority: "P3", status: "shipped", module: "studio-hybrid-sculpt-kernel.ts", apis: ["applyStudioSculptStroke", "workspaceSculptActive"] },
  { id: "GAR-005", priority: "P3", status: "shipped", module: "studio-cloth-pattern-kernel.ts", apis: ["stepStudioClothXpbd", "workspaceClothStep"] },
];

export function studioCatalogByPriority(
  priority: StudioCatalogEntry["priority"],
): readonly StudioCatalogEntry[] {
  return STUDIO_DCC_CATALOG_REGISTRY.filter((e) => e.priority === priority);
}

export function studioCatalogShippedIds(): readonly string[] {
  return STUDIO_DCC_CATALOG_REGISTRY.filter((e) => e.status === "shipped" || e.status === "partial").map(
    (e) => e.id,
  );
}

/** §12.1 required bullets mapped to registry IDs that must be shipped/partial. */
export const STUDIO_WEBTOON_OBJECT_CREATOR_V1_REQUIRED_IDS = [
  "MOD-001", "MOD-004", "MOD-005", "MOD-006", "MOD-007", "MOD-008", "MOD-009",
  "MOD-012", "MOD-013", "MOD-014", "MOD-015",
  "BLD-001", "BLD-003", "BLD-006", "BLD-009", "BLD-010", "BLD-011",
  "FMT-GLB", "FMT-VRM", "FMT-OBJ", "FMT-FBX",
  "SHT-001", "SHT-003", "NPR-001", "NPR-008",
  "DOC-004", "DOC-012", "V1-VERTICAL",
] as const;

export function assertWebtoonObjectCreatorV1Coverage(): {
  readonly missing: readonly string[];
  readonly ok: boolean;
} {
  const byId = new Map(STUDIO_DCC_CATALOG_REGISTRY.map((e) => [e.id, e]));
  const missing = STUDIO_WEBTOON_OBJECT_CREATOR_V1_REQUIRED_IDS.filter((id) => {
    const e = byId.get(id);
    return !e || (e.status !== "shipped" && e.status !== "partial");
  });
  return { missing, ok: missing.length === 0 };
}
