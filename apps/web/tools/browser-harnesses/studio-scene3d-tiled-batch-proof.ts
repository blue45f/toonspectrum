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
  const draft = parseStudioBg3dSceneDocument(JSON.stringify({
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
  }));
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
    // 지원하지 않는 4K PSD는 캡처·다운로드 전에 거부되어야 한다. PNG로 조용히 대체하지 않는다.
    await createStudioBg3dShotBatchExportRunner(ctx)();
    assert(String(error).includes("타일 레이어 PSD"), "Unsupported 4K PSD was not rejected.");
    assert(Number(captureCalls) === 0 && Number(archives.length) === 0, "Rejected PSD captured or published output.");
    assert(!capturing && !ctx.captureInFlightRef.current, "Rejected PSD retained capture ownership.");
    // 사용자가 분리 PNG를 명시적으로 선택한 다음 같은 4K 출력·취소·복구 계약을 검사한다.
    const run = createStudioBg3dShotBatchExportRunner({ ...ctx, shotBatchIncludeLayeredPsd: false });
    await run();
    assert(!abortAtTile && captureCalls > 0, "Cancellation did not exercise a real tile capture.");
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
    // 지원 범위인 512px 컷에서는 실제 레이어 PSD를 생성하고 ZIP 정본 검증까지 통과시킨다.
    await createStudioBg3dShotBatchExportRunner({ ...ctx, shotBatchSelectedIds: ["small-reference"], shotBatchIncludeLayeredPsd: true })();
    assert(!error, `Supported PSD failed: ${error}`);
    const psdArchive = archives[2];
    assert(psdArchive && Number(archives.length) === 3, "Supported PSD did not publish exactly one archive.");
    assert(await verifyStudioBg3dShotBatchArchiveBlob(psdArchive), "Supported PSD archive failed verification.");
    const header = new DataView(await psdArchive.slice(0, 30).arrayBuffer());
    assert(header.getUint32(0, true) === 0x04034b50 && header.getUint16(8, true) === 0, "Manifest is not a stored ZIP entry.");
    const nameLength = header.getUint16(26, true), extraLength = header.getUint16(28, true);
    const manifestSize = header.getUint32(22, true), dataOffset = 30 + nameLength + extraLength;
    assert(await psdArchive.slice(30, 30 + nameLength).text() === "manifest.json", "Manifest entry is missing.");
    assert(manifestSize > 0 && manifestSize <= 2 * 1024 * 1024, "Invalid manifest size.");
    const manifest: unknown = JSON.parse(await psdArchive.slice(dataOffset, dataOffset + manifestSize).text());
    assert(manifest && typeof manifest === "object" && "artifacts" in manifest && Array.isArray(manifest.artifacts), "PSD manifest artifacts are missing.");
    assert(manifest.artifacts.some((item: unknown) => item && typeof item === "object" && "kind" in item && item.kind === "layered-psd"
      && "shotId" in item && item.shotId === "small-reference" && "width" in item && item.width === 512 && "height" in item && item.height === 512), "A real 512px layered PSD is missing.");
    assert(!capturing && !ctx.captureInFlightRef.current && !ctx.shotBatchAbortRef.current, "Supported PSD leaked capture ownership.");
    assert(serializeStudioBg3dSceneDocument(doc) === originalSerialized, "Supported PSD changed canonical source.");
    assert(JSON.stringify(viewport.readView()) === JSON.stringify(originalDoc.camera), "Supported PSD did not restore the camera.");
    return {
      status: "ok",
      unsupportedLargePsdRejected: true,
      explicitPngSelection: true,
      smallLayeredPsdProduced: true,
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
