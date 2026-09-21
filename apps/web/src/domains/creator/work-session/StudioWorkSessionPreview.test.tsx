// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStudioWorkSession } from "@toonspectrum/studio-project-model/work-session";
import { StudioWorkSessionPreview } from "./StudioWorkSessionPreview";
import type { StudioWorkSessionController } from "./studio-work-session-controller";

const boundary = vi.hoisted(() => ({ result: { ok: true, previews: [] as unknown[], nextCursor: null }, cursor: null, setCursor: vi.fn(), refresh: vi.fn() }));
vi.mock("../virtual-space/use-studio-pinned-review-previews", () => ({ useStudioPinnedReviewPreviews: () => boundary }));
vi.mock("../virtual-space/StudioPinnedReviewPreview", () => ({ StudioReviewImage: ({ label }: { label: string }) => <img alt={label} /> }));
const source = { version: 1 as const, sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), pageOrdinal: 0, pageId: "page-1" };
const session = createStudioWorkSession({ id: "session", operationId: "create", title: "Session", purpose: "Test", kind: "reading", invitedUserIds: [],
  input: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: source.sourceContentDigest } },
  { userId: "host", canComment: true, canEdit: true }, "2026-09-21T10:00:00.000Z");
const mapping = { status: "mapped", sourceContentDigest: source.sourceContentDigest, sourceServerRevision: 7,
  page: { id: "page-1", ordinal: 0, frames: [{ id: "cut-1" }] } };
beforeEach(() => { boundary.result.previews = [{ ordinal: 0, sha256: "b".repeat(64), mapping }]; });
afterEach(cleanup);
it("does not substitute a mismatched pinned page after ordinary scroll, click or zoom", () => {
  const command = vi.fn(), controller = { command } as unknown as StudioWorkSessionController;
  render(<StudioWorkSessionPreview view={{ session, capabilities: { edit: true, comment: true } }} controller={controller} busy={false}
    request={{ id: "request", source: { ...source, pageId: "wrong-page" }, cursor: null }} />);
  const region = screen.getByRole("region", { name: "검수본 스크롤 영역" });
  expect(screen.queryByRole("img")).toBeNull(); fireEvent.wheel(region); fireEvent.pointerDown(region); fireEvent.keyDown(region, { key: "ArrowDown" });
  fireEvent.change(screen.getByRole("combobox", { name: "확대" }), { target: { value: "2" } });
  expect(screen.queryByRole("img")).toBeNull(); expect(command).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "페이지" }), { target: { value: "0" } });
  expect(screen.getByRole("img")).toBeTruthy();
});
it("does not infer a missing cut from a page with the same ordinal", () => {
  render(<StudioWorkSessionPreview view={{ session, capabilities: { edit: true, comment: true } }} controller={{} as StudioWorkSessionController} busy={false}
    request={{ id: "request", source: { ...source, frameId: "missing-cut" }, cursor: null }} />);
  expect(screen.queryByRole("img")).toBeNull();
});
it("keeps following opt-in and stops it for keyboard navigation without issuing edits", () => {
  const command = vi.fn(), controller = { command } as unknown as StudioWorkSessionController;
  render(<StudioWorkSessionPreview view={{ session: { ...session, status: "active", presenter: { pageOrdinal: 0, zoom: 1, x: 0, y: 0 } }, capabilities: { edit: false, comment: true } }} controller={controller} busy={false} />);
  expect(screen.getByRole("button", { name: "공유한 위치 따라보기" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "공유한 위치 따라보기" }));
  expect(screen.getByRole("button", { name: "따라보기 중지" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.keyDown(screen.getByRole("button", { name: "키보드로 미리보기 이동" }), { key: "PageDown" });
  expect(screen.getByRole("button", { name: "공유한 위치 따라보기" }).getAttribute("aria-pressed")).toBe("false");
  expect(command).not.toHaveBeenCalled();
});
