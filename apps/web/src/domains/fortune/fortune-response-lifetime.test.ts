import { describe, expect, it, vi } from "vitest";
import { FORTUNE_RESPONSE_BYTE_LIMIT, readFortuneResponse, validatedFortuneExpiry } from "./fortune-response-lifetime";

const now = Date.parse("2026-09-20T14:59:00.000Z");
const base = { kind: "horoscope" as const, referenceDate: "2026-09-20", checkedAt: "2026-09-20T14:58:00.000Z" };
describe("fortune response lifetimes", () => {
  it("expires legacy horoscope content at KST midnight", () => {
    expect(validatedFortuneExpiry(base, now)).toBe("2026-09-20T15:00:00.000Z");
    expect(() => validatedFortuneExpiry(base, now + 60000)).toThrow();
  });
  it.each(["missing", "future", "old", "too-long", "invalid", "different-day"])("rejects %s source times", (mode) => {
    const value = { ...base, expiresAt: "2026-09-20T15:00:00.000Z" };
    if (mode === "missing") value.checkedAt = "";
    if (mode === "future") value.checkedAt = "2026-09-20T16:00:00.000Z";
    if (mode === "old") value.expiresAt = "2026-09-20T14:58:30.000Z";
    if (mode === "too-long") value.expiresAt = "2026-09-20T15:01:00.000Z";
    if (mode === "invalid") value.expiresAt = "invalid";
    if (mode === "different-day") value.referenceDate = "2026-09-19";
    expect(() => validatedFortuneExpiry(value, now)).toThrow();
  });
  it.each(["calendar", "special-days"] as const)("bounds %s data to 24 hours", (kind) => {
    const value = { kind, checkedAt: base.checkedAt };
    expect(validatedFortuneExpiry(value, now)).toBe("2026-09-21T14:58:00.000Z");
    expect(() => validatedFortuneExpiry({ ...value, expiresAt: "2026-09-21T14:58:01.000Z" }, now)).toThrow();
  });
});
it("reads bounded UTF-8 JSON without trusting Content-Length", async () => {
  expect(await readFortuneResponse(new Response('{"text":"한글"}'), new AbortController().signal)).toEqual({ text: "한글" });
  await expect(readFortuneResponse(new Response(" ".repeat(FORTUNE_RESPONSE_BYTE_LIMIT + 1), { headers: { "content-length": "1" } }), new AbortController().signal)).rejects.toThrow("fortune-response-too-large");
});
it.each([429, 503, 200])("cancels rejected response bodies (%s)", async (status) => {
  const cancel = vi.fn(); const response = new Response(new ReadableStream({ cancel }), { status, headers: { "content-length": "65537" } });
  await expect(readFortuneResponse(response, new AbortController().signal)).rejects.toThrow();
  expect(cancel).toHaveBeenCalledOnce();
});
it("cancels a stalled body immediately and removes the abort listener", async () => {
  const cancel = vi.fn(), abort = new AbortController(); const remove = vi.spyOn(abort.signal, "removeEventListener");
  const task = readFortuneResponse(new Response(new ReadableStream({ cancel })), abort.signal);
  const checked = expect(task).rejects.toMatchObject({ name: "AbortError" }); abort.abort(); await checked;
  expect(cancel).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("rejects invalid UTF-8, invalid JSON and an already aborted read", async () => {
  await expect(readFortuneResponse(new Response(new Uint8Array([255])), new AbortController().signal)).rejects.toThrow();
  await expect(readFortuneResponse(new Response("<html>"), new AbortController().signal)).rejects.toThrow();
  const abort = new AbortController(); abort.abort();
  await expect(readFortuneResponse(new Response("{}"), abort.signal)).rejects.toMatchObject({ name: "AbortError" });
});
