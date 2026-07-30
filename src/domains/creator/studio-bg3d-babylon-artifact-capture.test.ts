import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  STUDIO_BG3D_NORMAL_PROFILE,
} from "./studio-bg3d-artifact-capture-v2";
import {
  createStudioBg3dBabylonCaptureExecutor,
  type StudioBg3dBabylonCapturePlan,
} from "./studio-bg3d-babylon-artifact-capture";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { StudioBg3dBabylonSpecialistExecutionContext } from
  "./studio-bg3d-babylon-specialist-runtime";
import type {
  StudioBg3dRuntimeAssetSnapshot,
  StudioBg3dSpecialistResult,
  StudioBg3dSpecialistRequest,
} from "./studio-bg3d-runtime-adapter";

function context(
  request: StudioBg3dSpecialistRequest,
  options: {
    readonly assets?: readonly StudioBg3dRuntimeAssetSnapshot[];
    readonly document?: StudioBg3dSceneDocument;
    readonly signal?: AbortSignal;
  } = {},
): StudioBg3dBabylonSpecialistExecutionContext {
  const document = options.document ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
  const canonicalDocumentJson = serializeStudioBg3dSceneDocument(document);
  if (!canonicalDocumentJson) throw new Error("Invalid test document.");
  return {
    backend: "webgl2",
    engine: { dispose() {} },
    epoch: 7,
    job: {
      id: "capture-test",
      request,
      signal: options.signal ?? new AbortController().signal,
      snapshot: {
        canonicalDocumentJson,
        assets: options.assets ?? [],
        totalAssetBytes: (options.assets ?? []).reduce((sum, asset) => sum + asset.byteSize, 0),
      },
    },
    scene: { dispose() {} },
    signal: options.signal ?? new AbortController().signal,
  };
}

function artifactRequest(
  artifacts: Extract<StudioBg3dSpecialistRequest, { kind: "artifact-capture-v2" }>["artifacts"],
): Extract<StudioBg3dSpecialistRequest, { kind: "artifact-capture-v2" }> {
  return {
    kind: "artifact-capture-v2",
    version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
    width: 2,
    height: 2,
    artifacts,
  };
}

function createGlb(root: Record<string, unknown>): Uint8Array {
  const encoded = new TextEncoder().encode(JSON.stringify(root));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(encoded, 20);
  return bytes;
}

function modelDocument(bytes: Uint8Array): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    attachments: [{
      id: "asset-1",
      name: "Verified model.glb",
      mime: "model/gltf-binary",
      byteSize: bytes.byteLength,
      hash: `sha256:${"a".repeat(64)}`,
      rights: {
        status: "owned",
        commercialUse: true,
        attributionRequired: false,
      },
      source: "upload",
    }],
    nodes: [{
      id: "model-1",
      name: "Model",
      kind: "model",
      attachmentId: "asset-1",
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
    }],
  });
}

function runtimeAsset(bytes: Uint8Array): StudioBg3dRuntimeAssetSnapshot {
  return {
    attachmentId: "asset-1",
    byteSize: bytes.byteLength,
    hash: `sha256:${"a".repeat(64)}`,
    readVerifiedBytes: () => Uint8Array.from(bytes),
  };
}

