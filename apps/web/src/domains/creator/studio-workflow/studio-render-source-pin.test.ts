import { describe, expect, it } from "vitest";

import type { StudioAssetReferenceV2 } from "./studio-asset-reference-v2";

import {
  compareStudioMotionSourceToCurrent,
  compareStudioSceneReceiptToSource,
  sceneReceiptMatchesOutput,
  validateStudioEmbeddedSceneReference,
  validateStudioMotionRenderReceipt,
  validateStudioMotionSourcePin,
  validateStudioRenderedSceneReceipt,
  type StudioEmbeddedSceneReferenceV1,
  type StudioMotionRenderReceiptV1,
  type StudioMotionSourcePinV1,
  type StudioRenderedSceneReceiptV1,
} from "./studio-render-source-pin";

const NOW = "2026-09-07T00:00:00.000Z";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function asset(
  assetId: string,
  revisionId: string,
  contentHash: string,
  mimeType = "image/png",
): StudioAssetReferenceV2 {
  return {
    version: 2,
    assetId,
    revisionId,
    contentHash,
    mimeType,
    byteLength: 1024,
    width: mimeType.startsWith("image/") ? 800 : null,
    height: mimeType.startsWith("image/") ? 1280 : null,
    durationMs: mimeType.startsWith("video/") ? 5000 : null,
    origin: "generated",
    createdAt: NOW,
    licenseRevisionId: null,
  };
}

function scene(): StudioEmbeddedSceneReferenceV1 {
  return {
    version: 1,
    sceneAsset: asset("scene-1", "scene-1:r8", HASH_A, "model/gltf-binary"),
    engine: "three",
    cameraId: "camera-1",
    poseRevisionId: "pose-r2",
    lightingRevisionId: "light-r3",
    renderPresetId: "line-art-v2",
  };
}

function sceneReceipt(): StudioRenderedSceneReceiptV1 {
  const source = scene();
  return {
    version: 1,
    id: "scene-render-1",
    sourceSceneAssetId: source.sceneAsset.assetId,
    sourceSceneRevisionId: source.sceneAsset.revisionId,
    sourceSceneContentHash: source.sceneAsset.contentHash,
    engine: source.engine,
    cameraId: source.cameraId,
    poseRevisionId: source.poseRevisionId,
    lightingRevisionId: source.lightingRevisionId,
    renderPresetId: source.renderPresetId,
    output: asset("render-1", "render-1:r1", HASH_B),
    depth: null,
    normal: null,
    objectIdMask: null,
    renderedAt: NOW,
  };
}

function motionSource(): StudioMotionSourcePinV1 {
  return {
    version: 1,
    workId: "work-1",
    sourceServerRevision: 42,
    sourceContentDigest: "digest-r42",
    semanticPanelIds: ["panel-1", "panel-2"],
    createdAt: NOW,
  };
}

describe("Studio render source pins", () => {
  it("validates an embedded 3d source and matching render receipt", () => {
    expect(validateStudioEmbeddedSceneReference(scene())).toEqual([]);
    expect(validateStudioRenderedSceneReceipt(sceneReceipt())).toEqual([]);
    expect(compareStudioSceneReceiptToSource({
      source: scene(),
      receipt: sceneReceipt(),
    })).toEqual({ stale: false, reasons: [] });
    expect(sceneReceiptMatchesOutput(sceneReceipt(), sceneReceipt().output)).toBe(true);
  });

  it("detects scene, camera, pose, lighting, engine, and preset drift", () => {
    const source = scene();
    const receipt = {
      ...sceneReceipt(),
      sourceSceneRevisionId: "scene-1:r7",
      sourceSceneContentHash: HASH_B,
      engine: "babylon" as const,
      cameraId: "camera-2",
      poseRevisionId: "pose-r1",
      lightingRevisionId: null,
      renderPresetId: "flat-color-v1",
    };

    expect(compareStudioSceneReceiptToSource({ source, receipt }).reasons).toEqual(
      expect.arrayContaining([
        "scene-revision",
        "scene-content-hash",
        "engine",
        "camera",
        "pose",
        "lighting",
        "render-preset",
      ]),
    );
  });

  it("pins motion to an authoring digest, server revision, and panel set", () => {
    const source = motionSource();
    expect(validateStudioMotionSourcePin(source)).toEqual([]);
    expect(compareStudioMotionSourceToCurrent(source, {
      serverRevision: 42,
      contentDigest: "digest-r42",
      semanticPanelIds: ["panel-2", "panel-1"],
    })).toEqual({ stale: false, reasons: [] });

    expect(compareStudioMotionSourceToCurrent(source, {
      serverRevision: 43,
      contentDigest: "digest-r43",
      semanticPanelIds: ["panel-1", "panel-3"],
    }).reasons).toEqual(expect.arrayContaining([
      "motion-server-revision",
      "motion-content-digest",
      "motion-panel-set",
    ]));
  });

  it("validates a bounded motion render receipt", () => {
    const receipt: StudioMotionRenderReceiptV1 = {
      version: 1,
      id: "motion-render-1",
      motionDocumentId: "motion-document-1",
      source: motionSource(),
      range: { startMs: 0, endMs: 5000 },
      frameRate: 24,
      output: asset("motion-output", "motion-output:r1", HASH_B, "video/mp4"),
      renderedAt: NOW,
    };

    expect(validateStudioMotionRenderReceipt(receipt)).toEqual([]);
    expect(validateStudioMotionRenderReceipt({
      ...receipt,
      range: { startMs: 5000, endMs: 1000 },
      frameRate: 300,
    }).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "invalid-time-range",
      "invalid-frame-rate",
    ]));
  });

  it("rejects duplicate motion panels and missing source digests", () => {
    const invalid = {
      ...motionSource(),
      sourceContentDigest: "",
      semanticPanelIds: ["panel-1", "panel-1"],
    };

    expect(validateStudioMotionSourcePin(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing-source-digest", "duplicate-panel-id"]),
    );
  });
});
