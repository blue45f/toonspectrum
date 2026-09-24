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
});
