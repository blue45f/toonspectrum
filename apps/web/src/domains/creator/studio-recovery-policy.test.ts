import { describe, expect, it } from "vitest";

import {
  planStudioRecovery,
  validateStudioRecoverySnapshot,
  type StudioRecoverySnapshot,
} from "./studio-recovery-policy";

const SNAPSHOT: StudioRecoverySnapshot = Object.freeze({
  documentId: "document-1",
  journalIntegrity: "healthy",
  localRevision: 12,
  cloudRevision: 12,
  pendingOperationCount: 0,
  activeJobCount: 0,
  queuedJobCount: 0,
  cloudState: "synced",
  online: true,
  storageUsageRatio: 0.4,
  recoverableCopyIds: ["copy-11", "copy-12"],
  lastLocalSaveAt: "2026-09-11T00:00:00.000Z",
  lastCloudSaveAt: "2026-09-11T00:00:01.000Z",
  nextRetryAt: null,
});

describe("Studio recovery policy", () => {
  it("keeps healthy synchronized work quiet and safe", () => {
    expect(validateStudioRecoverySnapshot(SNAPSHOT)).toEqual([]);
    expect(planStudioRecovery(SNAPSHOT)).toMatchObject({
      userState: { id: "saved", showSuccessToast: false },
      canCloseSafely: true,
      autoRestoreCopyId: null,
      preserveBothConflictVersions: false,
      actions: [{ id: "continue", automatic: true }],
    });
  });

  it("preserves both conflicting versions and never proposes destructive resolution", () => {
    const plan = planStudioRecovery({ ...SNAPSHOT, cloudState: "conflict", cloudRevision: 13 });
    expect(plan).toMatchObject({
      userState: { id: "attention", attentionReasons: ["conflict"] },
      preserveBothConflictVersions: true,
    });
    expect(plan.actions.map((item) => item.id)).toEqual([
      "compare-conflict",
      "download-safety-copy",
    ]);
    expect(plan.actions.every((item) => item.destructive === false)).toBe(true);
  });

  it("automatically selects a safe copy only for repairable journals", () => {
    expect(planStudioRecovery({
      ...SNAPSHOT,
      journalIntegrity: "repairable",
      cloudState: "offline",
      online: false,
    })).toMatchObject({
      autoRestoreCopyId: "copy-12",
      userState: { id: "offline-safe" },
    });
    expect(planStudioRecovery({
      ...SNAPSHOT,
      journalIntegrity: "corrupt",
      cloudState: "error",
      recoverableCopyIds: [],
    })).toMatchObject({
      autoRestoreCopyId: null,
      canCloseSafely: false,
      userState: { id: "attention" },
    });
  });

  it("surfaces storage pressure without exposing storage implementation details", () => {
    const plan = planStudioRecovery({ ...SNAPSHOT, storageUsageRatio: 0.95 });
    expect(plan.userState).toMatchObject({ id: "attention", attentionReasons: ["storage-pressure"] });
    expect(plan.actions).toContainEqual(expect.objectContaining({ id: "free-storage" }));
  });

  it("rejects contradictory synchronization state", () => {
    expect(validateStudioRecoverySnapshot({
      ...SNAPSHOT,
      cloudState: "synced",
      pendingOperationCount: 2,
    })).toContain("synced-with-pending-operations");
  });
});
