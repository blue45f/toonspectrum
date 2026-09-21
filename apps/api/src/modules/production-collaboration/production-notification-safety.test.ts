import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionIntegrationService } from "./production-integration.service";
import type { ProductionCollaborationService } from "./production-collaboration.service";
import type { ProductionIntegrationRepository } from "./production-integration.repository";
import { ProductionExternalHttpError, externalFetchJson } from "./production-integration-http";

const f = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("./production-notification-provider", () => ({ sendProductionNotification: f.send }));
function fixture() {
  const projects = { getProject: vi.fn().mockResolvedValue({ aggregate: { title: "Project" }, access: { view: true, edit: true, manage: true } }) };
  const repository = { beginMutation: vi.fn().mockResolvedValue({ replay: null }), countMutationsSince: vi.fn().mockResolvedValue(0),
    completeMutation: vi.fn().mockResolvedValue(undefined), failMutation: vi.fn().mockResolvedValue(undefined), listPushSubscriptions: vi.fn().mockResolvedValue([]), deletePushSubscriptionByHash: vi.fn().mockResolvedValue(undefined) };
  const service = new ProductionIntegrationService(projects as unknown as ProductionCollaborationService, repository as unknown as ProductionIntegrationRepository);
  const input = { mutationId: "11111111-1111-4111-8111-111111111111", channel: "generic-webhook" as const, title: "Review", body: "Check the pinned review." };
  return { projects, repository, send: () => service.sendNotification("actor", "project", input) };
}
beforeEach(() => { f.send.mockReset().mockResolvedValue({ sent: 1, removedEndpointHashes: [], providerResponse: {} }); });
afterEach(() => vi.unstubAllGlobals());
describe("notification side-effect receipts", () => {
  it("keeps an accepted provider side effect uncertain when local receipt persistence fails", async () => {
    const test = fixture(); test.repository.completeMutation.mockRejectedValue(new Error("database offline"));
    await expect(test.send()).rejects.toMatchObject({ status: 503 });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(test.repository.failMutation).toHaveBeenCalledWith(expect.objectContaining({ state: "uncertain", errorCode: "external_receipt_persistence_failed" }));
  });
  it("rechecks access immediately before the external call", async () => {
    const test = fixture(); test.projects.getProject.mockResolvedValueOnce({ aggregate: { title: "Project" }, access: { view: true, edit: true, manage: true } })
      .mockResolvedValueOnce({ aggregate: { title: "Project" }, access: { view: true, edit: false, manage: false } });
    await expect(test.send()).rejects.toThrow(); expect(f.send).not.toHaveBeenCalled();
    expect(test.repository.failMutation).toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
  });
  it("does not convert expired-subscription cleanup failures into a duplicate notification", async () => {
    const test = fixture(); f.send.mockResolvedValue({ sent: 1, removedEndpointHashes: ["expired-a", "expired-b"], providerResponse: {} });
    test.repository.deletePushSubscriptionByHash.mockRejectedValueOnce(new Error("cleanup unavailable"));
    expect(await test.send()).toMatchObject({ sent: 1, removedExpired: 1, cleanupPending: 1 });
    expect(test.repository.failMutation).not.toHaveBeenCalled(); expect(test.repository.completeMutation).toHaveBeenCalledOnce();
  });
  it("treats unknown post-dispatch failures conservatively but preserves explicit rejection", async () => {
    let test = fixture(); f.send.mockRejectedValue(new Error("unknown provider result")); await expect(test.send()).rejects.toMatchObject({ status: 503 });
    expect(test.repository.failMutation).toHaveBeenCalledWith(expect.objectContaining({ state: "uncertain" }));
    test = fixture(); f.send.mockRejectedValue(new ProductionExternalHttpError("external_http_400", 400, false)); await expect(test.send()).rejects.toThrow();
    expect(test.repository.failMutation).toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
  });
  it("returns an existing idempotent receipt without calling the provider again", async () => {
    const test = fixture(); test.repository.beginMutation.mockResolvedValue({ replay: { sent: 1 } });
    expect(await test.send()).toEqual({ sent: 1 }); expect(f.send).not.toHaveBeenCalled();
  });
});
describe("bounded integration responses", () => {
  it("cancels an oversized response while streaming rather than after full buffering", async () => {
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(600_000)); controller.enqueue(new Uint8Array(600_000)); }, cancel });
    const fetch = vi.fn().mockResolvedValue(new Response(body)); vi.stubGlobal("fetch", fetch);
    await expect(externalFetchJson("https://provider.example.com", { method: "POST" }, 1000)).rejects.toMatchObject({ code: "external_response_too_large", uncertain: true });
    expect(cancel).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0]?.[1].redirect).toBe("manual");
  });
  it("never follows credential-bearing redirect responses", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://another.example.com" } })); vi.stubGlobal("fetch", fetch);
    await expect(externalFetchJson("https://provider.example.com", { method: "POST" }, 1000)).rejects.toMatchObject({ code: "external_redirect_blocked", uncertain: true });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("preserves caller cancellation in addition to the bounded timeout", async () => {
    const abort = new AbortController(); abort.abort();
    const fetch = vi.fn(async (_url: string, init: RequestInit) => { init.signal?.throwIfAborted(); return new Response("{}"); }); vi.stubGlobal("fetch", fetch);
    await expect(externalFetchJson("https://provider.example.com", { method: "POST", signal: abort.signal }, 1000)).rejects.toMatchObject({ uncertain: true });
    expect(fetch.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  });
});
