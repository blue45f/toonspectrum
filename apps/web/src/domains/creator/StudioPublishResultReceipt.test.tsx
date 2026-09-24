// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublishResultReceipt } from "./StudioPublishResultReceipt";

afterEach(cleanup);

describe("StudioPublishResultReceipt", () => {
  it("shows a reader action only for a published work", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-1"
          revision={7}
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "작품 게시가 완료됐습니다" })).toBeTruthy();
    expect(screen.getByText("work-1")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("운영 환경")).toBeTruthy();
    expect(screen.getByRole("link", { name: "독자 화면 열기" }).getAttribute("href")).toBe(
      "/create/work-1",
    );
  });

  it("keeps private drafts out of the reader flow and exposes recovery actions", () => {
    const onContinueEditing = vi.fn();
    const onReviewSettings = vi.fn();
    render(
      <StudioPublishResultReceipt
        kind="private"
        workId="work-private"
        environment="preview"
        onContinueEditing={onContinueEditing}
        onReviewSettings={onReviewSettings}
      />,
    );

    expect(screen.getByRole("heading", { name: "비공개 원고를 저장했습니다" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "독자 화면 열기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원고 수정 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 설정 다시 확인" }));
    expect(onContinueEditing).toHaveBeenCalledOnce();
    expect(onReviewSettings).toHaveBeenCalledOnce();
  });

  it("offers an explicit rollback for published and scheduled results", () => {
    const onMakePrivate = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-live"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "즉시 비공개 전환" }));
    expect(onMakePrivate).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="scheduled"
          workId="work-scheduled"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
          recoveryBusy
          recoveryError="다른 창의 변경을 먼저 확인해 주세요."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "비공개 전환 중..." })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("alert").textContent).toContain("다른 창의 변경");
  });
});
