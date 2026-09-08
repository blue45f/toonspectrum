// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioDraftSaveOutboxEntry,
  readStudioDraftSaveOutbox,
  writeStudioDraftSaveOutbox,
} from "./studio-draft-save-outbox";
import { resetStudioReliabilityStatus } from "./studio-reliability-status-store";
import { StudioDraftSaveCenter } from "./StudioDraftSaveCenter";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

const defaultProps: ComponentProps<typeof StudioDraftSaveCenter> = {
  saving: false,
  workId: "work-1",
  workHydrated: true,
  workHydrationFailed: false,
  loadedWork: { id: "work-1", revision: 7 },
  localCheckpointCount: 3,
  serverCurrentRevision: 7,
  serverRevisions: [{ revision: 7, createdAt: "2026-09-09T03:00:00.000Z" }],
  autosaveDocumentLeadership: { role: "leader", basis: "web-lock" },
  onSaveDraft: () => Promise.resolve(),
  onContinuePendingSave: () => Promise.resolve(),
  onOpenVersions: () => undefined,
  onExportBackup: () => Promise.resolve(),
};

afterEach(() => {
  cleanup();
  resetStudioReliabilityStatus();
  setOnline(true);
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("StudioDraftSaveCenter reload-safe outbox", () => {
  it("keeps an offline receipt until one reconnect save acknowledges success", async () => {
    setOnline(false);
    let resolveSave: (() => void) | null = null;
    const onSaveDraft = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    render(<StudioDraftSaveCenter {...defaultProps} onSaveDraft={onSaveDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));

    expect(screen.getByText("서버 저장 예약 보존 중")).not.toBeNull();
    expect(readStudioDraftSaveOutbox({
      storage: window.sessionStorage,
      workId: "work-1",
    })).not.toBeNull();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(readStudioDraftSaveOutbox({
      storage: window.sessionStorage,
      workId: "work-1",
    })).not.toBeNull();

    act(() => resolveSave?.());
    await waitFor(() => expect(readStudioDraftSaveOutbox({
      storage: window.sessionStorage,
      workId: "work-1",
    })).toBeNull());
  });

  it("coalesces repeated manual save clicks while the existing save promise is pending", async () => {
    setOnline(true);
    let resolveSave: (() => void) | null = null;
    const onSaveDraft = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    render(<StudioDraftSaveCenter {...defaultProps} onSaveDraft={onSaveDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));
    const saveButton = screen.getByRole("button", { name: "지금 서버에 저장" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    act(() => resolveSave?.());
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  });

  it("waits for the current server revision before replaying a restored receipt", async () => {
    const entry = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      serverRevision: 7,
      hasServerDocument: true,
      now: Date.now(),
    })!;
    expect(writeStudioDraftSaveOutbox({ storage: window.sessionStorage, entry })).toBe(true);
    const onSaveDraft = vi.fn(() => Promise.resolve());
    const view = render(
      <StudioDraftSaveCenter
        {...defaultProps}
        onSaveDraft={onSaveDraft}
        serverRevisionLoading
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", {
      name: "저장 상태: 연결 후 저장 예약",
    })).not.toBeNull());
    expect(onSaveDraft).not.toHaveBeenCalled();

    view.rerender(
      <StudioDraftSaveCenter
        {...defaultProps}
        onSaveDraft={onSaveDraft}
        serverRevisionLoading={false}
      />,
    );
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  });

  it("restores after reload, waits in a follower tab, then replays after leadership handover", async () => {
    const entry = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      serverRevision: 7,
      hasServerDocument: true,
      now: Date.now(),
    })!;
    expect(writeStudioDraftSaveOutbox({ storage: window.sessionStorage, entry })).toBe(true);
    const onSaveDraft = vi.fn(() => Promise.resolve());
    const view = render(
      <StudioDraftSaveCenter
        {...defaultProps}
        onSaveDraft={onSaveDraft}
        autosaveDocumentLeadership={{ role: "follower", basis: "web-lock" }}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", {
      name: "저장 상태: 연결 후 저장 예약",
    })).not.toBeNull());
    expect(onSaveDraft).not.toHaveBeenCalled();

    view.rerender(
      <StudioDraftSaveCenter
        {...defaultProps}
        onSaveDraft={onSaveDraft}
        autosaveDocumentLeadership={{ role: "leader", basis: "promoted-after-handover" }}
      />,
    );

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
  });

  it("retains a failed reconnect receipt and lets the user cancel the intent", async () => {
    setOnline(false);
    const onSaveDraft = vi.fn(() => Promise.reject(new Error("서버 초안 저장에 실패했습니다.")));
    render(<StudioDraftSaveCenter {...defaultProps} onSaveDraft={onSaveDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readStudioDraftSaveOutbox({
      storage: window.sessionStorage,
      workId: "work-1",
    })).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "저장 예약 취소" }));
    expect(readStudioDraftSaveOutbox({
      storage: window.sessionStorage,
      workId: "work-1",
    })).toBeNull();
  });

  it("keeps the queue visible when neither receipt deletion nor invalidation is possible", () => {
    setOnline(false);
    render(<StudioDraftSaveCenter {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage removal blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage overwrite blocked");
    });
    fireEvent.click(screen.getByRole("button", { name: "저장 예약 취소" }));

    expect(screen.getByRole("button", { name: "저장 예약 취소" })).not.toBeNull();
    expect(screen.getByText(/서버 저장 예약을 정리하지 못했습니다/)).not.toBeNull();
  });
});
