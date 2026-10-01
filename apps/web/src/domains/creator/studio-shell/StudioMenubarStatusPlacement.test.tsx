// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
} from "../live/studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "../live/studio-live-sync-safety";
import { StudioDraftOperationSyncAssistant } from "../StudioDraftOperationSyncAssistant";
import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter";
import { resetStudioReliabilityStatus } from "../studio-reliability-status-store";
import {
  STUDIO_MENUBAR_STATUS_SLOT_REFS,
  studioMenubarPopoverPosition,
} from "./studio-menubar-status-slot";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

/** 데스크톱 메뉴바 동작 영역의 두 자리만 흉내 낸다. */
function MenubarSlots() {
  return (
    <div data-testid="menubar-actions">
      <div data-testid="sync-slot" ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.sync} />
      <div data-testid="save-slot" ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.save} />
    </div>
  );
}

function SaveCenter({ mobileImmersive = false }: { readonly mobileImmersive?: boolean }) {
  return (
    <StudioDraftSaveCenter
      saving={false}
      workId="work-1"
      loadedWork={{ id: "work-1", revision: 7 }}
      autosaveDocumentLeadership={{ role: "leader", basis: "web-lock" }}
      mobileImmersive={mobileImmersive}
      onSaveDraft={vi.fn(() => Promise.resolve())}
      onOpenVersions={vi.fn()}
      onExportBackup={vi.fn(() => Promise.resolve())}
    />
  );
}

function saveRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("[data-studio-draft-save-center]");
  if (!root) throw new Error("save center root missing");
  return root;
}

afterEach(() => {
  cleanup();
  resetStudioReliabilityStatus();
  setOnline(true);
  vi.restoreAllMocks();
});

describe("studioMenubarPopoverPosition", () => {
  it("opens below the chip, right-aligned, keeping an 8px viewport margin", () => {
    const anchor = new DOMRect(1200, 6, 160, 44);
    expect(studioMenubarPopoverPosition(anchor, 1440)).toEqual({ top: 58, right: 80 });
    // 칩이 화면 오른쪽 끝에 붙어 있어도 대화상자는 가장자리에서 8px 떨어진다.
    expect(studioMenubarPopoverPosition(new DOMRect(1400, 0, 44, 44), 1440).right).toBe(8);
  });
});

describe("desktop menubar status placement", () => {
  it("keeps the floating chip when no menubar slot exists", () => {
    setOnline(false);
    render(<SaveCenter />);

    const root = saveRoot();
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("top-[calc(5.25rem+env(safe-area-inset-top))]");
    // 오프라인 문구가 이미 상태에 들어 있으므로 연결 배지를 겹쳐 달지 않는다.
    const trigger = screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" });
    expect(trigger.textContent?.match(/오프라인/gu)).toHaveLength(1);
  });

  it("moves the save status into the menubar and portals its dialog outside the clipped lane", async () => {
    setOnline(false);
    render(
      <>
        <MenubarSlots />
        <SaveCenter />
      </>,
    );

    const root = saveRoot();
    expect(screen.getByTestId("save-slot").contains(root)).toBe(true);
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("menubar");
    // 배치 관리자는 표시/숨김만 적용하고 위치는 옮기지 않는다.
    expect(root.getAttribute("data-studio-shell-inline-docked")).toBe("true");
    expect(root.getAttribute("data-studio-shell-force-visible")).toBe("true");
    expect(root.className).not.toContain("fixed");

    const trigger = screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" });
    expect(trigger.getAttribute("data-studio-draft-save-trigger")).toBe("menubar");
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "초안 저장 센터" });
    expect(screen.getByTestId("menubar-actions").contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain("fixed");
    expect(dialog.style.top).not.toBe("");
    expect(dialog.style.right).not.toBe("");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "초안 저장 센터" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("stays a bottom floating chip in mobile immersive mode even when a slot is registered", () => {
    render(
      <>
        <MenubarSlots />
        <SaveCenter mobileImmersive />
      </>,
    );

    const root = saveRoot();
    expect(screen.getByTestId("save-slot").contains(root)).toBe(false);
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(root.className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)]");
  });

  it("falls back to the floating chip after the menubar unmounts", () => {
    const view = render(
      <>
        <MenubarSlots />
        <SaveCenter />
      </>,
    );
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("menubar");

    view.rerender(<SaveCenter />);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("floating");
  });

  it("puts the operation sync chip beside the save status in the menubar", async () => {
    const value: StudioLiveCollaborationContextValue = {
      ...EMPTY_STUDIO_LIVE_CONTEXT,
      availability: "error",
      mode: "server",
      serverAvailable: false,
      sync: {
        ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
        phase: "offline-queued",
        pendingCount: 2,
        persistenceDurability: "durable",
        transportReady: false,
        operationSyncReady: true,
        editsDurablyProtected: true,
        message: "서버 연결 대기",
        mode: "server",
      },
    };
    const withLive = (node: ReactNode) => (
      <StudioLiveCollaborationContext.Provider value={value}>{node}</StudioLiveCollaborationContext.Provider>
    );
    render(withLive(
      <>
        <MenubarSlots />
        <StudioDraftOperationSyncAssistant
          serverRevision={7}
          hasServerDocument
          localCheckpointCount={3}
          localRole="leader"
          collaborationSyncPending={false}
          hydrated
          hydrationFailed={false}
          saving={false}
          onOpenVersions={vi.fn()}
          onExportBackup={vi.fn(() => Promise.resolve())}
        />
      </>,
    ));

    const trigger = screen.getByRole("button", { name: /동기화 상태/u });
    const root = trigger.closest<HTMLElement>("[data-studio-operation-sync-assistant]");
    expect(root?.getAttribute("data-studio-operation-sync-placement")).toBe("menubar");
    expect(screen.getByTestId("sync-slot").contains(trigger)).toBe(true);

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "기기·서버 동기화" });
    expect(dialog.parentElement).toBe(document.body);
    await waitFor(() => expect(document.activeElement).toBe(dialog));
  });
});
