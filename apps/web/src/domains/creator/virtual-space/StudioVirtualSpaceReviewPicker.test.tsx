// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceReviewPicker } from "./StudioVirtualSpaceReviewPicker";

const f = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ listStudioVirtualSpaceReviewSubjects: f.list }));
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
beforeEach(() => { f.list.mockReset().mockResolvedValue({ ok: true, choices: [{ subject, artifactTitle: "Episode one", title: "First review" }], truncated: false }); });
afterEach(cleanup);
describe("Review picker consent lifetime", () => {
  it.each(["close", "unmount"])("aborts the proposal on %s while access is still being checked", async (action) => {
    let signal!: AbortSignal, resolve!: (value: boolean) => void;
    const onInvite = vi.fn((_subject, intent: AbortSignal) => { signal = intent; return new Promise<boolean>((done) => { resolve = done; }); });
    const onClose = vi.fn();
    const mounted = render(<StudioVirtualSpaceReviewPicker workId="work-1" peerName="Bob" disabled={false} onInvite={onInvite} onClose={onClose} />);
    await screen.findByRole("button", { name: "이 검수본으로 초대" });
    expect(onInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 검수본으로 초대" }));
    expect(signal.aborted).toBe(false);
    if (action === "close") fireEvent.click(screen.getByRole("button", { name: "닫기" })); else mounted.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(false); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(action === "close" ? 1 : 0);
  });
});
