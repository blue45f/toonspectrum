import { describe, expect, it } from "vitest";

import {
  buildStudioDraftSaveDiagnostics,
  extractStudioDraftSaveError,
  formatStudioDraftSaveInterval,
  formatStudioDraftSaveTime,
  resolveStudioDraftSaveCenter,
  resolveStudioDraftServerRevision,
  resolveStudioDraftServerSavedAt,
  type StudioDraftSaveCenterInput,
} from "./studio-draft-save-center-model";

function input(overrides: Partial<StudioDraftSaveCenterInput> = {}): StudioDraftSaveCenterInput {
  return {
    isOnline: true,
    saving: false,
    deferredSave: false,
    collaborationLocked: false,
    collaborationSyncPending: false,
    localRole: "leader",
    localBasis: "web-lock",
    localSaveSignal: null,
    storageSignal: null,
    hasServerDocument: true,
    serverRevision: 12,
    versionCount: 4,
    lastServerSaveAt: null,
    serverSaveError: null,
    serverRevisionLoading: false,
    serverRevisionError: null,
    ...overrides,
  };
}

describe("resolveStudioDraftSaveCenter", () => {
  it("keeps device recovery and server revision as separate saved authorities", () => {
    const model = resolveStudioDraftSaveCenter(input());

    expect(model.phase).toBe("saved");
    expect(model.compactLabel).toBe("서버 r12 확인");
    expect(model.device.title).toBe("이 탭이 복구 저장 담당");
    expect(model.server.title).toBe("서버 초안 revision #12");
  });

  it("does not call an offline document cloud-saved", () => {
    const model = resolveStudioDraftSaveCenter(input({ isOnline: false }));

    expect(model.phase).toBe("offline");
    expect(model.compactLabel).toBe("오프라인 · 기기 저장");
    expect(model.server.title).toBe("서버는 오프라인");
    expect(model.saveActionLabel).toBe("연결 후 저장 예약");
    expect(model.saveActionDisabled).toBe(false);
  });

  it("surfaces a reconnect save intent before an old server revision", () => {
    const model = resolveStudioDraftSaveCenter(input({
      isOnline: false,
      deferredSave: true,
    }));

    expect(model.phase).toBe("queued");
    expect(model.compactLabel).toBe("연결 후 저장 예약");
    expect(model.server.title).toBe("연결 후 서버 저장 예약됨");
  });

  it("promotes local durability failure above online server state", () => {
    const model = resolveStudioDraftSaveCenter(input({
      storageSignal: {
        level: "failed",
        title: "OPFS 쓰기 실패",
        detail: "저장 공간을 확인하세요.",
        at: 1,
      },
    }));

    expect(model.phase).toBe("local-risk");
    expect(model.tone).toBe("danger");
    expect(model.shouldPromoteBackup).toBe(true);
    expect(model.device.detail).toContain("프로젝트 백업");
  });

  it("uses conflict-specific recovery copy", () => {
    const model = resolveStudioDraftSaveCenter(input({
      serverSaveError: "다른 팀원이 먼저 저장했습니다. 최신 공동 문서를 다시 불러와 주세요.",
    }));

    expect(model.phase).toBe("server-risk");
    expect(model.server.title).toBe("저장 충돌을 검토해 주세요");
    expect(model.saveActionLabel).toBe("서버 저장 다시 시도");
  });

  it("blocks save actions while the collaboration document is locked", () => {
    const model = resolveStudioDraftSaveCenter(input({ collaborationLocked: true }));

    expect(model.phase).toBe("blocked");
    expect(model.saveActionDisabled).toBe(true);
    expect(model.saveActionLabel).toBe("저장 권한 확인");
  });

  it("describes a first server save without inventing a revision", () => {
    const model = resolveStudioDraftSaveCenter(input({
      hasServerDocument: false,
      serverRevision: null,
      versionCount: 0,
    }));

    expect(model.phase).toBe("local-only");
    expect(model.server.title).toBe("아직 서버 초안 없음");
    expect(model.canOpenVersions).toBe(false);
  });
});

describe("draft save helpers", () => {
  it("selects the highest valid server revision", () => {
    expect(resolveStudioDraftServerRevision([undefined, 4, 9, -1, 2.5, 7])).toBe(9);
  });

  it("uses the newest trustworthy server timestamp", () => {
    expect(resolveStudioDraftServerSavedAt({
      sharedUpdatedAt: "2026-09-09T01:00:00.000Z",
      revisions: [
        { createdAt: "2026-09-09T02:00:00.000Z" },
        { createdAt: "not-a-date" },
      ],
      observedAt: Date.parse("2026-09-09T03:00:00.000Z"),
    })).toBe(Date.parse("2026-09-09T03:00:00.000Z"));
  });

  it("filters unrelated global errors and keeps save-specific errors", () => {
    expect(extractStudioDraftSaveError("PSD 내보내기에 실패했습니다.")).toBeNull();
    expect(extractStudioDraftSaveError("서버 초안 저장에 실패했습니다.")).toBe(
      "서버 초안 저장에 실패했습니다.",
    );
  });

  it("formats relative save time and autosave intervals", () => {
    const now = Date.parse("2026-09-09T03:00:00.000Z");
    expect(formatStudioDraftSaveTime(now - 30_000, now)).toBe("방금");
    expect(formatStudioDraftSaveTime(now - 5 * 60_000, now)).toBe("5분 전");
    expect(formatStudioDraftSaveInterval(45_000)).toBe("45초");
  });

  it("produces content-free diagnostics for support", () => {
    const state = input({ deferredSave: true, isOnline: false });
    const model = resolveStudioDraftSaveCenter(state);
    const diagnostics = buildStudioDraftSaveDiagnostics(
      state,
      model,
      Date.parse("2026-09-09T03:00:00.000Z"),
    );

    expect(diagnostics).toContain("phase=queued");
    expect(diagnostics).toContain("serverRevision=12");
    expect(diagnostics).not.toContain("title=");
    expect(diagnostics).not.toContain("document=");
  });
});
