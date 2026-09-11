import { describe, expect, it } from "vitest";

import {
  planStudioAssetUpdate,
  type StudioInstalledAssetVersion,
} from "./studio-asset-update";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const INSTALLED: StudioInstalledAssetVersion = Object.freeze({
  assetId: "school-background",
  version: "1.2.0",
  checksum: HASH_A,
  pinnedVersion: null,
  capabilities: ["3d.camera", "3d.line-pass"],
  compatibilityTargets: ["web", "desktop"],
  dependencies: [],
  rightsStatus: "allowed",
});
const CONTEXT = Object.freeze({
  requiredCapabilities: ["3d.camera", "3d.line-pass"],
  activeCompatibilityTargets: ["web"],
  allowDowngrade: false,
  allowPinnedUpdate: false,
  warningAccepted: false,
  plannedAt: "2026-09-11T00:00:00.000Z",
});

describe("Studio asset update", () => {
  it("creates a rollback receipt for a compatible upgrade", () => {
    expect(planStudioAssetUpdate(INSTALLED, {
      ...INSTALLED,
      version: "1.3.0",
      checksum: HASH_B,
    }, CONTEXT)).toMatchObject({
      status: "ready",
      blockingCodes: [],
      warningCodes: [],
      rollback: {
        previousVersion: "1.2.0",
        previousChecksum: HASH_A,
        targetVersion: "1.3.0",
      },
    });
  });

  it("returns noop for identical content", () => {
    expect(planStudioAssetUpdate(INSTALLED, INSTALLED, CONTEXT)).toEqual({
      status: "noop",
      blockingCodes: [],
      warningCodes: [],
      rollback: null,
    });
  });

  it("blocks pinned, incompatible, unresolved and rights-regressing updates", () => {
    const plan = planStudioAssetUpdate({
      ...INSTALLED,
      pinnedVersion: "1.2.0",
    }, {
      ...INSTALLED,
      version: "2.0.0",
      checksum: HASH_B,
      capabilities: ["3d.camera"],
      compatibilityTargets: ["desktop"],
      dependencies: [{ assetId: "material-pack", versionRange: ">=2", resolved: false }],
      rightsStatus: "blocked",
    }, CONTEXT);
    expect(plan.status).toBe("blocked");
    expect(plan.rollback).toBeNull();
    expect(plan.blockingCodes).toEqual(expect.arrayContaining([
      "version-pinned",
      "required-capability-missing",
      "compatibility-regression",
      "dependency-unresolved",
      "rights-regression",
    ]));
  });

  it("requires review when rights become conditional or same-version bytes change", () => {
    const plan = planStudioAssetUpdate(INSTALLED, {
      ...INSTALLED,
      checksum: HASH_B,
      rightsStatus: "warning",
    }, CONTEXT);
    expect(plan.status).toBe("review");
    expect(plan.warningCodes).toEqual(expect.arrayContaining([
      "rights-review-required",
      "same-version-content-changed",
      "warning-confirmation-required",
    ]));
    expect(plan.rollback).not.toBeNull();
    expect(planStudioAssetUpdate(INSTALLED, {
      ...INSTALLED,
      checksum: HASH_B,
      rightsStatus: "warning",
    }, { ...CONTEXT, warningAccepted: true }).status).toBe("ready");
  });
});
