import * as THREE from "three";

import { applyStudioBg3dViewToThreeCamera } from "../../src/domains/creator/bg3d/studio-bg3d-camera-application";
import {
  captureStudioBg3dShot,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import {
  acquireStudioBg3dSharedCharacterCaptureAuthorityLease,
  verifyStudioBg3dSharedCharacterCaptureAuthorityLease,
} from "../../src/domains/creator/bg3d/studio-bg3d-shared-character-capture-authority";
import { verifyStudioBg3dShotBatchArchiveBlob } from "../../src/domains/creator/bg3d/studio-bg3d-shot-batch-archive-verifier";
import { createStudioBg3dShotBatchExportRunner } from "../../src/domains/creator/bg3d/studio-bg3d-shot-batch-export-run";

import type { BgViewportApi } from "../../src/domains/creator/bg3d/studio-bg3d-camera-application";
import type { StudioBg3dCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-capture-adapter";
import type { StudioBg3dShotBatchExportRunContext } from "../../src/domains/creator/bg3d/studio-bg3d-shot-batch-export-run";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
/** Real production batch orchestration/recovery/archive, with a controlled read-only synthetic host. */
export async function verifyScene3dTiledSavedShotFlow(
  adapter: StudioBg3dCaptureAdapter,
  camera: THREE.PerspectiveCamera,
) {
  const draft = parseStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    camera: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      projection: "perspective",
      position: [0.1, 0.2, 4.5],
      target: [0, 0, 0],
      fovDegrees: 50,
    },
    render: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render, shadows: false },
    background: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
      mode: "color",
      color: "#778899",
    },
    output: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
      exportHeight: 4096,
      line: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
        enabled: true,
        depthEnabled: true,
        depthOutlineOnly: false,
        textureLineEnabled: false,
      },
      tone: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
        mode: "screentone",
        type: "pattern",
        pattern: "crosshatch",
      },
    },
  });
  assert(draft, "Could not construct canonical fixture.");
  let doc = captureStudioBg3dShot(draft, {
    id: "tiled-4k",
    name: "4K saved shot",
  });
  assert(doc, "No canonical saved shot.");
  doc = captureStudioBg3dShot(
    { ...doc, output: { ...doc.output, exportHeight: 512 } },
    { id: "small-reference", name: "Small saved shot" },
  );
  assert(doc, "No second shot.");
  const originalDoc = doc;
  const originalSerialized = serializeStudioBg3dSceneDocument(doc);
  let liveView = doc.camera;
  let error: string | null = null;
  let capturing = false;
  const progress: unknown[] = [];
  const summaries: unknown[] = [];
  let abortAtTile = true;
  const authority = () => ({
    revision: 1,
    includeCharactersInCapture: false,
    readinessPhase: "ready" as const,
    expectedCharacters: [],
    capturableElementIds: [],
    previewOnlyElementIds: [],
    pendingElementIds: [],
    unavailableElementIds: [],
  });
  const viewport: BgViewportApi = {
    zoomBy: () => false,
    applyPreset: () => false,
    focusOn: () => {},
    readFramingState: () => ({ view: liveView, viewportAspect: 1 }),
    readView: () => liveView,
    applyView: (view) => {
      if (!applyStudioBg3dViewToThreeCamera(camera, null, view)) return false;
      liveView = view;
      return true;
    },
  };
  assert(
    viewport.applyView(liveView),
    "Fixture camera could not apply the canonical view.",
  );
  let captureCalls = 0;
  const counted: StudioBg3dCaptureAdapter = {
    ...adapter,
    capture: async (request) => {
      captureCalls++;
      return adapter.capture(request);
    },
    createTiledCapture: () => {
      const session = adapter.createTiledCapture!();
      return {
        ...session,
        capture: async (request, window) => {
          captureCalls++;
          return session.capture(request, window);
        },
      };
    },
  };
  const ref = <T>(current: T) => ({ current });
  const ctx: StudioBg3dShotBatchExportRunContext = {
    captureInFlightRef: ref(false),
    captureRef: ref({ adapter: counted }),
    componentActiveRef: ref(true),
    pendingInitialCameraRef: ref(null),
    shotBatchAbortRef: ref(null),
    shotBatchAuthorizationEpochRef: ref(0),
    shotBatchRecoveryRef: ref(null),
    shotBatchRecoveryScopeRef: ref(null),
    shotBatchRecoveryStoreRef: ref(null),
    viewportApiRef: ref(viewport),
    customModels: [],
    primitives: [],
    deviceSignals: {
      cssWidth: 1200,
      cssHeight: 800,
      pointer: "fine",
      devicePixelRatio: 1,
      saveData: false,
      deviceMemoryGb: 16,
      hardwareConcurrency: 8,
    },
    lineArtPreview: false,
    recoveryScope: {
      durability: "memory",
      authUserId: "anonymous",
      workId: "local-draft",
      pageId: "test-page",
      elementId: "tiled-output",
    },
    sceneBaseDocument: doc,
    selectedShotBatchPasses: [
      "beauty",
      "main-line",
      "tone",
      "lt-composite",
      "depth",
    ],
    shotBatchBlockedReason: null,
    shotBatchExportHeight: "per-shot",
    shotBatchIncludeContactSheet: false,
    shotBatchIncludeLayeredPsd: true,
    shotBatchSelectedIds: ["tiled-4k", "small-reference"],
    setCaptureBackgroundSnapshot: () => {},
    setCustomModels: () => {},
    setPrimitives: () => {},
    setLineArtPreview: () => {},
    setSceneBaseDocument: (value) => {
      doc = value;
    },
    setError: (value) => {
      error = value;
    },
    setIsCapturing: (value) => {
      capturing = value;
    },
    setShotBatchRecoverySummary: (value) => summaries.push(value),
    setShotBatchProgress: (value) => {
      progress.push(value);
      if (abortAtTile && value?.label.includes("타일 1/")) {
        abortAtTile = false;
        ctx.shotBatchAbortRef.current?.abort();
      }
    },
    acquireSharedCharacterCaptureAuthority: () =>
      acquireStudioBg3dSharedCharacterCaptureAuthorityLease(authority()),
    readCurrentCanonicalSceneForShot: () => originalDoc,
    validateRecoveryAccess: async (_scope, signal) => !signal.aborted,
    verifySharedCharacterCaptureAuthority: (lease, checkpoint) =>
      verifyStudioBg3dSharedCharacterCaptureAuthorityLease(
        lease,
        authority(),
        checkpoint,
      ),
  };
  const archives: Blob[] = [];
  const createUrl = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    if (blob instanceof Blob && blob.type === "application/zip")
      archives.push(blob);
    return createUrl.call(URL, blob);
  };
  try {
    const run = createStudioBg3dShotBatchExportRunner(ctx);
    await run();
    assert(
      Number(archives.length) === 0,
      "Cancellation published a partial archive.",
    );
    assert(
      !capturing && !ctx.captureInFlightRef.current,
      "Cancelled export retained capture ownership.",
    );
    assert(
      serializeStudioBg3dSceneDocument(doc) === originalSerialized,
      "Cancelled export changed canonical source.",
    );
    await run();
    assert(!error, `Real batch failed: ${error}`);
    assert(Number(archives.length) === 1, "No real ZIP generated.");
    assert(
      await verifyStudioBg3dShotBatchArchiveBlob(archives[0]!),
      "Real archive verifier rejected tiled output.",
    );
    const capturesBeforeResume = captureCalls;
    await run();
    assert(!error, `Real resume failed: ${error}`);
    assert(
      Number(archives.length) === 2,
      "Completed recovery did not repackage verified artifacts.",
    );
    assert(
      captureCalls === capturesBeforeResume,
      "Completed recovery unnecessarily re-rendered the scene.",
    );
    assert(
      !capturing &&
        !ctx.captureInFlightRef.current &&
        !ctx.shotBatchAbortRef.current,
      "Batch completion leaked capture state.",
    );
    assert(
      serializeStudioBg3dSceneDocument(doc) === originalSerialized,
      "Read-only export mutated the canonical document.",
    );
    assert(
      JSON.stringify(viewport.readView()) ===
        JSON.stringify(originalDoc.camera),
      "Original viewport camera did not return.",
    );
    return {
      status: "ok",
      cancelledPartialArchive: false,
      canonicalSourcePreserved: true,
      cameraRestored: true,
      captureCalls,
      capturesBeforeResume,
      resumeReusedCompletedArtifacts: true,
      archiveBytes: archives.map((archive) => archive.size),
      archiveVerification: true,
      progress,
      summaries,
    };
  } finally {
    URL.createObjectURL = createUrl;
    ctx.shotBatchAbortRef.current?.abort();
  }
}
