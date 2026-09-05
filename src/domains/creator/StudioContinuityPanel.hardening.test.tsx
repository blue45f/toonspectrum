// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadStudioQualityReviewState } from "./quality-review-store";
import { inspectStudioQuality } from "./studio-quality-inspection";
import { StudioContinuityPanel } from "./StudioContinuityPanel";

import type { PageState } from "./studio-page-state";


const reviewDb = vi.hoisted(() => ({ rows: new Map<string, string>(), get: vi.fn(), set: vi.fn(), asAsyncKeyValueStore: vi.fn(), acquire: vi.fn() }));
vi.mock("./studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: reviewDb.acquire }));
function resetReviewDatabase() {
  reviewDb.rows.clear();
  reviewDb.get.mockReset().mockImplementation(async (key: string) => reviewDb.rows.get(key) ?? null);
  reviewDb.set.mockReset().mockImplementation(async (key: string, value: string) => { reviewDb.rows.set(key, value); });
  reviewDb.asAsyncKeyValueStore.mockReset().mockReturnValue(reviewDb);
  reviewDb.acquire.mockReset().mockResolvedValue(reviewDb);
}

const raster = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock("./studio-quality-raster-inspection", () => ({ inspectStudioRasterAssets: raster.inspect }));
const emptyIssues: [] = [];
const manualIds = ["mobile", "zoom", "scroll", "color", "rights", "destination"];
function page(): PageState {
  return { id: "page", canvasH: 600, bg: "#fff", bgGrad: null,
    review: { status: "approved", locked: true },
    elements: [{ id: "frame", type: "frame", x: 10, y: 10, width: 700, height: 550 }] };
}
function manualCheckbox(): HTMLInputElement {
  return screen.getByRole("checkbox", { name: /모바일 독자 폭/u }) as HTMLInputElement;
}
function seed(key: string, pages: PageState[], extra: Record<string, unknown> = {}): void {
  const report = inspectStudioQuality({ pages });
  reviewDb.rows.set(`toonstudio:quality-inspection:v2:${encodeURIComponent(key)}`, JSON.stringify({
    manualRevisionKey: report.revisionKey, manualCheckIds: manualIds,
    acknowledgedIssueIds: report.issues.map((issue) => issue.id), ...extra,
  }));
}
beforeEach(() => {
  resetReviewDatabase();
  localStorage.clear();
  raster.inspect.mockReset();
  raster.inspect.mockResolvedValue({ status: "complete", issues: [], assetReferenceCount: 0,
    probedSourceCount: 0, skippedSourceCount: 0 });
});
afterEach(async () => {
  cleanup();
  // A read started by a React effect is not part of the store's writeTail.
  // Keep this file's module mocks alive until those lazy imports and their
  // continuations finish; a sentinel read alone only drains queued writes.
  await act(async () => {
    await vi.dynamicImportSettled();
    await loadStudioQualityReviewState("__test_flush__");
    await vi.dynamicImportSettled();
  });
  vi.restoreAllMocks();
});

describe("quality center review ownership", () => {
  it("supports omitted pages without repeated raster effects and rescans explicitly", async () => {
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} />);
    await waitFor(() => expect(raster.inspect).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "다시 검사" }));
    await waitFor(() => expect(raster.inspect).toHaveBeenCalledTimes(2));
    expect(screen.getByText("검사할 페이지 없음")).not.toBeNull();
  });

  it("does not persist anonymous draft decisions", async () => {
    const pages = [page()];
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} />);
    fireEvent.click(manualCheckbox());
    expect(manualCheckbox().checked).toBe(true);
    expect(localStorage.length).toBe(0);
    expect(reviewDb.set).not.toHaveBeenCalled();
    view.unmount();
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} />);
    expect(manualCheckbox().checked).toBe(false);
  });

  it("does not reuse same-content receipts across document identities", async () => {
    const pages = [page()];
    seed("owner-A", pages);
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="owner-A" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    view.rerender(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="owner-B" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    expect(manualCheckbox().checked).toBe(false);
  });

  it("invalidates both acknowledgements and manual checks after edits", async () => {
    const pages = [{ ...page(), review: { status: "draft" as const, locked: false } }];
    seed("revision", pages);
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="revision" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    expect(screen.queryByText("페이지 승인 대기")).toBeNull();
    const edited = [{ ...pages[0]!, note: "새 검토가 필요한 변경" }];
    view.rerender(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={edited} documentKey="revision" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.getByText("페이지 승인 대기")).not.toBeNull();
  });

  it("rejects malformed stored arrays without crashing", async () => {
    const pages = [page()];
    seed("malformed", pages, { acknowledgedIssueIds: {}, manualCheckIds: "mobile" });
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="malformed" />);
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    expect(manualCheckbox().checked).toBe(false);
    expect(screen.getByText(/현재 탭에만 보관됩니다/u)).toBeTruthy();
  });

  it("keeps long document keys distinct", async () => {
    const pages = [page()];
    const prefix = "scope".repeat(50);
    seed(`${prefix}A`, pages);
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey={`${prefix}B`} />);
    expect(manualCheckbox().checked).toBe(false);
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    expect(manualCheckbox().checked).toBe(false);
  });

  it("settles lazy reads after repeated unmounts without writing or opening a real Worker", async () => {
    const pages = [page()];
    for (let index = 0; index < 20; index += 1) {
      const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey={`unmounted-${index}`} />);
      view.unmount();
    }
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(reviewDb.acquire).toHaveBeenCalledTimes(20);
    expect(reviewDb.get).toHaveBeenCalledTimes(20);
    for (let index = 0; index < 20; index += 1) {
      expect(reviewDb.get).toHaveBeenCalledWith(`toonstudio:quality-inspection:v2:unmounted-${index}`);
    }
    expect(reviewDb.set).not.toHaveBeenCalled();
    expect(reviewDb.rows.size).toBe(0);
  });

  it("does not promote an unavailable raster scan to ready", async () => {
    const p = page();
    p.elements.push({ id: "image", type: "image", src: "/asset.png", x: 20, y: 20,
      width: 300, height: 200, rotation: 0 });
    const pages = [p];
    seed("raster-unavailable", pages);
    raster.inspect.mockResolvedValue({ status: "unavailable", issues: [], assetReferenceCount: 1,
      probedSourceCount: 0, skippedSourceCount: 0 });
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="raster-unavailable" />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
    expect(screen.getByText(/이 환경에서는 이미지 원본 해상도 검사를 실행할 수 없습니다/u)).not.toBeNull();
  });
});


