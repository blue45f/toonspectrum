// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBrushOriginalSourceActions } from "./StudioBrushOriginalSourceActions";
import { createStudioBrushOriginalSource, type StudioBrushOriginalSource } from "./studio-brush-original-source";

const calls = vi.hoisted(() => ({ hydrate: vi.fn(), download: vi.fn() }));
vi.mock("./studio-brush-original-source-store", () => ({ hydrateStudioBrushOriginal: calls.hydrate }));
vi.mock("../export/studio-export", () => ({ downloadBlob: calls.download }));
afterEach(() => { cleanup(); calls.hydrate.mockReset(); calls.download.mockReset(); });
const source = (value = 1) => createStudioBrushOriginalSource(new Uint8Array([value, 2, 3]), `original-${value}.myb`, "myb");
function deferred() {
  let resolve!: (value: StudioBrushOriginalSource) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<StudioBrushOriginalSource>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function begin() {
  const pending = deferred(); calls.hydrate.mockReturnValueOnce(pending.promise);
  const original = source(); const onError = vi.fn();
  const view = render(<StudioBrushOriginalSourceActions source={original} name="원본" onError={onError} />);
  fireEvent.click(screen.getByRole("button", { name: "원본 원본 파일 내보내기" }));
  await waitFor(() => expect(calls.hydrate).toHaveBeenCalledTimes(1));
  return { pending, original, onError, ...view };
}
describe("original download never outlives the user's selection", () => {
  it("keeps an identical original active through a catalogue refresh", async () => {
    const f = await begin();
    f.rerender(<StudioBrushOriginalSourceActions source={{ ...f.original }} name="다시 불러온 원본" onError={f.onError} />);
    expect((screen.getByRole("button", { name: "다시 불러온 원본 원본 파일 내보내기" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { f.pending.resolve(f.original); await f.pending.promise; });
    expect(calls.download).toHaveBeenCalledTimes(1);
  });
  it("does not download after its panel unmounts", async () => {
    const f = await begin(); f.unmount();
    await act(async () => { f.pending.resolve(f.original); await f.pending.promise; });
    expect(calls.download).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled();
  });
  it("does not report a stale storage failure after unmount", async () => {
    const f = await begin(); f.unmount();
    await act(async () => { f.pending.reject(new Error("late storage failure")); await f.pending.promise.catch(() => undefined); });
    expect(f.onError).not.toHaveBeenCalled();
  });
  it("cancels a pending download without turning its late result into a file", async () => {
    const f = await begin();
    fireEvent.click(screen.getByRole("button", { name: "원본 파일 내보내기 취소" }));
    expect((screen.getByRole("button", { name: "원본 원본 파일 내보내기" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { f.pending.resolve(f.original); await f.pending.promise; });
    expect(calls.download).not.toHaveBeenCalled(); expect(f.onError).not.toHaveBeenCalled();
  });
  it("allows a new source while ignoring completion of the previous source", async () => {
    const f = await begin(); const next = source(9); const fresh = deferred();
    calls.hydrate.mockReturnValueOnce(fresh.promise);
    f.rerender(<StudioBrushOriginalSourceActions source={next} name="새 원본" onError={f.onError} />);
    expect((screen.getByRole("button", { name: "새 원본 원본 파일 내보내기" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "새 원본 원본 파일 내보내기" }));
    await waitFor(() => expect(calls.hydrate).toHaveBeenCalledTimes(2));
    await act(async () => { f.pending.resolve(f.original); await f.pending.promise; });
    expect(calls.download).not.toHaveBeenCalled();
    await act(async () => { fresh.resolve(next); await fresh.promise; });
    expect(calls.download).toHaveBeenCalledTimes(1); expect(calls.download.mock.calls[0]![1]).toBe("original-9.myb");
  });
  it("allows retry after cancellation without a stale finally clearing the new attempt", async () => {
    const f = await begin();
    fireEvent.click(screen.getByRole("button", { name: "원본 파일 내보내기 취소" }));
    const retry = deferred(); calls.hydrate.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole("button", { name: "원본 원본 파일 내보내기" }));
    await waitFor(() => expect(calls.hydrate).toHaveBeenCalledTimes(2));
    await act(async () => { f.pending.reject(new Error("old failure")); await f.pending.promise.catch(() => undefined); });
    expect((screen.getByRole("button", { name: "원본 원본 파일 내보내기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(f.onError).not.toHaveBeenCalled();
    await act(async () => { retry.resolve(f.original); await retry.promise; });
    expect(calls.download).toHaveBeenCalledTimes(1);
  });
});