describe("Studio Babylon beauty/depth capture executor", () => {
  it("keeps runtime metrics cheap and does not parse or render the scene", async () => {
    const render = vi.fn();
    const execute = createStudioBg3dBabylonCaptureExecutor(render);

    await expect(execute(context({ kind: "runtime-metrics" }))).resolves.toEqual({
      kind: "metrics",
      values: {
        backend: "webgl2",
        capture: "beauty-depth-v1",
        engine: "babylon",
        epoch: 7,
        initialized: true,
      },
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("renders one canonical scene and emits truthful beauty/depth artifacts in request order", async () => {
    const rgba = Uint8Array.from([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16,
    ]);
    const depth = Float32Array.from([0, 0.25, 0.5, 1]);
    let received: StudioBg3dBabylonCapturePlan | undefined;
    const execute = createStudioBg3dBabylonCaptureExecutor(async (_context, plan) => {
      received = plan;
      return { rgba, depth };
    });

    const result = await execute(context(artifactRequest([
      { kind: "depth", profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE },
      { kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE },
    ]))) as StudioBg3dSpecialistResult;

    expect(received).toMatchObject({
      assets: [],
      backend: "webgl2",
      width: 2,
      height: 2,
      includeDepth: true,
    });
    expect(result).toMatchObject({
      kind: "studio-bg3d-artifact-capture",
      version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
      profile: STUDIO_BG3D_ARTIFACT_CAPTURE_PROFILE,
      width: 2,
      height: 2,
      artifacts: [
        {
          kind: "depth",
          profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
          data: depth,
        },
        {
          kind: "beauty",
          profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
          data: rgba,
        },
      ],
    });
    rgba[0] = 255;
    depth[0] = 1;
    expect(result.kind === "studio-bg3d-artifact-capture" && result.artifacts[0]?.data[0])
      .toBe(0);
    expect(result.kind === "studio-bg3d-artifact-capture" && result.artifacts[1]?.data[0])
      .toBe(1);
  });

  it("loads only defensive copies of exact verified GLB snapshots", async () => {
    const bytes = createGlb({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{}],
    });
    const original = Uint8Array.from(bytes);
    let admittedBytes: Uint8Array | undefined;
    const render = vi.fn(async (_context, plan: StudioBg3dBabylonCapturePlan) => {
      admittedBytes = plan.assets[0]?.bytes;
      return {
        rgba: new Uint8Array(16),
        depth: new Float32Array(4),
      };
    });
    const execute = createStudioBg3dBabylonCaptureExecutor(render);
    await execute(context(
      artifactRequest([
        { kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE },
        { kind: "depth", profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE },
      ]),
      {
        assets: [runtimeAsset(original)],
        document: modelDocument(original),
      },
    ));

    expect(render).toHaveBeenCalledOnce();
    expect(admittedBytes).toEqual(bytes);
    expect(admittedBytes).not.toBe(original);
    original.fill(0);
    expect(admittedBytes?.[0]).toBe(0x67);
  });

  it("fails closed before rendering unsupported artifacts and scene semantics", async () => {
    const render = vi.fn();
    const execute = createStudioBg3dBabylonCaptureExecutor(render);

    await expect(execute(context(artifactRequest([
      { kind: "normal", profile: STUDIO_BG3D_NORMAL_PROFILE },
    ])))).rejects.toMatchObject({ code: "unsupported-artifact" });

    const orthographic = normalizeStudioBg3dSceneDocument({
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
        projection: "orthographic",
      },
    });
    await expect(execute(context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      { document: orthographic },
    ))).rejects.toMatchObject({ code: "unsupported-scene-feature" });
    expect(render).not.toHaveBeenCalled();
  });

  it("rejects self-externalizing or decoder-dependent GLBs before Babylon sees bytes", async () => {
    const render = vi.fn();
    const execute = createStudioBg3dBabylonCaptureExecutor(render);
    const external = createGlb({
      asset: { version: "2.0" },
      buffers: [{ byteLength: 8, uri: "https://example.invalid/model.bin" }],
      scene: 0,
      scenes: [{}],
    });
    await expect(execute(context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      {
        assets: [runtimeAsset(external)],
        document: modelDocument(external),
      },
    ))).rejects.toMatchObject({ code: "unsafe-glb" });

    const nestedExternal = createGlb({
      asset: { version: "2.0" },
      extensions: {
        VENDOR_payload: {
          nested: { uri: "data:application/octet-stream;base64,AA==" },
        },
      },
      scene: 0,
      scenes: [{}],
    });
    await expect(execute(context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      {
        assets: [runtimeAsset(nestedExternal)],
        document: modelDocument(nestedExternal),
      },
    ))).rejects.toMatchObject({ code: "unsafe-glb" });

    const decoderBacked = createGlb({
      asset: { version: "2.0" },
      extensionsRequired: ["KHR_draco_mesh_compression"],
      scene: 0,
      scenes: [{}],
    });
    await expect(execute(context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      {
        assets: [runtimeAsset(decoderBacked)],
        document: modelDocument(decoderBacked),
      },
    ))).rejects.toMatchObject({ code: "unsupported-scene-feature" });

    const unbudgetedTexture = createGlb({
      asset: { version: "2.0" },
      images: [{ bufferView: 0, mimeType: "image/png" }],
      textures: [{ source: 0 }],
      scene: 0,
      scenes: [{}],
    });
    await expect(execute(context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      {
        assets: [runtimeAsset(unbudgetedTexture)],
        document: modelDocument(unbudgetedTexture),
      },
    ))).rejects.toMatchObject({ code: "unsupported-scene-feature" });
    expect(render).not.toHaveBeenCalled();
  });

  it("propagates abort without invoking the renderer", async () => {
    const controller = new AbortController();
    controller.abort();
    const render = vi.fn();
    const execute = createStudioBg3dBabylonCaptureExecutor(render);
    const executionContext = context(
      artifactRequest([{ kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE }]),
      { signal: controller.signal },
    );

    await expect(execute(executionContext)).rejects.toMatchObject({ code: "aborted" });
    expect(render).not.toHaveBeenCalled();
  });
});
