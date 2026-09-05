// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioContinuityPanel } from "./StudioContinuityPanel";

import type { El } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

function page(
  elements: readonly El[],
  overrides: Partial<PageState> = {}
): PageState {
  return {
    id: "page-1",
    name: "1화",
    elements: [...elements],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 2_000,
    review: { status: "approved", locked: true },
    ...overrides,
  };
}

function frame(): Extract<El, { type: "frame" }> {
  return {
    id: "frame-1",
    type: "frame",
    x: 20,
    y: 20,
    width: 680,
    height: 500,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioContinuityPanel quality center", () => {
  it("presents the integrated quality center and closes with Escape", async () => {
    const onClose = vi.fn();
    render(
      <StudioContinuityPanel
        open
        onClose={onClose}
        issues={[]}
        pages={[page([frame()])]}
        currentPageId="page-1"
      />
    );

    expect(screen.getByRole("dialog").getAttribute("data-studio-quality-inspection")).toBe("true");
    expect(screen.getByText("마감·품질 검사 센터")).not.toBeNull();
    expect(screen.getByText("최종 수동 확인")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("allows warning acknowledgement but never lets a blocking source failure be dismissed", async () => {
    const draftView = render(
      <StudioContinuityPanel
        open
        onClose={vi.fn()}
        issues={[]}
        documentKey="draft-warning"
        pages={[
          page([frame()], {
            review: { status: "draft", locked: false },
          }),
        ]}
        currentPageId="page-1"
      />
    );

    const [acknowledge] = await screen.findAllByRole("button", {
      name: "의도된 상태로 확인",
    });
    expect(acknowledge).toBeDefined();
    fireEvent.click(acknowledge!);
    // Acknowledging moves the finding into the acknowledged tally rather than
    // flipping the button in place, so assert the tally, not the old label.
    expect(await screen.findByText(/확인됨\s*1/u)).not.toBeNull();
    draftView.unmount();

    render(
      <StudioContinuityPanel
        open
        onClose={vi.fn()}
        issues={[]}
        documentKey="broken-image"
        pages={[
          page([
            {
              id: "image-1",
              type: "image",
              src: "",
              x: 20,
              y: 20,
              width: 300,
              height: 300,
              rotation: 0,
            },
          ]),
        ]}
        currentPageId="page-1"
      />
    );

    const title = await screen.findByText("이미지 원본 누락");
    const issueCard = title.closest("li");
    expect(issueCard).not.toBeNull();
    expect(
      within(issueCard!).queryByRole("button", { name: "의도된 상태로 확인" })
    ).toBeNull();
  });

  it("navigates to exact defects and connects the two existing finishing tools", async () => {
    const onSelectTarget = vi.fn();
    const onOpenScrollPreview = vi.fn();
    const onOpenPublishPreflight = vi.fn();
    render(
      <StudioContinuityPanel
        open
        onClose={vi.fn()}
        issues={[]}
        pages={[
          page([
            {
              id: "image-1",
              type: "image",
              src: "",
              x: 20,
              y: 20,
              width: 300,
              height: 300,
              rotation: 0,
            },
          ]),
        ]}
        currentPageId="page-1"
        onSelectTarget={onSelectTarget}
        onOpenScrollPreview={onOpenScrollPreview}
        onOpenPublishPreflight={onOpenPublishPreflight}
      />
    );

    // The quality centre now reports several findings for this page, so scope the
    // jump to the specific defect this test is about rather than the first button.
    const missingSource = (await screen.findByText("이미지 원본 누락")).closest("li");
    expect(missingSource).not.toBeNull();
    fireEvent.click(
      within(missingSource!).getByRole("button", { name: "위치로 이동" })
    );
    expect(onSelectTarget).toHaveBeenCalledWith({
      pageId: "page-1",
      elementId: "image-1",
    });

    fireEvent.click(screen.getByRole("button", { name: "세로 미리보기" }));
    fireEvent.click(screen.getByRole("button", { name: "게시 규격 사전검사" }));
    expect(onOpenScrollPreview).toHaveBeenCalledTimes(1);
    expect(onOpenPublishPreflight).toHaveBeenCalledTimes(1);
  });
});
