// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistSession } from "@/compat/auth-session-state";

import { StudioPinnedReviewComparison } from "./StudioPinnedReviewComparison";

import type { StudioVirtualSpaceReviewChoices } from "./studio-virtual-space-review-invitation";
import type { StudioVirtualSpaceReviewPreview, StudioVirtualSpaceReviewPreviews } from "./studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-subject";

const f = vi.hoisted(() => ({ history: vi.fn(), read: vi.fn(), actor: "actor-a" as string | null }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: f.actor ? { user: { id: f.actor } } : null }) }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ listStudioVirtualSpaceReviewHistory: f.history }));
vi.mock("./studio-virtual-space-review-preview", () => ({ getStudioVirtualSpaceReviewPreview: f.read }));
const base: StudioVirtualSpaceReviewSubject = { schemaVersion: 1, workId: "work", projectId: "graph", artifactId: "artifact",
  reviewId: "current-review", revisionId: "current-revision", rootGraphHash: "a".repeat(64) };
const prior: StudioVirtualSpaceReviewSubject = { ...base, reviewId: "previous-review", revisionId: "previous-revision", rootGraphHash: "b".repeat(64) };
function history(): StudioVirtualSpaceReviewChoices {
  return { ok: true, truncated: false, choices: [{ subject: prior, title: "이전 검수본", artifactTitle: "작업",
    createdAt: "2026-09-20T00:00:00.000Z" }] };
}
function preview(subject: StudioVirtualSpaceReviewSubject, ordinal = 0): StudioVirtualSpaceReviewPreview {
  return { ordinal, sha256: (subject === base ? "c" : "d").repeat(62) + String(ordinal).padStart(2, "0"),
    byteLength: 100, mediaType: "image/png", url: `https://preview.invalid/${subject.reviewId}/${ordinal}`, expiresAt: Date.now() + 30_000,
    mapping: { status: "mapped", version: 1, sourceServerRevision: subject === base ? 2 : 1,
      sourceContentDigest: subject.rootGraphHash, page: { id: `page-${ordinal}`, ordinal, width: 800, height: 1_000,
        renderWidth: 800, renderHeight: 1_000, frames: [], elements: [] } } };
}
function ready(subject: StudioVirtualSpaceReviewSubject, pages = [preview(subject)], nextCursor: string | null = null): StudioVirtualSpaceReviewPreviews {
  return { ok: true, subject, previews: pages, nextCursor };
}
beforeEach(() => {
  vi.useFakeTimers(); f.actor = "actor-a"; persistSession({ user: { id: f.actor }, token: null });
  f.history.mockReset().mockImplementation(async () => history());
  f.read.mockReset().mockImplementation(async (subject) => ready(subject));
});
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });
async function openComparison() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "이전 검수본과 비교" })); });
}
async function choose() {
  await act(async () => { fireEvent.change(screen.getByRole("combobox", { name: "비교할 검수본" }), { target: { value: prior.reviewId } }); });
}
function mount(onRevoked = vi.fn()) {
  return render(<StudioPinnedReviewComparison subject={base} title="현재 검수본" onRevoked={onRevoked} />);
}

