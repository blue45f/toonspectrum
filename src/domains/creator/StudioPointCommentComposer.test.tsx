// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { planStudioPointCommentComposerPosition } from "./studio-point-comment-composer-model";
import { StudioPointCommentComposer } from "./StudioPointCommentComposer";

afterEach(() => cleanup());

describe("StudioPointCommentComposer", () => {
  it("places the card beside the click and clamps it inside short or narrow viewports", () => {
    expect(planStudioPointCommentComposerPosition({
      point: { x: 40, y: 50 },
      viewport: { left: 0, top: 0, width: 390, height: 844 },
    })).toEqual({ left: 42, top: 66, width: 336, maxHeight: 820 });

    expect(planStudioPointCommentComposerPosition({
      point: { x: 380, y: 830 },
      viewport: { left: 0, top: 0, width: 390, height: 844 },
      measuredCard: { width: 336, height: 260 },
    })).toEqual({ left: 28, top: 554, width: 336, maxHeight: 820 });

    expect(planStudioPointCommentComposerPosition({
      point: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      viewport: { left: 10, top: 20, width: 250, height: 180 },
    })).toEqual({ left: 22, top: 32, width: 226, maxHeight: 156 });
  });

  it("autofocuses, submits with Ctrl/Command+Enter, and keeps the point context visible", async () => {
    const onSubmit = vi.fn(async () => true);
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.257, y: 0.734 }}
        authorName="민지 작가"
        screenPoint={{ x: 120, y: 240 }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const textarea = screen.getByRole("textbox", { name: "위치 댓글 내용" });
    await waitFor(() => expect(globalThis.document.activeElement).toBe(textarea));
    expect(
      screen.getByRole("dialog", { name: "위치 댓글 작성" })
        .getAttribute("data-studio-shortcut-boundary")
    ).toBe("true");
    expect(screen.getByRole("dialog", { name: "위치 댓글 작성" }).getAttribute("aria-modal"))
      .toBe("true");
    expect(screen.getByText("26%, 73% · 민지 작가")).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "  말풍선을 조금 위로 옮겨 주세요.  " } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("말풍선을 조금 위로 옮겨 주세요.");
    });
  });

  it("cancels with Escape and can move into the full review inbox without submitting", () => {
    const onCancel = vi.fn();
    const onOpenReview = vi.fn();
    const onSubmit = vi.fn(async () => true);
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.5, y: 0.5 }}
        authorName="검토자"
        screenPoint={{ x: 200, y: 200 }}
        onCancel={onCancel}
        onOpenReview={onOpenReview}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "검토함" }));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "위치 댓글 작성" }), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("consumes an outside pointer gesture so the canvas behind the composer cannot edit", () => {
    const onCancel = vi.fn();
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.5, y: 0.5 }}
        authorName="검토자"
        screenPoint={{ x: 200, y: 200 }}
        onCancel={onCancel}
        onSubmit={vi.fn(async () => true)}
      />
    );

    const backdrop = document.querySelector<HTMLElement>(
      '[data-studio-point-comment-backdrop="true"]'
    );
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus inside the modal composer", () => {
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.5, y: 0.5 }}
        authorName="검토자"
        screenPoint={{ x: 200, y: 200 }}
        onCancel={vi.fn()}
        onOpenReview={vi.fn()}
        onSubmit={vi.fn(async () => true)}
      />
    );

    const review = screen.getByRole("button", { name: "검토함" });
    const textarea = screen.getByRole("textbox", { name: "위치 댓글 내용" });
    fireEvent.change(textarea, { target: { value: "포커스 순환 초안" } });
    const submit = screen.getByRole("button", { name: "등록" });
    submit.focus();
    fireEvent.keyDown(submit, { key: "Tab" });
    expect(document.activeElement).toBe(review);
    review.focus();
    fireEvent.keyDown(review, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(submit);
  });

  it("keeps cancel and review transitions locked while a submit is in flight", async () => {
    let settle!: (accepted: boolean) => void;
    const onCancel = vi.fn();
    const onOpenReview = vi.fn();
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.5, y: 0.5 }}
        authorName="검토자"
        screenPoint={{ x: 200, y: 200 }}
        onCancel={onCancel}
        onOpenReview={onOpenReview}
        onSubmit={() => new Promise<boolean>((resolve) => {
          settle = resolve;
        })}
      />
    );

    const textarea = screen.getByRole("textbox", { name: "위치 댓글 내용" });
    fireEvent.change(textarea, { target: { value: "저장 중인 댓글" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "위치 댓글 작성" }).getAttribute("aria-busy"))
        .toBe("true");
    });
    expect(screen.getByRole("button", { name: "검토함" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "위치 댓글 작성 취소" }))
      .toHaveProperty("disabled", true);
    fireEvent.keyDown(textarea, { key: "Escape" });
    fireEvent.pointerDown(document.querySelector(
      '[data-studio-point-comment-backdrop="true"]'
    )!);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenReview).not.toHaveBeenCalled();

    settle(false);
    expect((await screen.findByRole("alert")).textContent).toContain("댓글을 저장하지 못했어요");
    expect(screen.getByRole("button", { name: "위치 댓글 작성 취소" }))
      .toHaveProperty("disabled", false);
  });

  it("makes the whole card scrollable inside a short visual viewport", () => {
    const originalViewport = globalThis.visualViewport;
    Object.defineProperty(globalThis, "visualViewport", {
      configurable: true,
      value: {
        offsetLeft: 0,
        offsetTop: 20,
        width: 320,
        height: 180,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    try {
      render(
        <StudioPointCommentComposer
          anchor={{ type: "point", pageId: "page-1", x: 0.5, y: 0.5 }}
          authorName="검토자"
          screenPoint={{ x: 160, y: 90 }}
          onCancel={vi.fn()}
          onSubmit={vi.fn(async () => true)}
        />
      );
      const dialog = screen.getByRole("dialog", { name: "위치 댓글 작성" });
      expect(dialog.style.maxHeight).toBe("156px");
      expect(dialog.className).toContain("overflow-y-auto");
    } finally {
      Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: originalViewport,
      });
    }
  });

  it("keeps a failed draft in place and surfaces the retry reason", async () => {
    render(
      <StudioPointCommentComposer
        anchor={{ type: "point", pageId: "page-1", x: 0.1, y: 0.1 }}
        authorName="작가"
        screenPoint={{ x: 100, y: 100 }}
        onCancel={vi.fn()}
        onSubmit={async () => {
          throw new Error("네트워크 연결을 확인해 주세요.");
        }}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "위치 댓글 내용" }), {
      target: { value: "보존할 초안" },
    });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect((await screen.findByRole("alert")).textContent).toContain("네트워크 연결을 확인해 주세요.");
    expect((screen.getByRole("textbox", { name: "위치 댓글 내용" }) as HTMLTextAreaElement).value)
      .toBe("보존할 초안");
  });
});
