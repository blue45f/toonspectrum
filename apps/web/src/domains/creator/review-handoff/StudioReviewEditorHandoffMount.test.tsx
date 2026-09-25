// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";

import type { StudioReviewCaptureHostBindings } from "../review-capture/studio-review-capture-host-context";
import type { StudioEditorCommentTarget } from "../studio-comment-editor-selection";

import { StudioReviewEditorHandoffMount } from "./StudioReviewEditorHandoffMount";
import { StudioReviewEditorLink } from "./StudioReviewEditorLink";
import { studioReviewEditorHref } from "./studio-review-editor-route";
import { reviewEditorFixture } from "./studio-review-editor-test-fixture";

const digestForTest = (value: Record<string, unknown>) => createHash("sha256").update(canonicalJson(value)).digest("hex");

const remote = vi.hoisted(() => ({ authority: vi.fn(), saved: vi.fn(), digest: vi.fn() }));
vi.mock("./studio-review-editor-authority", () => ({ readStudioReviewEditorAuthority: remote.authority }));
vi.mock("../studio-shared-document-client", () => ({ getStudioSharedDocument: remote.saved,
  isStudioSharedDocumentAccessError: (error: unknown) => error instanceof Error && error.message === "access-denied" }));
vi.mock("../virtual-space/studio-virtual-space-review-producer", () => ({ studioReviewCaptureContentDigest: remote.digest }));

function fixture() {
  const data = reviewEditorFixture(digestForTest); let pageId = "p1";
  const bindings: StudioReviewCaptureHostBindings = { studioAuthUserId: "actor", workId: "work", available: true,
    editorMountedRef: { current: true }, studioRevisionProjectGenerationRef: { current: 1 }, drawingRef: { current: null }, pendingStrokeCommitsRef: { current: null },
    captureStudioMutationTicket: () => ({ authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 1 }),
    canApplyStudioMutation: () => true, getSnapshot: () => data.snapshot, canvasWidth: 800, isDurableMask: () => false,
    save: vi.fn(async () => {}), captureAll: vi.fn(async () => []),
  };
  const navigation = { search: studioReviewEditorHref(data.request).split("?")[1]!,
    getCurrentPageId: () => pageId, hasActivePointer: () => false,
    select: vi.fn((target: StudioEditorCommentTarget, current: () => boolean) => {
      if (!current()) return false; pageId = target.pageId; return true;
    }),
  };
  remote.authority.mockResolvedValue(data.authority); remote.saved.mockResolvedValue(data.saved);
  remote.digest.mockImplementation(async (doc) => digestForTest(doc));
  return { ...data, bindings, navigation };
}
beforeEach(() => { vi.clearAllMocks(); persistSession({ user: { id: "actor" } }); });
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });

describe("explicit review editor arrival UI", () => {
  it("does not read on arrival/remount and uses the real controller after one explicit click", async () => {
    const f = fixture();
    render(<StrictMode><StudioReviewEditorHandoffMount bindings={f.bindings} navigation={f.navigation} /></StrictMode>);
    expect(screen.getByRole("button", { name: "의견 위치 선택" }).isConnected).toBe(true);
    expect(remote.authority).not.toHaveBeenCalled(); expect(f.navigation.select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "의견 위치 선택" }));
    await screen.findByText("의견에 연결된 컷을 선택했어요.");
    expect(f.navigation.select).toHaveBeenCalledOnce(); expect(remote.authority).toHaveBeenCalledTimes(2);
    expect(f.bindings.save).not.toHaveBeenCalled(); expect(f.bindings.captureAll).not.toHaveBeenCalled();
  });
  it.each(["blur", "hidden", "actor", "renewal", "unmount", "close"])("cancels %s while a verification response is late", async (reason) => {
    const f = fixture(); let release!: (value: typeof f.authority) => void;
    remote.authority.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const view = render(<StudioReviewEditorHandoffMount bindings={f.bindings} navigation={f.navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "의견 위치 선택" }));
    await waitFor(() => expect(remote.authority).toHaveBeenCalledOnce());
    act(() => {
      if (reason === "blur") window.dispatchEvent(new Event("blur"));
      if (reason === "hidden") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
      }
      if (reason === "actor") persistSession({ user: { id: "other" } });
      if (reason === "renewal") persistSession({ user: { id: "actor", name: "renewal" } });
      if (reason === "unmount") view.unmount();
      if (reason === "close") fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      release(f.authority);
    });
    await act(async () => { await Promise.resolve(); });
    expect(f.navigation.select).not.toHaveBeenCalled();
    expect(screen.queryByText("의견에 연결된 컷을 선택했어요.")).toBeNull();
  });
  it("requires a new explicit click after cancellation; focus and render never restart it", async () => {
    const f = fixture(); let release!: (value: typeof f.authority) => void;
    remote.authority.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const view = render(<StudioReviewEditorHandoffMount bindings={f.bindings} navigation={f.navigation} />);
    fireEvent.click(screen.getByRole("button", { name: "의견 위치 선택" }));
    await waitFor(() => expect(remote.authority).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "확인 중단" }));
    act(() => { release(f.authority); window.dispatchEvent(new Event("focus")); });
    view.rerender(<StudioReviewEditorHandoffMount bindings={f.bindings} navigation={f.navigation} />);
    expect(remote.authority).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "의견 위치 선택" }));
    await screen.findByText("의견에 연결된 컷을 선택했어요."); expect(f.navigation.select).toHaveBeenCalledOnce();
  });
  it("keeps invalid transport inert and exposes a normal keyboard-accessible identity-only link", () => {
    const f = fixture();
    const view = render(<StudioReviewEditorHandoffMount bindings={f.bindings} navigation={{ ...f.navigation, search: "reviewComment=forged" }} />);
    expect(screen.queryByRole("button", { name: "의견 위치 선택" })).toBeNull();
    view.unmount();
    render(<MemoryRouter><StudioReviewEditorLink request={f.request} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "편집기에서 의견 위치 확인" }).getAttribute("href")).toBe(studioReviewEditorHref(f.request));
    expect(remote.authority).not.toHaveBeenCalled();
  });
});
