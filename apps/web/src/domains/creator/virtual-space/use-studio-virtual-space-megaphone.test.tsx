// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStudioVirtualSpaceMegaphone } from "./use-studio-virtual-space-megaphone";

function makeMedia() {
  return {
    startScreenShare: vi.fn(async () => undefined),
    stopScreenShare: vi.fn(),
  };
}

describe("useStudioVirtualSpaceMegaphone", () => {
  it("권한이 없으면 방송이 실패한다", async () => {
    const { result } = renderHook(() => useStudioVirtualSpaceMegaphone({
      role: "viewer", broadcasterName: "게스트",
    }));
    expect(result.current.canBroadcast).toBe(false);
    await act(async () => { await result.current.start("room"); });
    expect(result.current.snapshot.status).toBe("failed");
  });

  it("owner는 방송을 시작·자막·종료할 수 있다", async () => {
    const { result } = renderHook(() => useStudioVirtualSpaceMegaphone({
      role: "owner", broadcasterName: "김선생",
    }));
    expect(result.current.canBroadcast).toBe(true);
    await act(async () => { await result.current.start("world"); });
    expect(result.current.snapshot.status).toBe("broadcasting");
    expect(result.current.snapshot.scope).toBe("world");
    act(() => { result.current.pushCaption("시작합니다"); });
    expect(result.current.snapshot.captions).toHaveLength(1);
    act(() => { result.current.stop(); });
    expect(result.current.snapshot.status).toBe("idle");
  });

  it("shareScreen이면 화면 공유를 함께 시작·종료한다", async () => {
    const media = makeMedia();
    const { result } = renderHook(() => useStudioVirtualSpaceMegaphone({
      role: "admin", broadcasterName: "관리자", media,
    }));
    await act(async () => { await result.current.start("room", { shareScreen: true, bandwidth: "low" }); });
    expect(media.startScreenShare).toHaveBeenCalledWith({ scope: "broadcast", bandwidth: "low" });
    expect(result.current.snapshot.sharingScreen).toBe(true);
    act(() => { result.current.stop(); });
    expect(media.stopScreenShare).toHaveBeenCalled();
    expect(result.current.snapshot.status).toBe("idle");
  });

  it("화면 공유 실패 시 방송을 시작하지 않는다", async () => {
    const media = makeMedia();
    media.startScreenShare.mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useStudioVirtualSpaceMegaphone({
      role: "admin", broadcasterName: "관리자", media,
    }));
    await act(async () => { await result.current.start("room", { shareScreen: true }); });
    expect(result.current.snapshot.status).toBe("failed");
    expect(result.current.snapshot.error).toBe("denied");
  });
});
