// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendCanvasOperation,
  createEmptyOperationJournal,
} from "./studio-operation-recovery-coordinator";
import { StudioSaveSyncStatusCenter } from "./StudioSaveSyncStatusCenter";

afterEach(() => {
  cleanup();
});

describe("StudioSaveSyncStatusCenter", () => {
  it("shows a compact, unambiguous saved state", () => {
    const journal = createEmptyOperationJournal("doc-1");
    render(<StudioSaveSyncStatusCenter journal={journal} />);

    expect(screen.getByText("저장됨")).not.toBeNull();
    expect(screen.getByRole("button", { name: "저장 상태 열기: 저장됨" })).not.toBeNull();
  });

  it("explains pending work as changes being saved", () => {
    let journal = createEmptyOperationJournal("doc-1");
    journal = appendCanvasOperation(journal, "stroke", "선화 작화", {});

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    expect(screen.getByText("1개 변경 저장 중")).not.toBeNull();
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

    const pill = screen.getByRole("button", { name: /저장 상태 열기/u });
    fireEvent.click(pill);

    expect(screen.getByRole("dialog", { name: "저장 상태 상세" })).not.toBeNull();
    expect(screen.getByText("이 기기")).not.toBeNull();
    expect(screen.getByText("서버")).not.toBeNull();
    expect(screen.getByText("복구")).not.toBeNull();
    expect(screen.getByText("고급 진단 보기")).not.toBeNull();
    expect(screen.getByText("로컬 저장 방식")).not.toBeNull();

    const checkpointButton = screen.getByRole("button", { name: "복구 지점 만들기" });
    fireEvent.click(checkpointButton);
    expect(onForceCheckpoint).toHaveBeenCalledTimes(1);
  });
});
