import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");

describe("Studio VRM full-body editor integration boundary", () => {
  it("invalidates an active IK transaction before history restore and stale pointer release", () => {
    const restoreStart = source.indexOf("const restoreHistoryStep =");
    const cancel = source.indexOf("cancelJointIkTransaction({", restoreStart);
    const restore = source.indexOf("commitFullStateRestore(snap, currentVrm)", restoreStart);

    expect(restoreStart).toBeGreaterThan(-1);
    expect(cancel).toBeGreaterThan(restoreStart);
    expect(restore).toBeGreaterThan(cancel);
    expect(source).toContain("transaction.revision !== jointIkRevisionRef.current");
    expect(source).toContain("key={jointHandleSessionGeneration}");
    expect(source).toContain("jointIkTransactionRef.current = null;");
  });

  it("keeps full-body translations in custom pose save, copy, select, and paste paths", () => {
    expect(source).toContain(
      "poseTranslations: cloneStudioVrmPoseTranslations(poseTranslations),",
    );
    expect(source).toContain(
      "normalizeStudioVrmPoseTranslations(pose.poseTranslations)",
    );
    expect(source).toContain(
      "normalizeStudioVrmPoseTranslations(parsed.poseTranslations)",
    );
    expect(source).toContain("poseTranslations: nextTranslations,");
    expect(source).toContain("pastedTranslations,");
  });
});
