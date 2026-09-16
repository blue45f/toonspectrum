// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
} from "./live/studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "./live/studio-live-sync-safety";
import { StudioDraftOperationSyncAssistant } from "./StudioDraftOperationSyncAssistant";

function renderAssistant(
  liveOverrides: Partial<StudioLiveCollaborationContextValue> = {},
) {
  const onOpenVersions = vi.fn();
  const onExportBackup = vi.fn(() => Promise.resolve());
  const value: StudioLiveCollaborationContextValue = {
    ...EMPTY_STUDIO_LIVE_CONTEXT,
    availability: "ready",
    mode: "server",
    serverAvailable: true,
    sync: {
      ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
      phase: "synced",
      pendingCount: 0,
      persistenceDurability: "durable",
      transportReady: true,
      operationSyncReady: true,
      editsDurablyProtected: true,
      message: "동기화됨",
      mode: "server",
    },
    ...liveOverrides,
  };

  render(
    <StudioLiveCollaborationContext.Provider value={value}>
      <StudioDraftOperationSyncAssistant
        serverRevision={7}
        hasServerDocument
        localCheckpointCount={3}
        localRole="leader"
        collaborationSyncPending={false}
        hydrated
        hydrationFailed={false}
        saving={false}
        onOpenVersions={onOpenVersions}
        onExportBackup={onExportBackup}
      />
    </StudioLiveCollaborationContext.Provider>,
  );

  return { onOpenVersions, onExportBackup };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioDraftOperationSyncAssistant", () => {
  it("stays hidden for a healthy, fully acknowledged operation stream", () => {
    renderAssistant();

    expect(screen.queryByRole("button", { name: /동기화 상태/ })).toBeNull();
  });

  it("shows durable offline work and retries through the existing live authority", () => {
    const retryServer = vi.fn();
    renderAssistant({
      availability: "error",
      serverAvailable: false,
      retryServer,
      sync: {
        ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
        phase: "offline-queued",
        pendingCount: 3,
        persistenceDurability: "durable",
        transportReady: false,
        operationSyncReady: true,
        editsDurablyProtected: true,
        message: "서버 연결 대기",
        mode: "server",
      },
    });

    fireEvent.click(screen.getByRole("button", {
      name: "동기화 상태: 오프라인 · 3개 기기 보관",
    }));

    expect(screen.getByRole("dialog", { name: "기기·서버 동기화" })).not.toBeNull();
    expect(screen.getAllByText(/변경 3개를 서버가 다시 연결될 때까지/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "서버 연결 다시 확인" }));
    expect(retryServer).toHaveBeenCalledTimes(1);
  });

  it("exports rejected local changes before offering destructive reload behavior", async () => {
    const exportRecovery = vi.fn(() => Promise.resolve());
    const actions = renderAssistant({
      exportRecovery,
      recovery: {
        vaultId: "vault-1",
        updateCount: 2,
        exportAvailable: true,
        exported: false,
        message: "복구 필요",
      },
      sync: {
        ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
        phase: "recovery-required",
        pendingCount: 2,
        persistenceDurability: "durable",
        transportReady: false,
        operationSyncReady: false,
        editsDurablyProtected: false,
        message: "복구 필요",
        mode: "server",
      },
    });

    fireEvent.click(screen.getByRole("button", {
      name: "동기화 상태: 로컬 변경 복구 필요",
    }));
    fireEvent.click(screen.getByRole("button", { name: "로컬 변경 복구 파일" }));

    await waitFor(() => expect(exportRecovery).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /서버 원고 다시/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "버전·복구 확인" }));
    expect(actions.onOpenVersions).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape and restores focus to the attention trigger", () => {
    renderAssistant({
      sync: {
        ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
        phase: "retrying",
        pendingCount: 1,
        persistenceDurability: "durable",
        transportReady: false,
        operationSyncReady: true,
        editsDurablyProtected: true,
        message: "재연결 중",
        mode: "server",
      },
    });
    const trigger = screen.getByRole("button", {
      name: "동기화 상태: 재연결 중 · 1개 대기",
    });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "기기·서버 동기화" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
