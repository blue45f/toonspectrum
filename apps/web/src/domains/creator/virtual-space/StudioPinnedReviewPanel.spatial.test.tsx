// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveStudioReviewPageMapping } from "@toonspectrum/studio-project-model";
import { persistSession } from "@/compat/auth-session-state";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ verify: vi.fn(), read: vi.fn(), create: vi.fn(), newId: vi.fn(), actor: "actor-a" }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: f.verify }));
vi.mock("./studio-virtual-space-review-preview", () => ({ getStudioVirtualSpaceReviewPreview: f.read }));
vi.mock("./StudioPinnedReviewComparison", () => ({ StudioPinnedReviewComparison: () => <div>Independent comparison</div> }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ createStudioReviewComment: f.create, newStudioProjectGraphId: f.newId,
  decideStudioReview: vi.fn(), listStudioArtifactRevisions: vi.fn(async () => []), resolveStudioReviewComment: vi.fn(), reopenStudioReviewComment: vi.fn() }));
const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) };
const hash = "b".repeat(64), secondHash = "c".repeat(64);
const doc = { width: 800, pagesList: [0, 1].map((ordinal) => ({ id: `page-${ordinal}`, canvasH: 1200,
  elements: [{ id: `cut-${ordinal}`, type: "frame", x: 100, y: 100, width: 300, height: 400 }, { id: `text-${ordinal}`, type: "text" }] })) };
function verified(comment = true): StudioVirtualSpaceReviewVerification {
  return { ok: true, subject, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/pinned",
    project: { access: { view: true, comment, edit: true }, artifacts: [{ id: subject.artifactId, scope: { projectId: subject.projectId } }] },
    review: { title: "Pinned source", status: "open", reviewerIds: [], comments: [] }, revision: { id: subject.revisionId },
  } as unknown as StudioVirtualSpaceReviewVerification;
}
function preview(ordinal = 0) { return { sha256: ordinal ? secondHash : hash, ordinal, byteLength: 100, mediaType: "image/png", url: `https://preview.invalid/${ordinal}.png`, expiresAt: Date.now() + 30_000,
  mapping: deriveStudioReviewPageMapping(doc, { sourceServerRevision: 7, sourceContentDigest: subject.rootGraphHash, ordinal, renderWidth: 1600, renderHeight: 2400 }) }; }
