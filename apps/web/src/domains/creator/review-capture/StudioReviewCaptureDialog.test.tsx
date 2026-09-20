// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioReviewCaptureDialog } from "./StudioReviewCaptureDialog";
import { EMPTY_STUDIO_REVIEW_CAPTURE } from "./studio-review-capture-bridge";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(cleanup);

describe("pinned review capture dialog", () => {
  it("keeps saving explicit and does not turn showing the save requirement into a save action", () => {
    const save = vi.fn(); const close = vi.fn();
    render(<StudioReviewCaptureDialog open snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE,
      phase: "needs-save", reason: "not-saved" }} onSave={save} onRetry={vi.fn()} onClose={close} />);
    expect(save).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "저장 후 다시 확인" });
    expect(button.className).toContain("min-h-11"); fireEvent.click(button);
    expect(save).toHaveBeenCalledOnce();
  });
  it("shows exact successful review links and requires a separate action to open or invite", () => {
    const close = vi.fn();
    render(<StudioReviewCaptureDialog open snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE,
      phase: "completed", title: "Source", sourceRevision: 7, pageCount: 2,
      subject: { schemaVersion: 1, projectId: "graph", workId: "work", artifactId: "artifact",
        reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) },
    }} onSave={vi.fn()} onRetry={vi.fn()} onClose={close} />);
    const review = screen.getByRole("link", { name: "검수본 보기" });
    const url = new URL(review.getAttribute("href")!, "https://example.test");
    expect(url.searchParams.get("revision")).toBe("revision"); expect(url.searchParams.get("sharedReview")).toBe("review");
    expect(url.searchParams.get("digest")).toBe("a".repeat(64));
    expect(screen.getByRole("link", { name: "가상 스튜디오에서 초대" }).getAttribute("href")).toBe("/studio/p/work/space");
    expect(close).not.toHaveBeenCalled();
  });
  it("distinguishes an unconfirmed cancellation from a completed cancellation", () => {
    const retry = vi.fn();
    render(<StudioReviewCaptureDialog open snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE,
      phase: "cancel-uncertain", canRetry: true }} onSave={vi.fn()} onRetry={retry} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("취소 응답을 확인하지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "취소 결과 다시 확인" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("reports confirmed cancellation with unfinished image cleanup and exposes a separate retry", () => {
    const retry = vi.fn();
    render(<StudioReviewCaptureDialog open snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE,
      phase: "cleanup-pending", canRetry: true }} onSave={vi.fn()} onRetry={retry} onClose={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain("검수본 생성은 취소됐고");
    fireEvent.click(screen.getByRole("button", { name: "임시 이미지 정리 재시도" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
