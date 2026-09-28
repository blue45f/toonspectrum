// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
} from "./live/studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "./live/studio-live-sync-safety";
import { StudioDraftOperationSyncAssistant, type StudioDraftOperationSyncAssistantProps } from "./StudioDraftOperationSyncAssistant";

function renderAssistant(
  liveOverrides: Partial<StudioLiveCollaborationContextValue> = {},
  props: Partial<StudioDraftOperationSyncAssistantProps> = {},
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
        {...props}
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


describe("동기화 패널 조작 안전성", () => {
  const retrying = {
    sync: {
      ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
      phase: "retrying" as const,
      pendingCount: 1,
      persistenceDurability: "durable" as const,
      operationSyncReady: true,
      editsDurablyProtected: true,
      mode: "server" as const,
    },
  };

  it("패널을 열면 키보드 초점을 캔버스에서 상세 영역으로 옮긴다", () => {
    renderAssistant(retrying);
    fireEvent.click(screen.getByRole("button", { name: /동기화 상태:/ }));
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("백업 생성 중 중복 클릭을 막고 완료 후 다시 실행할 수 있다", async () => {
    let finish: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const onExportBackup = vi.fn(() => pending);
    renderAssistant(retrying, { onExportBackup });
    fireEvent.click(screen.getByRole("button", { name: /동기화 상태:/ }));
    const backup = screen.getByRole("button", { name: "프로젝트 백업" });
    fireEvent.click(backup);
    fireEvent.click(backup);
    expect(onExportBackup).toHaveBeenCalledTimes(1);
    expect(backup.getAttribute("aria-busy")).toBe("true");
    expect(backup.textContent).toContain("백업 파일 만드는 중");
    finish();
    await waitFor(() => expect(backup.getAttribute("aria-busy")).toBe("false"));
    fireEvent.click(backup);
    await waitFor(() => expect(onExportBackup).toHaveBeenCalledTimes(2));
  });

  it("백업 오류를 숨기지 않고 재시도 가능한 상태로 돌아간다", async () => {
    const onExportBackup = vi.fn()
      .mockRejectedValueOnce(new Error("백업 저장 공간이 부족합니다."))
      .mockResolvedValueOnce(undefined);
    renderAssistant(retrying, { onExportBackup });
    fireEvent.click(screen.getByRole("button", { name: /동기화 상태:/ }));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 백업" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장 공간"));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 백업" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(onExportBackup).toHaveBeenCalledTimes(2);
  });

  it("로컬 탭의 복구 저장 담당을 서버 승인과 분리해 안내한다", () => {
    renderAssistant({ ...retrying, mode: "local", sync: { ...retrying.sync, mode: "local" } }, {
      localRole: "follower", mobileImmersive: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /동기화 상태:/ }));
    expect(screen.getByText("먼저 연 다른 탭이 이 기기의 복구 저장을 담당합니다.")).toBeTruthy();
    expect(screen.getByText("이 기기 탭 연결")).toBeTruthy();
  });
});
