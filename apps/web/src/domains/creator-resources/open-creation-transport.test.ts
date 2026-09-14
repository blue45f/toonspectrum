import { expect, test, vi } from "vitest";
import { OPEN_RESPONSE_BYTES, readOpenJson } from "./open-creation-transport";
const signal = () => new AbortController().signal;
test("reads bounded UTF-8 JSON", async () => {
  expect(await readOpenJson(Response.json({ title: "한복" }), signal())).toEqual({ title: "한복" });
});
test("rejects HTML and oversized content-length before reading", async () => {
  for (const headers of [new Headers({ "content-type": "text/html" }), new Headers({ "content-type": "application/json", "content-length": String(OPEN_RESPONSE_BYTES + 1) })]) {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    await expect(readOpenJson(new Response(body, { headers }), signal())).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  }
});
test("cancels a growing body at the byte limit even with no length header", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(OPEN_RESPONSE_BYTES + 1)); }, cancel });
  await expect(readOpenJson(new Response(body, { headers: { "content-type": "application/json" } }), signal())).rejects.toThrow("크기");
  expect(cancel).toHaveBeenCalledOnce();
});
test("abort settles a stalled read and cancels the stream", async () => {
  const controller = new AbortController(); const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  const result = readOpenJson(new Response(body, { headers: { "content-type": "application/json" } }), controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledOnce();
});
test("rejects already aborted requests, malformed JSON and invalid UTF-8", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readOpenJson(Response.json({}), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  await expect(readOpenJson(new Response("{", { headers: { "content-type": "application/json" } }), signal())).rejects.toThrow();
  await expect(readOpenJson(new Response(new Uint8Array([255]), { headers: { "content-type": "application/json" } }), signal())).rejects.toThrow();
});
