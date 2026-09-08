import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enableStudio3dHighAssetQuality,
  getStudio3dAssetQualityMode,
  getStudio3dAssetQualitySnapshot,
  resetStudio3dAssetQualityMode,
} from "../studio-3d-asset-quality-session";

import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { StudioBg3dStaleModalOperationError } from "./studio-bg3d-modal-operation-coordinator";
import {
  admitAndCacheStudioBg3dModel,
  type StudioBg3dModelRootCacheEntry,
} from "./studio-bg3d-model-runtime-admission";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";

const mocks = vi.hoisted(() => ({ admit: vi.fn(), load: vi.fn() }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ admitStoredBg3dModelForRenderingV12: mocks.admit }));
vi.mock("../studio-background-3d-model", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-background-3d-model")>(),
  loadVerifiedStudioBg3dGlbWithThree: mocks.load,
}));

function loadedModel() {
  return {
    ok: true as const,
    root: new Group(),
    animations: [],
    dispose: vi.fn(),
    metrics: { nodes: 1, triangles: 1, drawCalls: 1, materials: 1, lights: 0, animations: 0, animationChannels: 0, animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0, accessorElements: 3, estimatedDecodedGeometryBytes: 36, textures: 0, textureBytes: 0, maxTextureDimension: 0 },
  };
}

function context(): Parameters<typeof admitAndCacheStudioBg3dModel>[0] {
  const document = createDefaultStudioBg3dSceneDocument();
  // Persistence and binary validation are mocked; these are the immutable fields used by this boundary.
  const record = {
    id: "session-quality-model",
    contentHash: `sha256:${"a".repeat(64)}`,
    byteSize: 100,
    mime: "model/gltf-binary",
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  } as Bg3dVerifiedStoredRecord;
  return {
    record,
    document,
    quality: resolveStudioBg3dDeviceQuality({ document, mode: "capture", preference: "mobile", signals: { cssWidth: 375, cssHeight: 812, devicePixelRatio: 2, pointer: "coarse", saveData: false, deviceMemoryGb: 6, hardwareConcurrency: 8 } }),
    cumulativeUsedBytes: 0,
    renderer: null,
    cache: new Map<string, StudioBg3dModelRootCacheEntry>(),
    pending: new Map<string, Promise<StudioBg3dModelRootCacheEntry>>(),
    isActive: () => true,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => {
  resetStudio3dAssetQualityMode();
  mocks.admit.mockReset().mockResolvedValue({ admitted: true });
  mocks.load.mockReset().mockImplementation(async () => loadedModel());
});
afterEach(() => resetStudio3dAssetQualityMode());

describe("session model admission and cache authorization", () => {
  it("reuses only an identical policy fingerprint", async () => {
    const args = context();
    enableStudio3dHighAssetQuality();
    const first = await admitAndCacheStudioBg3dModel(args);
    expect(await admitAndCacheStudioBg3dModel(args)).toBe(first);
    expect(mocks.admit).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(first.admissionPolicyKeys?.size).toBe(1);
  });

  it("does not let a cached high-profile approval bypass automatic admission", async () => {
    const args = context();
    mocks.admit.mockImplementation(async (_id, options) => {
      if (options.budgets.mobile.textures.maxTotalBytes < 144 * 1024 * 1024) throw new Error("texture-byte-budget-exceeded");
      return { admitted: true };
    });
    enableStudio3dHighAssetQuality();
    const entry = await admitAndCacheStudioBg3dModel(args);
    expect(entry.admittedProfiles.has("mobile")).toBe(true);
    resetStudio3dAssetQualityMode();
    await expect(admitAndCacheStudioBg3dModel(args)).rejects.toThrow("texture-byte-budget-exceeded");
    expect(mocks.admit).toHaveBeenCalledTimes(2);
    expect(mocks.admit.mock.calls[1][1].budgets.mobile.textures.maxTotalBytes).toBe(128 * 1024 * 1024);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(getStudio3dAssetQualitySnapshot()).toEqual({ mode: "auto", notice: null });
  });

  it("revalidates legacy profile-only cache entries instead of treating them as authorized", async () => {
    const args = context();
    const entry = await admitAndCacheStudioBg3dModel(args);
    delete entry.admissionPolicyKeys;
    expect(entry.admittedProfiles.has("mobile")).toBe(true);
    const readmitted = await admitAndCacheStudioBg3dModel(args);
    expect(mocks.admit).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(readmitted).toBe(entry);
    expect(readmitted.admissionPolicyKeys?.size).toBe(1);
  });

  it("does not decode if policy changes during binary validation", async () => {
    const args = context();
    const validation = deferred<{ admitted: boolean }>();
    mocks.admit.mockReturnValue(validation.promise);
    enableStudio3dHighAssetQuality();
    const loading = admitAndCacheStudioBg3dModel(args);
    const rejection = expect(loading).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.admit).toHaveBeenCalledOnce());
    resetStudio3dAssetQualityMode();
    validation.resolve({ admitted: true });
    await rejection;
    expect(mocks.load).not.toHaveBeenCalled();
    expect(args.cache.size).toBe(0);
    expect(args.pending.size).toBe(0);
  });

  it("disposes a decoded high-quality root when the mode changes before installation", async () => {
    const args = context();
    const decode = deferred<ReturnType<typeof loadedModel>>();
    const loaded = loadedModel();
    mocks.load.mockReturnValue(decode.promise);
    enableStudio3dHighAssetQuality();
    const loading = admitAndCacheStudioBg3dModel(args);
    const rejection = expect(loading).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    resetStudio3dAssetQualityMode();
    decode.resolve(loaded);
    await rejection;
    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(args.cache.size).toBe(0);
    expect(args.pending.size).toBe(0);
    expect(getStudio3dAssetQualitySnapshot()).toEqual({ mode: "auto", notice: null });
  });

  it("returns to automatic mode after a genuine high-quality load failure", async () => {
    mocks.load.mockRejectedValue(new Error("GPU allocation failed"));
    enableStudio3dHighAssetQuality();
    await expect(admitAndCacheStudioBg3dModel(context())).rejects.toThrow("GPU allocation failed");
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    expect(getStudio3dAssetQualitySnapshot().notice).toContain("경량본으로 다시 가져오세요");
  });

  it.each([
    ["AbortError", () => new DOMException("cancelled", "AbortError")],
    ["worker cancellation", () => Object.assign(new Error("cancelled"), { code: "aborted" })],
    ["stale operation", () => new StudioBg3dStaleModalOperationError()],
  ] as const)("does not reset a high-quality session for %s", async (_name, errorFactory) => {
    const error = errorFactory();
    mocks.admit.mockRejectedValue(error);
    enableStudio3dHighAssetQuality();
    const snapshot = getStudio3dAssetQualitySnapshot();
    await expect(admitAndCacheStudioBg3dModel(context())).rejects.toBe(error);
    expect(getStudio3dAssetQualitySnapshot()).toBe(snapshot);
  });

  it("does not reset a high-quality session for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    enableStudio3dHighAssetQuality();
    await expect(admitAndCacheStudioBg3dModel({ ...context(), signal: controller.signal })).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(getStudio3dAssetQualityMode()).toBe("high");
    expect(mocks.admit).not.toHaveBeenCalled();
  });
});
