// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioOnDemandModule } from "./useStudioOnDemandModule";
import { StudioOnDemandModuleStatus } from "./StudioOnDemandModuleStatus";

afterEach(cleanup);
describe("optional UI module loading", () => {
  it("does not request code before intent and preserves the loaded identity across close/reopen", async () => {
    const module = { ready: true }, load = vi.fn(async () => module);
    const view = renderHook(({ open }) => useStudioOnDemandModule(load, open), { initialProps: { open: false } });
    expect(load).not.toHaveBeenCalled();
    view.rerender({ open: true });
    await waitFor(() => expect(view.result.current.module).toBe(module));
    view.rerender({ open: false }); view.rerender({ open: true });
    expect(view.result.current.module).toBe(module); expect(load).toHaveBeenCalledTimes(1);
  });
  it("ignores late loading results after closing and only retries on another explicit opening", async () => {
    let resolve!: (value: { ready: boolean }) => void;
    const promise = new Promise<{ ready: boolean }>((done) => { resolve = done; });
    const load = vi.fn(() => promise);
    const view = renderHook(({ open }) => useStudioOnDemandModule(load, open), { initialProps: { open: true } });
    await act(async () => {}); view.rerender({ open: false });
    await act(async () => { resolve({ ready: true }); });
    expect(view.result.current.module).toBeNull();
    view.rerender({ open: true });
    await waitFor(() => expect(view.result.current.module).toEqual({ ready: true }));
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("reports a failed import and retries without reloading the document", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ready: true });
    const view = renderHook(() => useStudioOnDemandModule(load, true));
    await waitFor(() => expect(view.result.current.failed).toBe(true));
    expect(view.result.current.module).toBeNull();
    act(() => { view.result.current.retry(); });
    await waitFor(() => expect(view.result.current.module).toEqual({ ready: true }));
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("keeps Escape/cancel and explicit retry available while an optional chunk is unavailable", () => {
    const onCancel = vi.fn(), onRetry = vi.fn();
    const view = render(<StudioOnDemandModuleStatus failed onCancel={onCancel} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" }); expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "열기 취소" })); expect(onCancel).toHaveBeenCalledTimes(2);
    view.unmount(); fireEvent.keyDown(window, { key: "Escape" }); expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
