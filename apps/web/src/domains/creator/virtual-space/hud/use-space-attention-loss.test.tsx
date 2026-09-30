// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpaceAttentionLoss } from "./use-space-attention-loss";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("useSpaceAttentionLoss", () => {
  it("창 초점을 잃거나 탭이 숨겨질 때만 알리고, 다시 보일 때는 알리지 않는다", () => {
    const onLoss = vi.fn();
    const view = renderHook(() => useSpaceAttentionLoss(onLoss));
    fireEvent.blur(window);
    expect(onLoss).toHaveBeenCalledTimes(1);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(onLoss).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(onLoss).toHaveBeenCalledTimes(2);
    fireEvent.focus(window);
    expect(onLoss).toHaveBeenCalledTimes(2);
    view.unmount();
    fireEvent.blur(window);
    expect(onLoss).toHaveBeenCalledTimes(2);
  });

  it("다시 렌더링되면 최신 콜백을 부른다", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = renderHook(({ callback }) => useSpaceAttentionLoss(callback), { initialProps: { callback: first } });
    view.rerender({ callback: second });
    fireEvent.blur(window);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
