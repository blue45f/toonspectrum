// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendCanvasOperation,
  createEmptyOperationJournal,
} from "./studio-operation-recovery-coordinator";
import { StudioSaveSyncStatusCenter } from "./StudioSaveSyncStatusCenter";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis.navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  vi.restoreAllMocks();
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

function openAdvancedDiagnostics(): HTMLButtonElement {
  fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
  fireEvent.click(screen.getByText("고급 진단 보기"));
  return screen.getByRole("button", { name: "진단 정보 복사" });
}

describe("StudioSaveSyncStatusCenter", () => {
  it("shows a compact, unambiguous saved state", () => {
    const journal = createEmptyOperationJournal("doc-1");
    render(<StudioSaveSyncStatusCenter journal={journal} />);

    expect(screen.getByText("저장됨")).not.toBeNull();
    expect(screen.getByRole("button", { name: "저장 상태 열기: 저장됨" })).not.toBeNull();
  });

  it("describes uncheckpointed work as locally preserved, not active server saving", () => {
    let journal = createEmptyOperationJournal("doc-1");
    journal = appendCanvasOperation(journal, "stroke", "선화 작화", {});

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    expect(screen.getByText("1개 변경 보존 중")).not.toBeNull();
    expect(screen.queryByText(/서버에 저장하는 중/u)).toBeNull();
  });

  it("makes offline safety explicit", () => {
    const journal = createEmptyOperationJournal("doc-1");
    render(<StudioSaveSyncStatusCenter journal={journal} isOnline={false} />);

    expect(screen.getByText("오프라인 · 이 기기에 보관 중")).not.toBeNull();
  });

  it("opens plain-language details and keeps implementation data under advanced diagnostics", () => {
    const onForceCheckpoint = vi.fn();
    let journal = createEmptyOperationJournal("doc-1");
    journal = appendCanvasOperation(journal, "stroke", "스케치", {});

    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        onForceCheckpoint={onForceCheckpoint}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));

    expect(screen.getByRole("dialog", { name: "저장 상태 상세" })).not.toBeNull();
    expect(screen.getByText("이 기기")).not.toBeNull();
    expect(screen.getByText("서버")).not.toBeNull();
    expect(screen.getByText("복구")).not.toBeNull();
    expect(screen.getByText(/서버 동기화를 기다리고 있어요/u)).not.toBeNull();
    expect(screen.getByText("고급 진단 보기")).not.toBeNull();
    expect(screen.getByText("로컬 저장 방식")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "복구 지점 만들기" }));
    expect(onForceCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("shows copy success only after the diagnostics actually reach the clipboard", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const journal = createEmptyOperationJournal("doc-copy-success");

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    fireEvent.click(openAdvancedDiagnostics());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "진단 정보를 복사했어요" })
      ).not.toBeNull();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("doc-copy-success");
  });

  it("reports a blocked clipboard instead of claiming that diagnostics were copied", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
      writable: true,
    });
    const journal = createEmptyOperationJournal("doc-copy-failure");

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    fireEvent.click(openAdvancedDiagnostics());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "진단 정보를 복사하지 못했어요" })
      ).not.toBeNull();
    });
    expect(screen.queryByText("진단 정보를 복사했어요")).toBeNull();
  });
});
