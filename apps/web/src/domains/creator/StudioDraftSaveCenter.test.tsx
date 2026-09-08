// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  reportStudioReliabilitySignal,
  resetStudioReliabilityStatus,
} from "./studio-reliability-status-store";
import { StudioDraftSaveCenter } from "./StudioDraftSaveCenter";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function renderCenter(overrides: Partial<ComponentProps<typeof StudioDraftSaveCenter>> = {}) {
  const onSaveDraft = vi.fn(() => Promise.resolve());
  const onOpenVersions = vi.fn();
  const onExportBackup = vi.fn(() => Promise.resolve());
  render(
    <StudioDraftSaveCenter
      saving={false}
      workId="work-1"
      loadedWork={{ id: "work-1", revision: 7 }}
      serverCurrentRevision={7}
      serverRevisions={[{ revision: 7, createdAt: "2026-09-09T03:00:00.000Z" }]}
      autosaveDocumentLeadership={{ role: "leader", basis: "web-lock" }}
      onSaveDraft={onSaveDraft}
      onOpenVersions={onOpenVersions}
      onExportBackup={onExportBackup}
      {...overrides}
    />,
  );
  return { onSaveDraft, onOpenVersions, onExportBackup };
}

afterEach(() => {
  cleanup();
  resetStudioReliabilityStatus();
  setOnline(true);
  vi.restoreAllMocks();
});

describe("StudioDraftSaveCenter", () => {
  it("opens a two-authority save explanation from the compact status", () => {
    setOnline(true);
    renderCenter();

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));

    expect(screen.getByRole("dialog", { name: "초안 저장 센터" })).not.toBeNull();
    expect(screen.getByText("2단계 자동 보호")).not.toBeNull();
    expect(screen.getByText("이 탭이 복구 저장 담당")).not.toBeNull();
    expect(screen.getByText("서버 초안 revision #7")).not.toBeNull();
  });

  it("delegates manual save, version history and project backup to existing authorities", () => {
    setOnline(true);
    const actions = renderCenter();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));

    fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "버전·체크포인트" }));

    expect(actions.onSaveDraft).toHaveBeenCalledTimes(1);
    expect(actions.onOpenVersions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 백업" }));
    expect(actions.onExportBackup).toHaveBeenCalledTimes(1);
  });

  it("queues one save while offline and replays it when connectivity returns", async () => {
    setOnline(false);
    const actions = renderCenter();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));

    expect(actions.onSaveDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "연결 후 저장 예약됨" })).not.toBeNull();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(actions.onSaveDraft).toHaveBeenCalledTimes(1));
  });

  it("promotes durable storage failure instead of showing a false green state", () => {
    setOnline(true);
    act(() => {
      reportStudioReliabilitySignal({
        channel: "storage",
        level: "failed",
        title: "복구 저장소 쓰기 실패",
        detail: "저장 공간을 확인하세요.",
        at: Date.now(),
      });
    });
    renderCenter();

    expect(screen.getByRole("button", { name: "저장 상태: 복구 저장 확인" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 복구 저장 확인" }));
    expect(screen.getByText("이 기기 복구 저장 확인 필요")).not.toBeNull();
    expect(screen.getByText(/탭을 닫기 전에 프로젝트 백업을 내려받아 주세요/u)).not.toBeNull();
  });

  it("closes with Escape and restores focus to the status trigger", () => {
    setOnline(true);
    renderCenter();
    const trigger = screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "초안 저장 센터" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "초안 저장 센터" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
