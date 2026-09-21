// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/compat/auth-session-state";
import { StudioReviewDraftShelf } from "./StudioReviewDraftShelf";
import type { ReviewDraftScope, ReviewPrivateDraft } from "./studio-review-draft-shelf";

const f = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), reviseBody: vi.fn(), remove: vi.fn(), publish: vi.fn(), stored: vi.fn(), published: vi.fn() }));
vi.mock("./studio-review-draft-shelf", async (original) => ({ ...(await original<typeof import("./studio-review-draft-shelf")>()),
  acquireReviewDraftRepository: async () => ({ list: f.list, add: f.add, reviseBody: f.reviseBody, remove: f.remove }) }));
vi.mock("./studio-review-draft-publish", () => ({ publishReviewDrafts: f.publish }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ newStudioProjectGraphId: () => "draft-a" }));
const scope: ReviewDraftScope = { actorId: "actor-a", subject: { schemaVersion: 1, workId: "work", projectId: "graph", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } };
const entry: ReviewPrivateDraft = { input: { id: "draft-a", body: "저장한 개인 의견", severity: "note", assigneeIds: [], anchor: { kind: "artifact", artifactId: "artifact", revisionId: "revision", scope: { projectId: "graph" } } }, state: "draft", savedAt: 1 };
function Harness({ owner = scope }: { owner?: ReviewDraftScope }) {
  const [busy, setBusy] = useState(false);
  return <StudioReviewDraftShelf scope={owner} compose={entry.input} disabled={busy} onBusy={setBusy} onStored={f.stored} onPublished={f.published} />;
}
function open() { document.querySelector("details")!.open = true; }
async function load() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "개인 초안 불러오기" })); }); }
beforeEach(() => {
  persistSession({ user: { id: "actor-a" }, token: null });
  for (const mock of Object.values(f)) mock.mockReset();
  f.list.mockResolvedValue([entry]); f.add.mockResolvedValue([entry]); f.remove.mockResolvedValue([]); f.reviseBody.mockResolvedValue([entry]);
  f.publish.mockResolvedValue({ confirmed: ["draft-a"], stopped: null });
});
afterEach(() => { cleanup(); persistSession(null); });
describe("private draft UI", () => {
  it("waits for explicit loading and never publishes automatically", async () => {
    render(<Harness />); open(); expect(f.list).not.toHaveBeenCalled();
    await load(); expect(screen.getByRole("checkbox", { name: "저장한 개인 의견" })).toBeTruthy();
    expect(f.publish).not.toHaveBeenCalled(); expect(f.stored).not.toHaveBeenCalled();
  });
  it("clears the composer only after durable storage and blocks double clicks", async () => {
    let resolve!: (entries: ReviewPrivateDraft[]) => void;
    f.add.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<Harness />); open(); const button = screen.getByRole("button", { name: "초안에 담고 입력 비우기" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(f.add).toHaveBeenCalledTimes(1); expect(f.stored).not.toHaveBeenCalled();
    expect(button).toHaveProperty("disabled", true);
    await act(async () => { resolve([entry]); });
    expect(f.stored).toHaveBeenCalledTimes(1); expect(f.publish).not.toHaveBeenCalled();
  });
  it("keeps the composer on storage failure", async () => {
    f.add.mockRejectedValue(new Error("unavailable")); render(<Harness />); open();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "초안에 담고 입력 비우기" })); });
    expect(f.stored).not.toHaveBeenCalled(); expect(screen.getByRole("status").textContent).toContain("입력과 기존 저장본은 유지");
  });
  it("requires selection plus explicit confirmation and reports a partial batch accurately", async () => {
    const other = { ...entry, input: { ...entry.input, id: "draft-b", body: "두 번째 의견" } };
    f.list.mockResolvedValue([entry, other]); f.publish.mockResolvedValue({ confirmed: ["draft-a"], stopped: "draft-b" });
    render(<Harness />); open(); await load();
    const publish = screen.getByRole("button", { name: "선택한 초안 발행·결과 확인" }); expect(publish).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "저장한 개인 의견" })); fireEvent.click(screen.getByRole("checkbox", { name: "두 번째 의견" }));
    expect(publish).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /선택한 2개 의견/u }));
    f.list.mockResolvedValue([other]);
    await act(async () => { fireEvent.click(publish); });
    expect(f.publish).toHaveBeenCalledTimes(1); expect(screen.getByRole("status").textContent).toContain("1개 의견만 발행");
    expect(f.published).toHaveBeenCalledTimes(1);
  });
  it("locks uncertain publication contents and preserves them for reconciliation", async () => {
    f.list.mockResolvedValue([{ ...entry, state: "attempted" }]); render(<Harness />); open(); await load();
    document.querySelectorAll("details").forEach((details) => { details.open = true; });
    expect(screen.getByRole("button", { name: "미발행 초안 삭제" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "초안 본문 저장" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
  });
  it("drops late loaded private data when the account or pinned subject changes", async () => {
    let resolve!: (entries: ReviewPrivateDraft[]) => void;
    f.list.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(<Harness />); open(); await load();
    persistSession({ user: { id: "actor-b" }, token: null });
    view.rerender(<Harness owner={{ ...scope, actorId: "actor-b" }} />);
    await act(async () => { resolve([entry]); }); open();
    expect(screen.queryByText("저장한 개인 의견")).toBeNull(); expect(f.publish).not.toHaveBeenCalled();
  });
});
describe("private draft action cleanup", () => {
  it("releases the parent action when the shelf disappears during a pending read", async () => {
    let resolve!: (entries: ReviewPrivateDraft[]) => void;
    f.list.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onBusy = vi.fn();
    const view = render(<StudioReviewDraftShelf scope={scope} compose={entry.input} disabled={false}
      onBusy={onBusy} onStored={f.stored} onPublished={f.published} />);
    open(); await load();
    expect(onBusy).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(onBusy).toHaveBeenLastCalledWith(false);
    const calls = onBusy.mock.calls.length;
    await act(async () => { resolve([entry]); });
    expect(onBusy).toHaveBeenCalledTimes(calls);
    expect(f.stored).not.toHaveBeenCalled(); expect(f.published).not.toHaveBeenCalled();
  });
});
it("does not release a parent action owned by the direct comment form", () => {
  const onBusy = vi.fn();
  const view = render(<StudioReviewDraftShelf scope={scope} compose={entry.input} disabled
    onBusy={onBusy} onStored={f.stored} onPublished={f.published} />);
  view.unmount();
  expect(onBusy).not.toHaveBeenCalled();
});
