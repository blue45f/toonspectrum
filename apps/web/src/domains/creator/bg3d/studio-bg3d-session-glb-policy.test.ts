import { beforeEach, describe, expect, it } from "vitest";

import {
  enableStudio3dHighAssetQuality,
  resetStudio3dAssetQualityMode,
} from "../studio-3d-asset-quality-session";

import {
  deriveStudioBg3dGlbValidationPolicy,
  resolveStudioBg3dDeviceQuality,
} from "./studio-bg3d-device-quality";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "./studio-bg3d-session-glb-policy";

const MIB = 1024 * 1024;

function quality(document: ReturnType<typeof createDefaultStudioBg3dSceneDocument>, preference: "mobile" | "desktop" = "mobile") {
  return resolveStudioBg3dDeviceQuality({
    document,
    mode: "capture",
    preference,
    signals: { cssWidth: 1440, cssHeight: 900, devicePixelRatio: 2, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 },
  });
}

beforeEach(() => resetStudio3dAssetQualityMode());

describe("session-only GLB quality policy", () => {
  it("keeps automatic mobile admission at 128 MiB", () => {
    const document = createDefaultStudioBg3dSceneDocument();
    const resolved = quality(document);
    const policy = deriveStudioBg3dSessionGlbValidationPolicy(document, resolved);
    expect(policy).toEqual(deriveStudioBg3dGlbValidationPolicy(document, resolved));
    expect(policy.budgets.mobile.textures.maxTotalBytes).toBe(128 * MIB);
  });

  it("widens only the mobile texture allowance, without mutating device or document settings", () => {
    const document = createDefaultStudioBg3dSceneDocument();
    const resolved = quality(document);
    const original = structuredClone({ document, resolved });
    const base = deriveStudioBg3dGlbValidationPolicy(document, resolved);
    enableStudio3dHighAssetQuality();
    const high = deriveStudioBg3dSessionGlbValidationPolicy(document, resolved);
    expect(high.profile).toBe("mobile");
    expect(high.budgets.mobile).toEqual({ ...base.budgets.mobile, textures: { ...base.budgets.mobile.textures, maxTotalBytes: 256 * MIB } });
    expect(high.budgets.desktop).toEqual(base.budgets.desktop);
    expect({ document, resolved }).toEqual(original);
    expect(deriveStudioBg3dGlbValidationPolicy(document, resolved)).toEqual(base);
  });

  it.each([64, 96, 192])("honors a stricter %i MiB project texture allowance", (limit) => {
    const base = createDefaultStudioBg3dSceneDocument();
    const document = { ...base, budgets: { ...base.budgets, textures: { ...base.budgets.textures, maxTotalBytes: limit * MIB } } };
    enableStudio3dHighAssetQuality();
    expect(deriveStudioBg3dSessionGlbValidationPolicy(document, quality(document)).budgets.mobile.textures.maxTotalBytes).toBe(limit * MIB);
  });

  it("does not change desktop admission or renderer quality", () => {
    const document = createDefaultStudioBg3dSceneDocument();
    const resolved = quality(document, "desktop");
    const base = deriveStudioBg3dGlbValidationPolicy(document, resolved);
    enableStudio3dHighAssetQuality();
    expect(deriveStudioBg3dSessionGlbValidationPolicy(document, resolved)).toEqual(base);
  });

  it("returns to the automatic policy after reset", () => {
    const document = createDefaultStudioBg3dSceneDocument();
    const resolved = quality(document);
    enableStudio3dHighAssetQuality();
    expect(deriveStudioBg3dSessionGlbValidationPolicy(document, resolved).budgets.mobile.textures.maxTotalBytes).toBe(256 * MIB);
    resetStudio3dAssetQualityMode();
    expect(deriveStudioBg3dSessionGlbValidationPolicy(document, resolved).budgets.mobile.textures.maxTotalBytes).toBe(128 * MIB);
  });
});