describe("immutable review comparison", () => {
  it("waits for explicit discovery and selection, then reads only the two pinned subjects", async () => {
    mount();
    expect(f.history).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
    await openComparison();
    expect(f.history).toHaveBeenCalledExactlyOnceWith(base);
    expect(f.read).not.toHaveBeenCalled();
    await choose();
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.read).toHaveBeenCalledWith(base, null); expect(f.read).toHaveBeenCalledWith(prior, null);
    expect(screen.getByRole("img", { name: "기준 검수본 페이지" }).getAttribute("src")).toContain(base.reviewId);
    expect(screen.getByRole("img", { name: "비교 검수본 페이지" }).getAttribute("src")).toContain(prior.reviewId);
    expect(screen.getAllByRole("img").every((image) => image.getAttribute("referrerpolicy") === "no-referrer")).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /승인/u })).toBeNull();
  });

  it("overlays verified matching pages and changes opacity without issuing another read", async () => {
    mount(); await openComparison(); await choose();
    const button = screen.getByRole("button", { name: "겹쳐 보기" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: /비교본 불투명도/u }), { target: { value: "75" } });
    expect(screen.getByRole("img", { name: "비교 검수본 페이지" }).closest("div")?.style.opacity).toBe("0.75");
    expect(f.read).toHaveBeenCalledTimes(2);
  });

  it.each(["legacy", "page", "width", "render"])("keeps %s mismatches side by side without pretending they align", async (mismatch) => {
    const page = preview(prior);
    if (page.mapping.status !== "mapped") throw new Error("fixture");
    if (mismatch === "legacy") page.mapping = { status: "unmapped", reason: "legacy-review" };
    else if (mismatch === "page") page.mapping.page.id = "another-page";
    else if (mismatch === "width") page.mapping.page.width = 900;
    else page.mapping.page.renderWidth = 400;
    f.read.mockImplementation(async (subject) => ready(subject, subject === prior ? [page] : undefined));
    mount(); await openComparison(); await choose();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "겹쳐 보기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("keeps page selection and pagination independent for each immutable snapshot", async () => {
    const cursor = `1.${preview(base, 1).sha256}`;
    f.read.mockImplementation(async (subject, requestedCursor) => requestedCursor
      ? ready(subject, [preview(subject, 32)])
      : ready(subject, [preview(subject), preview(subject, 1)], subject === base ? cursor : null));
    mount(); await openComparison(); await choose();
    fireEvent.change(screen.getByRole("combobox", { name: "비교 검수본 페이지" }), { target: { value: "1" } });
    expect(screen.getByRole("img", { name: "기준 검수본 페이지" }).getAttribute("src")).toContain("/0");
    expect(screen.getByRole("img", { name: "비교 검수본 페이지" }).getAttribute("src")).toContain("/1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "다음 페이지 목록" })); });
    expect(f.read).toHaveBeenLastCalledWith(base, cursor);
    expect(screen.getByRole("img", { name: "기준 검수본 페이지" }).getAttribute("src")).toContain("/32");
    expect(screen.getByRole("img", { name: "비교 검수본 페이지" }).getAttribute("src")).toContain("/1");
    expect(f.read.mock.calls.filter(([subject]) => subject === prior)).toHaveLength(1);
  });

  it("allows closing a pending history read, restores focus, and ignores its late result", async () => {
    let resolve!: (value: StudioVirtualSpaceReviewChoices) => void;
    f.history.mockReturnValue(new Promise((done) => { resolve = done; }));
    mount(); await openComparison();
    fireEvent.keyDown(screen.getByRole("region", { name: "검수 버전 비교" }), { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "이전 검수본과 비교" }));
    await act(async () => { resolve(history()); });
    expect(screen.queryByRole("combobox")).toBeNull(); expect(f.read).not.toHaveBeenCalled();
  });

  it("removes a selected pair on actor change and fences a delayed preview response", async () => {
    let resolve!: (value: StudioVirtualSpaceReviewPreviews) => void;
    f.read.mockImplementation((subject) => subject === base ? Promise.resolve(ready(base))
      : new Promise((done) => { resolve = done; }));
    const component = mount(); await openComparison(); await choose();
    f.actor = "actor-b"; persistSession({ user: { id: f.actor }, token: null });
    component.rerender(<StudioPinnedReviewComparison subject={base} title="현재 검수본" onRevoked={vi.fn()} />);
    await act(async () => { resolve(ready(prior)); });
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "이전 검수본과 비교" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("expires the whole pair if one renewal stalls and removes history when backgrounded", async () => {
    mount(); await openComparison(); await choose();
    f.read.mockImplementation((subject) => subject === prior ? new Promise(() => {}) : Promise.resolve(ready(base)));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.getAllByRole("img")).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("이전 검수본", { selector: "option" })).toBeNull();
  });

  it("reports revoked access and never keeps the other private image visible", async () => {
    const revoked = vi.fn(); mount(revoked); await openComparison(); await choose();
    f.read.mockImplementation(async (subject) => subject === prior ? { ok: false, reason: "access-denied" } : ready(base));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(revoked).toHaveBeenCalledOnce();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "검수 버전 비교" })).queryByRole("slider")).toBeNull();
  });
});

describe("comparison workbench controls", () => {
  it("offers one-image A/B comparison and zoom without changing or refetching the pinned input", async () => {
    mount(); await openComparison(); await choose();
    fireEvent.click(screen.getByRole("button", { name: "A/B 전환" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("src")).toContain(base.reviewId);
    fireEvent.click(screen.getByRole("button", { name: "B · 비교본" }));
    expect(screen.getByRole("img").getAttribute("src")).toContain(prior.reviewId);
    fireEvent.change(screen.getByRole("combobox", { name: "확대" }), { target: { value: "150" } });
    expect(screen.getByRole("img").closest("div")?.style.width).toBe("150%");
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it("links an inserted page list by stable source ID rather than ordinal", async () => {
    const inserted = preview(prior, 0), target = preview(prior, 3);
    if (inserted.mapping.status !== "mapped" || target.mapping.status !== "mapped") throw new Error("fixture");
    inserted.mapping.page.id = "inserted";
    target.mapping.page.id = "page-0";
    f.read.mockImplementation(async (subject) => ready(subject, subject === prior ? [inserted, target] : undefined));
    mount(); await openComparison(); await choose();
    fireEvent.click(screen.getByRole("checkbox", { name: "같은 원본 페이지 연결" }));
    expect(screen.getByRole("combobox", { name: "비교 검수본 페이지" })).toHaveProperty("value", "3");
    expect(screen.getByRole("img", { name: "비교 검수본 페이지" }).getAttribute("src")).toContain("/3");
    expect(f.read).toHaveBeenCalledTimes(2);
  });
});
