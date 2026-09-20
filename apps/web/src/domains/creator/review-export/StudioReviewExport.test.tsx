// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/compat/auth-session-state";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import { StudioReviewExport } from "./StudioReviewExport";

const f = vi.hoisted(() => ({ prepare: vi.fn(), download: vi.fn() }));
vi.mock("./studio-review-export", () => ({ prepareStudioReviewExport: f.prepare, StudioReviewExportError: class extends Error {} }));
vi.mock("../export/studio-export", () => ({ downloadBlob: f.download }));
const approved = () => { const value = reviewProductionFixture().verified; return { ...value, review: { ...value.review, status: "approved" as const } }; };
beforeEach(() => { f.prepare.mockReset(); f.download.mockReset(); persistSession({ user: { id: "actor" }, token: null }); });
afterEach(() => { cleanup(); persistSession(null); });
describe("approved review export action", () => {
  it("starts only on an explicit click and requests exactly one original ZIP download", async () => {
    const blob = new Blob(["zip"]); f.prepare.mockResolvedValue({ blob, fileName: "approved.zip" });
    render(<StudioReviewExport verified={approved()} />); expect(f.prepare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }));
    await screen.findByText("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.");
    expect(f.prepare.mock.calls[0]![0]).toEqual(approved().subject);
    expect(f.download).toHaveBeenCalledExactlyOnceWith(blob, "approved.zip");
  });
  it("does not offer a download for a review awaiting a decision", () => {
    render(<StudioReviewExport verified={reviewProductionFixture().verified} />);
    expect(screen.queryByRole("button")).toBeNull(); expect(f.prepare).not.toHaveBeenCalled();
  });
  it.each(["cancel", "account", "renew", "unmount"])("drops a late archive after %s without another request", async (action) => {
    let resolve!: (value: unknown) => void;
    f.prepare.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<StudioReviewExport verified={approved()} />);
    fireEvent.click(screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
    const options = f.prepare.mock.calls[0]![1];
    if (action === "cancel") fireEvent.click(screen.getByRole("button", { name: "취소" }));
    else if (action === "unmount") view.unmount();
    else act(() => persistSession({ user: { id: action === "account" ? "other" : "actor" }, token: null }));
    expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false);
    await act(async () => { resolve({ blob: new Blob(["stale"]), fileName: "stale.zip" }); });
    expect(f.download).not.toHaveBeenCalled(); expect(f.prepare).toHaveBeenCalledOnce();
  });
  it("explains a failed preparation and allows an explicit new attempt", async () => {
    f.prepare.mockRejectedValueOnce(new Error("private server detail"));
    render(<StudioReviewExport verified={approved()} />);
    fireEvent.click(screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }));
    await screen.findByText("현재 승인과 접근 권한을 확인하지 못했어요. 검토 기록을 새로 확인한 뒤 다시 시도해 주세요.");
    expect(screen.queryByText("private server detail")).toBeNull(); expect(f.download).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
