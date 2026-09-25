import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicOutboundAddress, parsePublicWebhookDestination } from "../../platform/network/public-endpoint";
import { sendProtectedWebhook } from "./production-webhook-network";

const f = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: f.lookup }));
vi.mock("node:https", () => ({ request: f.request }));
function reply(chunks: readonly Uint8Array[], statusCode = 200, headers: Record<string, string> = {}) {
  const stream = Object.assign(Readable.from(chunks), { statusCode, headers });
  f.request.mockImplementation((_url, _options, callback) => {
    const handle = new EventEmitter();
    return Object.assign(handle, { end: vi.fn(() => callback(stream)) });
  });
  return stream;
}
beforeEach(() => { f.lookup.mockReset().mockResolvedValue([{ address: "1.1.1.1", family: 4 }]); f.request.mockReset(); reply([Buffer.from('{"accepted":true}')]); });
const post = () => sendProtectedWebhook("https://hooks.example.com/events", { "Content-Type": "application/json" }, '{"event":"test"}', 1000);
describe("protected generic webhook transport", () => {
  it("resolves once, pins the connection, verifies TLS and bounds response headers", async () => {
    expect(await post()).toEqual({ accepted: true }); expect(f.lookup).toHaveBeenCalledTimes(1); expect(f.request).toHaveBeenCalledTimes(1);
    const [url, options] = f.request.mock.calls[0]!;
    expect(url.hostname).toBe("hooks.example.com");
    expect(options).toMatchObject({ method: "POST", agent: false, family: 4, rejectUnauthorized: true, servername: "hooks.example.com", maxHeaderSize: 16384 });
    const callback = vi.fn(); options.lookup("hooks.example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(null, [{ address: "1.1.1.1", family: 4 }]);
    expect(f.lookup).toHaveBeenCalledTimes(1);
  });
  it.each(["http://hooks.example.com", "https://localhost/a", "https://127.1/a", "https://[::ffff:127.0.0.1]/a", "https://10.0.0.1/a", "https://hooks.internal/a", "https://u:p@hooks.example.com/a", "https://hooks.example.com:8443/a", "https://hooks.example.com/a?token=private"])("rejects unapproved destination shape %s before connecting", async (url) => {
    await expect(sendProtectedWebhook(url, {}, "{}", 1000)).rejects.toMatchObject({ uncertain: false });
    expect(f.request).not.toHaveBeenCalled();
  });
  it("rejects the entire mixed DNS answer rather than selecting its public member", async () => {
    f.lookup.mockResolvedValue([{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(post()).rejects.toMatchObject({ uncertain: false }); expect(f.request).not.toHaveBeenCalled();
  });
  it("does not follow redirects or forward signed headers to another destination", async () => {
    const response = reply([], 302, { location: "http://169.254.169.254/metadata" });
    await expect(post()).rejects.toMatchObject({ code: "external_redirect_blocked", uncertain: true });
    expect(f.request).toHaveBeenCalledTimes(1); expect(response.destroyed).toBe(true);
  });
  it("caps streaming responses and rejects unexpected compressed bodies", async () => {
    let response = reply([Buffer.alloc(600_000), Buffer.alloc(600_000)]);
    await expect(post()).rejects.toMatchObject({ code: "external_response_too_large", uncertain: true }); expect(response.destroyed).toBe(true);
    response = reply([], 200, { "content-length": "2097152" });
    await expect(post()).rejects.toMatchObject({ code: "external_response_too_large" }); expect(response.destroyed).toBe(true);
    reply([], 200, { "content-encoding": "gzip" });
    await expect(post()).rejects.toMatchObject({ code: "external_encoding_blocked", uncertain: true });
  });
  it("bounds a stalled DNS lookup without making a later request", async () => {
    f.lookup.mockReturnValue(new Promise(() => undefined));
    await expect(sendProtectedWebhook("https://hooks.example.com", {}, "{}", 10)).rejects.toMatchObject({ uncertain: false });
    expect(f.request).not.toHaveBeenCalled();
  });
  it("does not send oversized bodies and distinguishes rejected from uncertain HTTP results", async () => {
    await expect(sendProtectedWebhook("https://hooks.example.com", {}, "x".repeat(65_537), 1000)).rejects.toMatchObject({ uncertain: false });
    expect(f.request).not.toHaveBeenCalled();
    reply([Buffer.from("{}")], 400); await expect(post()).rejects.toMatchObject({ status: 400, uncertain: false });
    reply([Buffer.from("{}")], 503); await expect(post()).rejects.toMatchObject({ status: 503, uncertain: true });
    reply([Buffer.from("not-json")], 200); await expect(post()).rejects.toMatchObject({ uncertain: true });
    reply([], 204); expect(await post()).toEqual({});
  });
  it("excludes mapped, transition, reserved and local address ranges", () => {
    for (const value of ["0.0.0.0", "100.64.0.1", "192.168.0.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:8.8.8.8", "64:ff9b::a00:1", "2001:db8::1", "2002:a00:1::", "fc00::1"]) expect(isPublicOutboundAddress(value)).toBe(false);
    for (const value of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) expect(isPublicOutboundAddress(value)).toBe(true);
    expect(parsePublicWebhookDestination("https://hooks.example.com/events").pathname).toBe("/events");
  });
});
