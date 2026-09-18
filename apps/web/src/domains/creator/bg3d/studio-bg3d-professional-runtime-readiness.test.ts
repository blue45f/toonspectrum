import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  deriveStudioBg3dProfessionalDeviceCapabilities,
  resolveStudioBg3dProfessionalRuntimeReadiness,
} from "./studio-bg3d-professional-runtime-readiness";

const BOX: BgPrimitive = {
  id: "box-a",
  kind: "box",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#ffffff",
};

const WEBGPU_PLAN = Object.freeze({
  backend: "webgpu" as const,
  runtimeId: "three-webgpu" as const,
  status: "available" as const,
  reason: "user-webgpu-override" as const,
  notice: "ready",
  diagnostics: Object.freeze([]),
});

const WEBGPU_PROBE = Object.freeze({
  supported: true,
  reason: "available" as const,
  computeSupported: true,
  timestampQuerySupported: true,
  limits: Object.freeze({ maxComputeWorkgroupSizeX: 256 }),
});

function capabilities() {
  return deriveStudioBg3dProfessionalDeviceCapabilities({
    enginePlan: WEBGPU_PLAN,
    webGpuProbe: WEBGPU_PROBE,
    deviceSignals: { deviceMemoryGb: 8 },
    maxTextureDimension2d: 8192,
    compressedTextureAstc: true,
    float16Shaders: true,
  });
}

function readiness(
  patch: Partial<Parameters<typeof resolveStudioBg3dProfessionalRuntimeReadiness>[0]> = {},
) {
  return resolveStudioBg3dProfessionalRuntimeReadiness({
    authorityId: "bg3d:document-a",
    primitives: [BOX],
    customModels: [],
    attachmentByStorageModelId: new Map(),
    baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    viewportAspectRatio: 1,
    revision: 4,
    capabilities: capabilities(),
    ...patch,
  });
}

describe("Studio BG3D professional runtime readiness", () => {
  it("projects live runtime objects into one authority before planning render passes", () => {
    const result = readiness();
    expect(result.status).toBe("ready");
    expect(result.productionReady).toBe(true);
    expect(result.authority?.document.entities).toContainEqual(
      expect.objectContaining({ id: "box-a", kind: "primitive" }),
    );
    expect(result.summary).toMatchObject({
      authorityId: "bg3d:document-a",
      entityCount: 1,
      primaryRenderer: "three-webgpu",
    });
    expect(result.summary.enabledPassCount).toBeGreaterThanOrEqual(8);
  });

  it("fails closed while preserving the canonical authority receipt when the renderer is unavailable", () => {
    const result = readiness({
      capabilities: { ...capabilities(), webgpu: false, webgl2: false },
      runtimeFailure: {
        kind: "webgpu-device-lost",
        attempt: 1,
        recoverable: false,
      },
    });
    expect(result).toMatchObject({
      status: "blocked",
      failureCode: "renderer-unavailable",
      editorReady: false,
      productionReady: false,
    });
    expect(result.authority?.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.recovery).toMatchObject({
      action: "offer-explicit-webgl2-switch",
      preservesDocumentAuthority: true,
      requiresUserConfirmation: true,
    });
  });

  it("keeps Babylon outside scene ownership and only counts enabled specialist passes", () => {
    const result = readiness({ babylonSpecialistAvailable: true });
    expect(result.summary.specialistPassCount).toBe(0);
    expect(result.plan?.renderGraph.passes.find(({ id }) => id === "fx-overlay")).toMatchObject({
      executor: "babylon-specialist",
      enabled: false,
    });
    expect(result.authority?.kind).toBe("toonspectrum.scene3d-authority");
  });
});
