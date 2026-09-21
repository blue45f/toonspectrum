// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDraftOperationSyncAssistant } from "../StudioDraftOperationSyncAssistant";
import { StudioLivePresenceDock } from "./StudioLiveCanvasOverlay";
import { EMPTY_STUDIO_LIVE_CONTEXT, StudioLiveCollaborationContext } from "./studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT, type StudioLiveSyncPhase } from "./studio-live-sync-safety";

const openTeam = vi.fn();
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function View({ phase }: { phase: StudioLiveSyncPhase }) {
  const sync = {
    ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT, phase, mode: "server" as const,
    pendingCount: phase === "synced" ? 0 : 2,
    persistenceDurability: phase === "durability-risk" ? "degraded" as const : "durable" as const,
    editsDurablyProtected: phase !== "durability-risk",
    operationSyncReady: true, transportReady: phase === "synced",
  };
  return <StudioLiveCollaborationContext.Provider value={{
    ...EMPTY_STUDIO_LIVE_CONTEXT, availability: "ready", mode: "server", sync,
  }}>
    <StudioDraftOperationSyncAssistant serverRevision={7} hasServerDocument
      localCheckpointCount={3} localRole="leader" collaborationSyncPending={false}
      hydrated hydrationFailed={false} saving={false}
      onOpenVersions={() => undefined} onExportBackup={async () => undefined} />
    <StudioLivePresenceDock syncStatusSurface="save-center" connected={sync.transportReady}
      alwaysOn peers={[]} followingSessionId={null} onToggleFollow={() => undefined}
      onOpenTeam={openTeam} syncSnapshot={sync} />
  </StudioLiveCollaborationContext.Provider>;
}

describe("editor sync status ownership", () => {
  it("renders one reconnect button and one announcement, keeping the mobile team entry", () => {
    const { container } = render(<View phase="retrying" />);
    expect(screen.getAllByRole("button", { name: /동기화 상태: 재연결 중/ })).toHaveLength(1);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("[data-studio-presence-sync-action]")).toBeNull();
    const team = screen.getByRole("button", { name: "팀 작업 공간 열기" });
    expect(team.className).not.toContain("hidden");
    fireEvent.click(team);
    expect(openTeam).toHaveBeenCalledOnce();
  });

  it("keeps one assertive warning when storage protection is at risk", () => {
    render(<View phase="durability-risk" />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "동기화 상태: 변경 보호 확인 필요" })).toBeTruthy();
    expect(screen.queryByText("안전하게 동기화됨")).toBeNull();
  });

  it("removes the reconnect notice after recovery without losing team controls", () => {
    const view = render(<View phase="retrying" />);
    view.rerender(<View phase="synced" />);
    expect(screen.queryByRole("button", { name: /동기화 상태:/ })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "팀 작업 공간 열기" })).toBeTruthy();
  });
});
