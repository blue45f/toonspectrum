import { describe, expect, it } from "vitest";

import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "./live/studio-live-sync-safety";
import {
  resolveStudioDraftOperationSyncAssistant,
  type StudioDraftOperationSyncAssistantInput,
} from "./studio-draft-operation-sync-assistant-model";

function input(
  overrides: Partial<StudioDraftOperationSyncAssistantInput> = {},
): StudioDraftOperationSyncAssistantInput {
  return {
    liveContextAvailable: true,
    syncPhase: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.phase,
    pendingCount: 0,
    persistenceDurability: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.persistenceDurability,
    editsDurablyProtected: INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT.editsDurablyProtected,
    mode: "server",
    collaborationSyncPending: false,
    recoveryUpdateCount: 0,
    recoveryExportAvailable: false,
    recoveryExported: false,
    localCheckpointCount: 3,
    localRole: "leader",
    serverRevision: 7,
    hasServerDocument: true,
    hydrated: true,
    hydrationFailed: false,
    saving: false,
    ...overrides,
  };
}

describe("resolveStudioDraftOperationSyncAssistant", () => {
  it("stays quiet while a healthy live context has no work to surface", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.visible).toBe(false);
    expect(model.tone).toBe("success");
    expect(model.serverSummary).toContain("다른 기기에서 이어서 작업");
  });

  it("surfaces offline operations without calling the server snapshot current", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "offline-queued",
      pendingCount: 3,
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("warning");
    expect(model.compactLabel).toBe("오프라인 · 3개 기기 보관");
    expect(model.primaryAction).toBe("retry");
    expect(model.operationSummary).toContain("변경 3개");
    expect(model.serverSummary).toContain("대기 변경이 끝난 뒤");
  });

  it("promotes a rejected local frontier to a recovery export", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "recovery-required",
      pendingCount: 4,
      recoveryUpdateCount: 4,
      recoveryExportAvailable: true,
      editsDurablyProtected: false,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("danger");
    expect(model.compactLabel).toBe("로컬 변경 복구 필요");
    expect(model.primaryAction).toBe("export-recovery");
    expect(model.primaryActionLabel).toBe("로컬 변경 복구 파일");
    expect(model.operationSummary).toContain("4개");
  });

  it("routes an already exported recovery boundary to non-destructive version review", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "recovery-required",
      recoveryUpdateCount: 2,
      recoveryExportAvailable: true,
      recoveryExported: true,
    }));

    expect(model.primaryAction).toBe("versions");
    expect(model.primaryActionLabel).toBe("버전·복구 확인");
  });

  it("explains that a follower tab does not own persistence", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "read-only-follower",
      localRole: "follower",
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("warning");
    expect(model.compactLabel).toBe("다른 탭이 동기화 담당");
    expect(model.primaryAction).toBeNull();
    expect(model.deviceSummary).toContain("다른 탭");
  });

  it("does not claim cross-device continuation for a local-tab-only session", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      syncPhase: "synced",
      mode: "local",
      persistenceDurability: "durable",
      editsDurablyProtected: true,
    }));

    expect(model.serverSummary).toContain("서버 원고 저장도 완료");
    expect(model.operationSummary).toContain("이 기기 안의 열린 탭");
  });

  it("shows the host save barrier even before detailed live telemetry is available", () => {
    const model = resolveStudioDraftOperationSyncAssistant(input({
      liveContextAvailable: false,
      syncPhase: "initializing",
      collaborationSyncPending: true,
      mode: null,
    }));

    expect(model.visible).toBe(true);
    expect(model.tone).toBe("progress");
    expect(model.compactLabel).toBe("변경 동기화 중");
  });
});
