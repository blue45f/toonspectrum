import { describe, expect, it } from "vitest";

import {
  resolveStudioUserWorkState,
  shouldAnnounceStudioWorkStateChange,
  validateStudioInternalWorkSignals,
  type StudioInternalWorkSignals,
} from "./studio-work-state";

const SAVED: StudioInternalWorkSignals = Object.freeze({
  localSnapshotSafe: true,
  cloudSynced: true,
  online: true,
  pendingLocalChanges: 0,
  activeJobs: 0,
  queuedJobs: 0,
  retrying: false,
  blockingIssues: 0,
  recoverableConflict: false,
  storagePressure: false,
  saveFailed: false,
  lastSavedAt: "2026-09-11T00:00:00.000Z",
});

describe("Studio user-facing work state", () => {
  it("shows a quiet saved state without a success toast", () => {
    expect(resolveStudioUserWorkState(SAVED)).toMatchObject({
      id: "saved",
      labelKo: "저장됨",
      requiresAttention: false,
      blocksClose: false,
      showSpinner: false,
      showSuccessToast: false,
    });
  });

  it("shows processing while saving or running jobs without exposing queue internals", () => {
    expect(resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      pendingLocalChanges: 2,
    })).toMatchObject({
      id: "processing",
      labelKo: "처리 중",
      showSpinner: true,
      blocksClose: false,
    });
    expect(resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      activeJobs: 3,
    })).toMatchObject({
      id: "processing",
      detailKo: "작업 3건을 처리하고 있습니다. 원고 편집은 계속할 수 있습니다.",
    });
  });

  it("shows offline-safe only when a durable local snapshot exists", () => {
    expect(resolveStudioUserWorkState({
      ...SAVED,
      online: false,
      cloudSynced: false,
    })).toMatchObject({
      id: "offline-safe",
      labelKo: "오프라인에서도 안전",
      blocksClose: false,
    });
    expect(resolveStudioUserWorkState({
      ...SAVED,
      online: false,
      cloudSynced: false,
      localSnapshotSafe: false,
    })).toMatchObject({
      id: "attention",
      blocksClose: true,
      attentionReasons: ["missing-local-copy"],
    });
  });

  it("gives attention priority over processing and keeps every actionable reason", () => {
    const state = resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      pendingLocalChanges: 2,
      activeJobs: 1,
      blockingIssues: 2,
      recoverableConflict: true,
      storagePressure: true,
    });
    expect(state).toMatchObject({
      id: "attention",
      labelKo: "확인할 내용이 있어요",
      requiresAttention: true,
      blocksClose: false,
      attentionReasons: ["conflict", "storage-pressure", "blocking-issue"],
    });
    expect(state.detailKo).toContain("모두 보관");
  });

  it("blocks closing only when current changes are not safely retained", () => {
    expect(resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      saveFailed: true,
    })).toMatchObject({ id: "attention", blocksClose: true });
    expect(resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      pendingLocalChanges: 3,
      localSnapshotSafe: true,
    })).toMatchObject({ id: "processing", blocksClose: false });
  });

  it("announces only meaningful state changes instead of every reconnect tick", () => {
    const saved = resolveStudioUserWorkState(SAVED);
    const processing = resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      pendingLocalChanges: 1,
    });
    const offline = resolveStudioUserWorkState({
      ...SAVED,
      online: false,
      cloudSynced: false,
    });
    const attention = resolveStudioUserWorkState({
      ...SAVED,
      cloudSynced: false,
      recoverableConflict: true,
    });
    expect(shouldAnnounceStudioWorkStateChange(null, saved)).toBe(false);
    expect(shouldAnnounceStudioWorkStateChange(saved, processing)).toBe(false);
    expect(shouldAnnounceStudioWorkStateChange(processing, offline)).toBe(true);
    expect(shouldAnnounceStudioWorkStateChange(offline, attention)).toBe(true);
    expect(shouldAnnounceStudioWorkStateChange(attention, saved)).toBe(true);
    expect(shouldAnnounceStudioWorkStateChange(processing, processing)).toBe(false);
  });

  it("rejects contradictory internal signals before presenting false reassurance", () => {
    expect(validateStudioInternalWorkSignals({
      ...SAVED,
      pendingLocalChanges: 1,
    })).toContain("cloud-sync-contradiction");
    expect(validateStudioInternalWorkSignals({
      ...SAVED,
      online: false,
      cloudSynced: false,
      retrying: true,
    })).toContain("offline-retrying");
    expect(() => resolveStudioUserWorkState({
      ...SAVED,
      activeJobs: -1,
    })).toThrow(/Invalid Studio work signals/u);
  });
});
