import ky from "ky";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creatorWorkReadOptions } from "./creator-work-read-options";

const url = "https://studio.test/api/creator/works/one";
const jsonResponse = () => new Response('{"title":"retained manuscript"}', {
  headers: { "Content-Type": "application/json" },
});

afterEach(() => vi.restoreAllMocks());

function readOptions(signal?: AbortSignal) {
  const options = creatorWorkReadOptions(signal);
  // Preserve the production status/method/attempt policy, but avoid waiting between test attempts.
  return { ...options, retry: { ...options.retry as object, delay: () => 0, jitter: false } };
}

describe("bounded manuscript GET recovery", () => {
  it("recovers a transient 503 and keeps the original snapshot", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse());
    await expect(ky.get(url, { ...readOptions(), fetch }).json()).resolves.toEqual({
      title: "retained manuscript",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("recovers a network failure without enabling mutation retries", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse());
    await expect(ky.get(url, { ...readOptions(), fetch }).json()).resolves.toHaveProperty("title");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockImplementation(async () => new Response("busy", { status: 503 }));
    await expect(ky.patch(url, { ...readOptions(), fetch })).rejects.toHaveProperty("response.status", 503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404, 409, 422])("does not retry HTTP %i", async (status) => {
    const fetch = vi.fn(async () => new Response("denied", { status }));
    await expect(ky.get(url, { ...readOptions(), fetch })).rejects.toHaveProperty("response.status", status);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("exhausts at three attempts rather than keeping the editor spinning forever", async () => {
    const fetch = vi.fn(async () => new Response("busy", { status: 502 }));
    await expect(ky.get(url, { ...readOptions(), fetch })).rejects.toHaveProperty("response.status", 502);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries response-header timeouts, with finite per-attempt and total budgets", async () => {
    const options = creatorWorkReadOptions();
    expect(options.timeout).toBe(15_000);
    expect(options.retry).toMatchObject({ limit: 2, retryOnTimeout: true });
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    await expect(ky.get(url, { ...readOptions(), timeout: 5, fetch })).rejects.toHaveProperty("name", "TimeoutError");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("propagates route cancellation through the combined deadline signal", async () => {
    const controller = new AbortController();
    const options = creatorWorkReadOptions(controller.signal);
    expect(options.signal?.aborted).toBe(false);
    controller.abort();
    expect(options.signal?.aborted).toBe(true);
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const request = input instanceof Request ? input : new Request(input);
      request.signal.throwIfAborted();
      return jsonResponse();
    });
    await expect(ky.get(url, { ...options, fetch })).rejects.toHaveProperty("name", "AbortError");
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request instanceof Request && request.signal.aborted).toBe(true);
  });

  it("bounds even the body read and preserves the deadline when a caller also supplies a signal", () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const caller = new AbortController();
    const options = creatorWorkReadOptions(caller.signal);
    expect(timeout).toHaveBeenCalledWith(45_000);
    deadline.abort(new DOMException("Read deadline exceeded", "TimeoutError"));
    expect(options.signal?.aborted).toBe(true);
    expect(options.signal?.reason.name).toBe("TimeoutError");
    expect(caller.signal.aborted).toBe(false);
  });

  it("does not reinterpret malformed JSON as an empty manuscript or retry it", async () => {
    const fetch = vi.fn(async () => new Response("not JSON"));
    await expect(ky.get(url, { ...readOptions(), fetch }).json()).rejects.toBeInstanceOf(SyntaxError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
