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

function prepareScrollPane(name: string, width = 400, height = 1400) {
  const pane = screen.getByRole("region", { name });
  Object.defineProperties(pane, {
    clientWidth: { configurable: true, value: 200 }, clientHeight: { configurable: true, value: 400 },
    scrollWidth: { configurable: true, value: width }, scrollHeight: { configurable: true, value: height },
  });
  const images = within(pane).getAllByRole("img");
  for (const image of images) Object.defineProperties(image, {
    complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 800 },
  });
  for (const image of images) fireEvent.load(image);
  return pane;
}
function scrollPane(pane: HTMLElement, left: number, top: number) {
  pane.scrollLeft = left; pane.scrollTop = top; fireEvent.scroll(pane);
}

describe("comparison viewport continuity", () => {
  it("keeps each independent page position through A/B switching and zoom", async () => {
    mount(); await openComparison(); await choose();
    const left = prepareScrollPane("기준 검수본 페이지"), right = prepareScrollPane("비교 검수본 페이지");
    scrollPane(left, 50, 250); scrollPane(right, 140, 700);
    fireEvent.click(screen.getByRole("button", { name: "A/B 전환" }));
    expect(prepareScrollPane("기준 검수본 페이지").scrollTop).toBe(250);
    fireEvent.click(screen.getByRole("button", { name: "B · 비교본" }));
    expect(prepareScrollPane("비교 검수본 페이지").scrollTop).toBe(700);
    fireEvent.change(screen.getByRole("combobox", { name: "확대" }), { target: { value: "200" } });
    const zoomed = prepareScrollPane("비교 검수본 페이지", 600, 2400);
    expect(zoomed.scrollLeft).toBe(280); expect(zoomed.scrollTop).toBe(1400);
    fireEvent.click(screen.getByRole("button", { name: "A · 기준본" }));
    expect(prepareScrollPane("기준 검수본 페이지", 600, 2400).scrollTop).toBe(500);
    expect(f.read).toHaveBeenCalledTimes(2);
  });
  it("carries a linked position to the hidden A/B side, overlay and explicit reset", async () => {
    mount(); await openComparison(); await choose();
    fireEvent.click(screen.getByRole("checkbox", { name: "같은 원본 페이지 연결" }));
    const left = prepareScrollPane("기준 검수본 페이지"); prepareScrollPane("비교 검수본 페이지");
    scrollPane(left, 60, 600);
    fireEvent.click(screen.getByRole("button", { name: "A/B 전환" }));
    fireEvent.click(screen.getByRole("button", { name: "B · 비교본" }));
    expect(prepareScrollPane("비교 검수본 페이지").scrollTop).toBe(600);
    fireEvent.click(screen.getByRole("button", { name: "겹쳐 보기" }));
    const overlay = prepareScrollPane("겹친 원고"); expect(overlay.scrollTop).toBe(600);
    scrollPane(overlay, 80, 800);
    fireEvent.click(screen.getByRole("button", { name: "나란히 보기" }));
    expect(prepareScrollPane("기준 검수본 페이지").scrollTop).toBe(800);
    expect(prepareScrollPane("비교 검수본 페이지").scrollTop).toBe(800);
    fireEvent.click(screen.getByRole("button", { name: "보기 위치 초기화" }));
    expect(prepareScrollPane("기준 검수본 페이지").scrollTop).toBe(0);
    expect(prepareScrollPane("비교 검수본 페이지").scrollTop).toBe(0);
  });
  it("changes only the preview background and defaults narrow screens to A/B", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(max-width: 767px)",
      media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    try {
      mount(); await openComparison(); await choose();
      expect(screen.getByRole("button", { name: "A/B 전환" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getAllByRole("img")).toHaveLength(1);
      fireEvent.change(screen.getByRole("combobox", { name: "원고 배경" }), { target: { value: "light" } });
      expect(screen.getByRole("region", { name: "기준 검수본 페이지" }).style.backgroundColor).toBe("rgb(247, 247, 247)");
      expect(f.read).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps decoded image and view state when only the preview lease renews", async () => {
    mount(); await openComparison(); await choose();
    const left = prepareScrollPane("기준 검수본 페이지"); prepareScrollPane("비교 검수본 페이지");
    scrollPane(left, 40, 400);
    fireEvent.change(screen.getByRole("combobox", { name: "확대" }), { target: { value: "150" } });
    f.read.mockImplementation(async (subject) => ready(subject, [{ ...preview(subject), url: `${preview(subject).url}?renewed=1` }]));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.getByRole("combobox", { name: "확대" })).toHaveProperty("value", "150");
    expect(screen.getByRole("img", { name: "기준 검수본 페이지" }).getAttribute("src")).not.toContain("renewed");
    expect(prepareScrollPane("기준 검수본 페이지").scrollTop).toBe(400);
  });
  it("does not reuse the prior page's view when identical pixels refer to a different source", async () => {
    const next = preview(base, 1); next.sha256 = preview(base).sha256;
    f.read.mockImplementation(async (subject) => ready(subject, subject === base ? [preview(base), next] : undefined));
    mount(); await openComparison(); await choose();
    scrollPane(prepareScrollPane("기준 검수본 페이지"), 50, 750);
    fireEvent.change(screen.getByRole("combobox", { name: "확대" }), { target: { value: "200" } });
    fireEvent.change(screen.getByRole("combobox", { name: "기준 검수본 페이지" }), { target: { value: "1" } });
    expect(screen.getByRole("combobox", { name: "확대" })).toHaveProperty("value", "100");
    expect(prepareScrollPane("기준 검수본 페이지").scrollTop).toBe(0);
  });
});

function sourceCutPreview(subject: StudioVirtualSpaceReviewSubject, id = "page-0") {
  const p = preview(subject);
  if (p.mapping.status !== "mapped") throw new Error("fixture");
  p.mapping.page.id = id;
  p.mapping.page.frames = [{ id: "cut-a", bounds: { x: 100, y: subject === base ? 100 : 500, width: subject === base ? 400 : 200, height: 200 } },
    { id: subject === base ? "only-a" : "only-b", bounds: { x: 50, y: 50, width: 100, height: 100 } }];
  p.mapping.page.elements = p.mapping.page.frames.map((cut) => ({ id: cut.id, type: "frame", origin: "page" }));
  return p;
}
async function openCuts() {
  await openComparison(); await choose();
  fireEvent.click(screen.getByRole("button", { name: "컷 단위로 비교" }));
  fireEvent.change(screen.getByRole("combobox", { name: "비교할 원본 컷" }), { target: { value: "cut-a" } });
}
describe("source-cut comparison in the actual pinned workbench", () => {
  beforeEach(() => { f.read.mockImplementation(async (subject) => ready(subject, [sourceCutPreview(subject)])); });
  it("opens only on request, uses each cut's geometry and issues no new metadata request", async () => {
    mount(); await openComparison(); await choose();
    expect(screen.queryByRole("combobox", { name: "비교할 원본 컷" })).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "컷 단위로 비교" }));
    fireEvent.change(screen.getByRole("combobox", { name: "비교할 원본 컷" }), { target: { value: "cut-a" } });
    const a = screen.getByRole("img", { name: "기준본 컷 영역" }), b = screen.getByRole("img", { name: "비교본 컷 영역" });
    expect(a.closest("div")?.style.width).toBe("200%");
    expect(b.closest("div")?.style.width).toBe("400%");
    expect(a.closest("div")?.style.top).toBe("-50%");
    expect(b.closest("div")?.style.top).toBe("-250%");
    expect(screen.getAllByRole("img").every((image) => image.getAttribute("referrerpolicy") === "no-referrer")).toBe(true);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /승인/u })).toBeNull();
  });
  it("does not retain a previous target crop for a missing or different-page cut", async () => {
    mount(); await openCuts();
    fireEvent.change(screen.getByRole("combobox", { name: "비교할 원본 컷" }), { target: { value: "only-a" } });
    expect(screen.queryByRole("img", { name: "비교본 컷 영역" })).toBeNull();
    expect(screen.getByText(/삭제 여부는 단정하지 않습니다/u)).toBeTruthy();
    expect(screen.getByRole("img", { name: "기준본 컷 영역" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "컷을 고를 검수본" }), { target: { value: "right" } });
    expect(screen.queryByRole("img", { name: "기준본 컷 영역" })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "비교할 원본 컷" }), { target: { value: "only-b" } });
    expect(screen.getByRole("img", { name: "비교본 컷 영역" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "기준본 컷 영역" })).toBeNull();
  });
  it("refuses matching cut IDs on unrelated selected pages", async () => {
    f.read.mockImplementation(async (subject) => ready(subject, [sourceCutPreview(subject, subject === base ? "one" : "two")]));
    mount(); await openCuts();
    expect(screen.queryByRole("img", { name: "비교본 컷 영역" })).toBeNull();
    expect(screen.getByText(/원본 페이지가 다릅니다/u)).toBeTruthy();
  });
  it("keeps the selected ID through URL-only renewal but clears it for a different source", async () => {
    mount(); await openCuts();
    f.read.mockImplementation(async (subject) => ready(subject, [{ ...sourceCutPreview(subject), url: `${preview(subject).url}?renewed=1` }]));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.getByRole("combobox", { name: "비교할 원본 컷" })).toHaveProperty("value", "cut-a");
    f.read.mockImplementation(async (subject) => ready(subject, [sourceCutPreview(subject, subject === base ? "new-source" : "page-0")]));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.queryByRole("img", { name: "기준본 컷 영역" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "비교할 원본 컷" })).toBeNull();
  });
  it("shows image failure outside the clipped area and clears it after loading", async () => {
    mount(); await openCuts();
    const image = screen.getByRole("img", { name: "비교본 컷 영역" });
    fireEvent.error(image);
    expect(screen.getByText("비교본 컷 영역 이미지를 불러오지 못했습니다. 미리보기를 다시 확인하세요.")).toBeTruthy();
    fireEvent.load(image);
    expect(screen.queryByText("비교본 컷 영역 이미지를 불러오지 못했습니다. 미리보기를 다시 확인하세요.")).toBeNull();
  });
  it("removes both crops along with full previews when permission is revoked", async () => {
    const revoked = vi.fn(); mount(revoked); await openCuts();
    expect(screen.getAllByRole("img")).toHaveLength(4);
    f.read.mockImplementation(async (subject) => subject === prior ? { ok: false, reason: "access-denied" } : ready(base, [sourceCutPreview(base)]));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(revoked).toHaveBeenCalledOnce(); expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByRole("combobox", { name: "비교할 원본 컷" })).toBeNull();
  });
  it("clears crops on actor change and restores the closed form", async () => {
    const view = mount(); await openCuts();
    f.actor = "actor-b"; persistSession({ user: { id: f.actor }, token: null });
    view.rerender(<StudioPinnedReviewComparison subject={base} title="현재 검수본" onRevoked={vi.fn()} />);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryByRole("combobox", { name: "비교할 원본 컷" })).toBeNull();
  });
  it("clears selection on search and makes large source-ID lists bounded and searchable", async () => {
    f.read.mockImplementation(async (subject) => {
      const p = sourceCutPreview(subject);
      if (p.mapping.status !== "mapped") throw new Error("fixture");
      p.mapping.page.frames = Array.from({ length: 251 }, (_, i) => ({ id: `cut-${String(i).padStart(3, "0")}`, bounds: { x: 0, y: 0, width: 100, height: 100 } }));
      return ready(subject, [p]);
    });
    mount(); await openComparison(); await choose();
    fireEvent.click(screen.getByRole("button", { name: "컷 단위로 비교" }));
    const selector = screen.getByRole("combobox", { name: "비교할 원본 컷" });
    expect(within(selector).getAllByRole("option")).toHaveLength(101);
    fireEvent.click(screen.getByRole("button", { name: "다음 컷 목록" }));
    expect(within(selector).getByRole("option", { name: "101번째 컷 · cut-100" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "원본 컷 ID 검색" }), { target: { value: "cut-250" } });
    expect(within(selector).getAllByRole("option")).toHaveLength(2);
    fireEvent.change(selector, { target: { value: "cut-250" } });
    expect(screen.getByRole("img", { name: "비교본 컷 영역" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "원본 컷 ID 검색" }), { target: { value: "absent" } });
    expect(screen.queryByRole("img", { name: "비교본 컷 영역" })).toBeNull();
  });
});
