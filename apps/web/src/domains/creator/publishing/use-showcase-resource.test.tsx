// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useShowcaseResource } from "./use-showcase-resource";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("useShowcaseResource", () => {
  it("요청 키가 없으면 요청하지 않고 idle 상태를 유지한다", () => {
    const load = vi.fn(() => Promise.resolve([1]));
    const { result } = renderHook(() => useShowcaseResource(null, load, "실패"));
    expect(result.current.status).toBe("idle");
    expect(load).not.toHaveBeenCalled();
  });

  it("로딩 후 데이터를 돌려준다", async () => {
    const { result } = renderHook(() => useShowcaseResource("k", () => Promise.resolve(["a"]), "실패"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual(["a"]);
  });

  it("실패하면 사용자용 메시지를 보여 주고 재시도로 다시 요청한다", async () => {
    const load = vi
      .fn<(signal: AbortSignal) => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("일시적으로 사용할 수 없습니다."))
      .mockRejectedValueOnce("unknown")
      .mockResolvedValueOnce(["ok"]);
    const { result } = renderHook(() => useShowcaseResource("k", load, "기본 실패 문구"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("일시적으로 사용할 수 없습니다.");

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("기본 실패 문구"));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual(["ok"]);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("키가 바뀌면 이전 요청을 취소하고 늦게 온 응답으로 덮어쓰지 않는다", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? first.promise : second.promise;
    });
    const { result, rerender } = renderHook(({ requestKey }) => useShowcaseResource(requestKey, load, "실패"), {
      initialProps: { requestKey: "a" },
    });
    rerender({ requestKey: "b" });
    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      second.resolve("b-data");
      first.resolve("a-data");
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe("b-data");
  });
});
