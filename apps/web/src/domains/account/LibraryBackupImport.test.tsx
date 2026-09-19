// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import { LibraryBackupImport } from "./LibraryBackupImport";

const backup = { _app: "toonspectrum-library", version: 1, ratings: { work: 4.5 }, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [] };
function file(data: unknown): File {
  const text = JSON.stringify(data);
  const result = new File([text], "library.json", { type: "application/json" });
  Object.defineProperty(result, "text", { value: async () => text });
  return result;
}
afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("deliberate library restore", () => {
  it("does not mutate records on selection or cancellation; requires explicit replacement", async () => {
    const restore = vi.fn();
    render(<LibraryBackupImport onRestore={restore} locale="ko" ownerId={null} />);
    const input = screen.getByLabelText("서재 백업 파일");
    fireEvent.change(input, { target: { files: [file(backup)] } });
    await screen.findByRole("region", { name: "백업 복원 미리보기" });
    expect(restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "백업 가져오기" }));
    fireEvent.change(input, { target: { files: [file(backup)] } });
    await screen.findByRole("region", { name: "백업 복원 미리보기" });
    fireEvent.click(screen.getByRole("button", { name: "기존 기록 교체 확인" }));
    expect(restore).toHaveBeenCalledOnce();
    expect(restore.mock.calls[0][0].ratings).toEqual({ work: 4.5 });
    expect(screen.getByRole("status").textContent).toContain("복원했습니다");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "백업 가져오기" }));
  });
  it("rejects unrelated JSON without treating it as an empty library", async () => {
    const restore = vi.fn();
    render(<LibraryBackupImport onRestore={restore} locale="ko" ownerId={null} />);
    fireEvent.change(screen.getByLabelText("서재 백업 파일"), { target: { files: [file({})] } });
    await screen.findByRole("alert");
    expect(restore).not.toHaveBeenCalled();
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("discards a pending preview on account changes", async () => {
    const restore = vi.fn();
    useI18n.getState().setLang("en");
    const view = render(<LibraryBackupImport onRestore={restore} locale="en" ownerId="first" />);
    fireEvent.change(screen.getByLabelText("Library backup file"), { target: { files: [file(backup)] } });
    await screen.findByRole("region");
    view.rerender(<LibraryBackupImport onRestore={restore} locale="en" ownerId="second" />);
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(restore).not.toHaveBeenCalled();
  });
});
