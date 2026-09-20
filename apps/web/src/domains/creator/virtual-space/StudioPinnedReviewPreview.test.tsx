// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { deriveStudioReviewPageMapping } from "@toonspectrum/studio-project-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioPinnedReviewPreview } from "./StudioPinnedReviewPreview";
import type { StudioVirtualSpaceReviewPreviews } from "./studio-virtual-space-review-preview";
import type { StudioReviewAnnotationSelection } from "./StudioReviewSpatialAnnotation";

const f = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./studio-virtual-space-review-preview", () => ({ getStudioVirtualSpaceReviewPreview: f.read }));
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
function ready(token = "one"): StudioVirtualSpaceReviewPreviews {
  return { ok: true, subject, nextCursor: null, previews: [{ sha256: "b".repeat(64), ordinal: 0,
    byteLength: 100, mediaType: "image/png", url: `https://preview.example/object?token=${token}`, expiresAt: Date.now() + 30_000,
    mapping: { status: "unmapped", reason: "legacy-review" } }] };
}
beforeEach(() => { vi.useFakeTimers(); f.read.mockReset().mockImplementation(async () => ready()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function mount(onRevoked = vi.fn()) {
  let mounted!: ReturnType<typeof render>;
  await act(async () => { mounted = render(<StudioPinnedReviewPreview subject={subject} onRevoked={onRevoked} />); });
  return mounted;
}
describe("Pinned preview visibility lease", () => {
  it("keeps a selected source through a fresh lease but removes it if the next lease expires", async () => {
    const onSelect = vi.fn();
    const mapped = (): StudioVirtualSpaceReviewPreviews => {
      const value = ready();
      if (!value.ok) throw new Error("missing preview fixture");
      return { ...value, previews: [{ ...value.previews[0]!, mapping: deriveStudioReviewPageMapping({ width: 800,
        pagesList: [{ id: "page", canvasH: 1200, elements: [] }] }, { sourceServerRevision: 7, sourceContentDigest: subject.rootGraphHash,
        ordinal: 0, renderWidth: 1600, renderHeight: 2400 }) }] };
    };
    f.read.mockImplementation(async () => mapped());
    function Harness() {
      const [selected, setSelected] = useState<StudioReviewAnnotationSelection | null>(null);
      return <StudioPinnedReviewPreview subject={subject} onRevoked={vi.fn()} annotation={{ selected, disabled: false,
        onSelect: (value) => { onSelect(value); setSelected(value); } }} />;
    }
    await act(async () => { render(<Harness />); });
    fireEvent.click(screen.getByRole("button", { name: "이 위치에 의견 연결" }));
    const original = onSelect.mock.lastCall?.[0];
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(onSelect.mock.lastCall?.[0].anchor).toEqual(original.anchor);
    expect(onSelect.mock.lastCall?.[0].expiresAt).toBeGreaterThan(original.expiresAt);
    f.read.mockImplementationOnce(() => new Promise(() => undefined));
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(screen.queryByRole("img")).toBeNull(); expect(onSelect.mock.lastCall?.[0]).toBeNull();
  });
  it("renews authority while retaining decoded immutable pixels, and removes images on revocation", async () => {
    const revoked = vi.fn(); await mount(revoked);
    const image = screen.getByRole("img");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.load(image);
    f.read.mockImplementationOnce(async () => ready("renewed"));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img").getAttribute("src")).toContain("token=one");
    f.read.mockResolvedValueOnce({ ok: false, reason: "access-denied" });
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(revoked).toHaveBeenCalledOnce();
  });
  it("expires private images while renewal is stalled and never automatically retries a failed read", async () => {
    await mount();
    let resolve!: (value: StudioVirtualSpaceReviewPreviews) => void;
    f.read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { vi.advanceTimersByTime(25_000); });
    expect(screen.queryByRole("img")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => { resolve({ ok: false, reason: "preview-unavailable" }); vi.advanceTimersByTime(60_000); });
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "미리보기 다시 확인" })).not.toBeNull();
  });
  it("hides images immediately on background and discards a late read after unmount", async () => {
    const revoked = vi.fn(); const mounted = await mount(revoked);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    await act(async () => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(f.read).toHaveBeenCalledOnce();
    let resolve!: (value: StudioVirtualSpaceReviewPreviews) => void;
    f.read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    mounted.unmount();
    await act(async () => { resolve({ ok: false, reason: "access-denied" }); });
    expect(revoked).not.toHaveBeenCalled();
  });
});