describe("quality review SQLite failure and completion feedback", () => {
  it("saves authored checks through SQLite and restores the same revision on remount", async () => {
    const pages = [page()];
    const props = { open: true, onClose: vi.fn(), issues: emptyIssues, pages, documentKey: "roundtrip" };
    const view = render(<StudioContinuityPanel {...props} />);
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    fireEvent.click(manualCheckbox());
    await waitFor(() => expect(JSON.parse(reviewDb.rows.get("toonstudio:quality-inspection:v2:roundtrip") ?? "{}").manualCheckIds).toContain("mobile"));
    view.unmount();
    render(<StudioContinuityPanel {...props} />);
    await waitFor(() => expect(manualCheckbox().checked).toBe(true));
    expect(localStorage.length).toBe(0);
  });
  it("waits for a durable write and retains edits honestly when that write fails", async () => {
    reviewDb.set.mockRejectedValue(new Error("quota"));
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={[page()]} documentKey="quota" />);
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    fireEvent.click(manualCheckbox());
    await waitFor(() => expect(screen.getByText(/현재 탭에만 보관됩니다/u)).toBeTruthy());
    expect(manualCheckbox().checked).toBe(true);
    expect(reviewDb.asAsyncKeyValueStore).toHaveBeenCalledWith("studio-quality-review-v2");
    expect(localStorage.length).toBe(0);
  });
  it("never overwrites a corrupt row with an empty or demo receipt", async () => {
    const key = "toonstudio:quality-inspection:v2:corrupt";
    reviewDb.rows.set(key, "{broken");
    render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={[page()]} documentKey="corrupt" />);
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    fireEvent.click(manualCheckbox());
    expect(manualCheckbox().checked).toBe(true);
    expect(reviewDb.rows.get(key)).toBe("{broken");
    expect(reviewDb.set).not.toHaveBeenCalled();
    expect(screen.getByText(/현재 탭에만 보관됩니다/u)).toBeTruthy();
  });
  it("does not apply a late old-document read to the new document", async () => {
    let finish!: (value: string) => void;
    reviewDb.get.mockImplementationOnce(() => new Promise<string>((resolveRead) => { finish = resolveRead; }));
    const pages = [page()];
    const view = render(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="first" />);
    await waitFor(() => expect(reviewDb.get).toHaveBeenCalled());
    expect(manualCheckbox().disabled).toBe(true);
    view.rerender(<StudioContinuityPanel open onClose={vi.fn()} issues={emptyIssues} pages={pages} documentKey="second" />);
    await waitFor(() => expect(manualCheckbox().disabled).toBe(false));
    await act(async () => finish(JSON.stringify({ manualRevisionKey: inspectStudioQuality({ pages }).revisionKey, manualCheckIds: manualIds })));
    await waitFor(() => expect(manualCheckbox().checked).toBe(false));
    expect(screen.queryByText("마감 준비 완료")).toBeNull();
  });
});
