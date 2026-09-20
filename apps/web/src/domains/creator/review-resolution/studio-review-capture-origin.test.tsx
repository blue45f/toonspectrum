// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioReviewEditorHref } from "../review-handoff/studio-review-editor-route";
import { reviewEditorFixture } from "../review-handoff/studio-review-editor-test-fixture";
import type { StudioReviewCaptureHostBindings } from "../review-capture/studio-review-capture-host-context";
import { useStudioReviewCaptureHost } from "../review-capture/useStudioReviewCaptureHost";
import { EMPTY_STUDIO_REVIEW_CAPTURE, type StudioReviewCaptureSnapshot } from "../review-capture/studio-review-capture-bridge";
import type { StudioReviewCaptureOrigin } from "./StudioReviewCaptureReturnLink";

const io = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn(), retry: vi.fn(), close: vi.fn(), snapshot: null as StudioReviewCaptureSnapshot | null }));
vi.mock("../review-capture/useStudioReviewCapture", () => ({ useStudioReviewCapture: () => ({ ...io, visible: true, snapshot: io.snapshot ?? EMPTY_STUDIO_REVIEW_CAPTURE }) }));
vi.mock("../review-handoff/StudioReviewEditorHandoffMount", () => ({ StudioReviewEditorHandoffMount: () => null }));
vi.mock("../review-capture/StudioReviewCaptureDialogMount", () => ({ StudioReviewCaptureDialogMount: ({ origin, snapshot }: { origin: StudioReviewCaptureOrigin | null; snapshot: StudioReviewCaptureSnapshot }) => <output data-testid="origin" data-phase={snapshot.phase}>{JSON.stringify(origin)}</output> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); io.snapshot = null; });
const f = reviewEditorFixture(() => "a".repeat(64));
function Host({ commentId = "comment", actor = "actor", workId = "work" }: { commentId?: string; actor?: string; workId?: string }) {
  const bindings: StudioReviewCaptureHostBindings = { studioAuthUserId: actor, workId, available: true, editorMountedRef: { current: true },
    studioRevisionProjectGenerationRef: { current: 1 }, drawingRef: { current: null }, pendingStrokeCommitsRef: { current: null },
    captureStudioMutationTicket: () => ({ authScopeKey: actor, workId, accessGeneration: 1, documentGeneration: 1 }),
    canApplyStudioMutation: () => true, getSnapshot: () => f.snapshot, canvasWidth: 800, isDurableMask: () => false, save: async () => {}, captureAll: async () => [] };
  const capture = useStudioReviewCaptureHost({ ...bindings, reviewHandoff: {
    search: studioReviewEditorHref({ ...f.request, commentId }).split("?")[1]!, getCurrentPageId: () => "p1", hasActivePointer: () => false, select: () => true,
  } });
  return <><button onClick={capture.open}>Capture</button>{capture.dialog}</>;
}
describe("capture owner pins its original handoff", () => {
  it("retains the same intent origin across route changes/reopening and only a new owner can replace it", () => {
    io.open.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(true);
    const view = render(<Host />); fireEvent.click(screen.getByText("Capture"));
    expect(JSON.parse(screen.getByTestId("origin").textContent!).request.commentId).toBe("comment");
    view.rerender(<Host commentId="other-comment" />); fireEvent.click(screen.getByText("Capture"));
    expect(JSON.parse(screen.getByTestId("origin").textContent!).request.commentId).toBe("comment");
    fireEvent.click(screen.getByText("Capture")); expect(JSON.parse(screen.getByTestId("origin").textContent!).request.commentId).toBe("other-comment");
  });
  it("removes the old capture origin immediately when actor or work changes", () => {
    io.open.mockReturnValue(true); const view = render(<Host />); fireEvent.click(screen.getByText("Capture"));
    view.rerender(<Host actor="other" />); expect(screen.getByTestId("origin").textContent).toBe("null");
    fireEvent.click(screen.getByText("Capture")); expect(JSON.parse(screen.getByTestId("origin").textContent!).actorId).toBe("other");
    view.rerender(<Host actor="other" workId="next-work" />); expect(screen.getByTestId("origin").textContent).toBe("null");
  });
  it("does not map delayed completion onto a different comment in the same work", () => {
    io.open.mockReturnValueOnce(true).mockReturnValue(false);
    io.snapshot = { ...EMPTY_STUDIO_REVIEW_CAPTURE, phase: "capturing" };
    const view = render(<Host />); fireEvent.click(screen.getByText("Capture"));
    view.rerender(<Host commentId="later-route-comment" />);
    io.snapshot = { ...EMPTY_STUDIO_REVIEW_CAPTURE, phase: "completed", subject: { ...f.request.subject, reviewId: "new-review", revisionId: "new-snapshot" } };
    view.rerender(<Host commentId="later-route-comment" />);
    expect(screen.getByTestId("origin").getAttribute("data-phase")).toBe("completed");
    expect(JSON.parse(screen.getByTestId("origin").textContent!).request.commentId).toBe("comment");
    fireEvent.click(screen.getByText("Capture"));
    expect(JSON.parse(screen.getByTestId("origin").textContent!).request.commentId).toBe("comment");
  });
});