beforeEach(() => {
  f.actor = "actor-a"; persistSession({ user: { id: f.actor }, token: null });
  for (const mock of [f.verify, f.read, f.create, f.newId]) mock.mockReset();
  f.verify.mockImplementation(async () => verified()); f.read.mockImplementation(async () => ({ ok: true, subject, previews: [preview()], nextCursor: null }));
  f.create.mockResolvedValue({}); f.newId.mockReturnValue("note-one");
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); vi.useRealTimers(); });
async function mount() { const rendered = render(<StudioPinnedReviewPanel subject={subject} />); await screen.findByLabelText("1페이지 의견 위치"); return rendered; }
function selectCut() {
  const page = within(screen.getByLabelText("1페이지 의견 위치"));
  fireEvent.change(page.getByLabelText("위치 방식"), { target: { value: "panel" } });
  fireEvent.change(page.getByLabelText("연결할 컷"), { target: { value: "cut-0" } });
  fireEvent.click(page.getByRole("button", { name: "이 위치에 의견 연결" }));
}
function write() { fireEvent.change(screen.getByLabelText("이 버전에 의견 남기기"), { target: { value: "Move this exact cut." } }); }
function save() { fireEvent.click(screen.getByRole("button", { name: "의견 저장" })); }
describe("real pinned preview to spatial note integration", () => {
  it("stores the explicit cut source and immutable review pin without inventing graph panel scope", async () => {
    await mount(); selectCut(); write(); expect(f.create).not.toHaveBeenCalled(); save();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    expect(f.create.mock.lastCall).toEqual(["review", { id: "note-one", body: "Move this exact cut.", severity: "note", anchor: {
      kind: "panel", artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" },
      source: { version: 1, sourceServerRevision: 7, sourceContentDigest: subject.rootGraphHash, pageOrdinal: 0, pageId: "page-0", frameId: "cut-0" },
    } }]);
    expect(screen.getByText("Independent comparison")).toBeTruthy();
  });
  it("preserves an uncertain spatial attempt and retries the exact same id and anchor only on click", async () => {
    f.create.mockRejectedValueOnce(new Error("response lost"));
    await mount(); selectCut(); write(); save(); await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    const attempted = f.create.mock.calls[0]![1]; expect(f.create).toHaveBeenCalledOnce(); save();
    await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls[1]![1]).toEqual(attempted); expect(f.newId).toHaveBeenCalledOnce();
  });
  it("clears a selected cut on pagination and requires an explicit whole-review choice before falling back", async () => {
    f.read.mockImplementation(async (_subject, cursor) => ({ ok: true, subject, previews: [preview(cursor ? 1 : 0)], nextCursor: cursor ? null : `0.${hash}` }));
    await mount(); selectCut(); write(); fireEvent.click(screen.getByRole("button", { name: "다음 미리보기" }));
    await screen.findByLabelText("2페이지 의견 위치");
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("위치를 다시 선택하거나 전체 검수본 의견으로 바꿔 주세요.")).toBeTruthy();
    expect((screen.getByLabelText("이 버전에 의견 남기기") as HTMLTextAreaElement).value).toBe("Move this exact cut.");
    fireEvent.click(screen.getByRole("button", { name: "전체 검수본에 의견" })); save();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    expect(f.create.mock.lastCall?.[1].anchor).toEqual({ kind: "artifact", artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } });
  });
  it("cancels a late pre-save check when backgrounding invalidates the chosen location", async () => {
    await mount(); selectCut(); write();
    let resolve!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; })); save();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    await act(async () => { visibility.mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
    await screen.findByLabelText("이 버전에 의견 남기기"); await act(async () => { resolve(verified()); });
    expect(f.create).not.toHaveBeenCalled(); expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("removes the old actor's annotation and draft during the account switch", async () => {
    const mounted = await mount(); selectCut(); write();
    await act(async () => { f.actor = "actor-b"; persistSession({ user: { id: f.actor }, token: null }); mounted.rerender(<StudioPinnedReviewPanel subject={subject} />); });
    await screen.findByLabelText("이 버전에 의견 남기기");
    expect((screen.getByLabelText("이 버전에 의견 남기기") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("button", { name: "전체 검수본에 의견" })).toBeNull();
    write(); save(); await waitFor(() => expect(f.create).toHaveBeenCalledOnce()); expect(f.create.mock.lastCall?.[1].anchor.kind).toBe("artifact");
  });
  it("drops spatial placement after permission revocation without submitting its retained draft", async () => {
    await mount(); selectCut(); write(); f.verify.mockResolvedValueOnce(verified(false)); save();
    await screen.findByText("현재 검수본에 의견을 남길 권한이 없어요."); expect(f.create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("이 버전에 의견 남기기")).toBeNull(); expect(screen.queryByLabelText("위치 방식")).toBeNull();
    fireEvent(window, new Event("focus")); await screen.findByLabelText("이 버전에 의견 남기기");
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("offers only whole-review notes when an old capture has no verified source map", async () => {
    f.read.mockImplementation(async () => ({ ok: true, subject, previews: [{ ...preview(), mapping: { status: "unmapped", reason: "legacy-review" } }], nextCursor: null }));
    render(<StudioPinnedReviewPanel subject={subject} />); await screen.findByText(/페이지·컷 위치를 확인할 수 없어/u);
    expect(screen.queryByLabelText("위치 방식")).toBeNull(); write(); save();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce()); expect(f.create.mock.lastCall?.[1].anchor).not.toHaveProperty("source");
  });
});
