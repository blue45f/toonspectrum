// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

const availableCapabilities = {
  publicCatalog: "available",
  authSession: "available",
  communityRead: "available",
  communityWrite: "available",
  marketplaceRead: "available",
  studioLocalEditing: "available",
  studioProjectRead: "available",
  studioCloudSave: "available",
  realtimeCollaboration: "available",
  publishing: "available",
  serverAi: "available",
} as const;

function report(
  status: "available" | "degraded",
  capabilities: Record<string, string>,
) {
  return {
    status,
    incidentId: status === "degraded" ? "inc_probe" : null,
    retryAfterSeconds: status === "degraded" ? 30 : null,
    checkedAt: new Date().toISOString(),
    capabilities,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("service capability runtime state", () => {
  it("stores a degraded capability report without disabling local editing", async () => {
    globalThis.fetch = vi.fn(async () => Response.json(report("degraded", {
      ...availableCapabilities,
      communityRead: "unavailable",
      studioCloudSave: "unavailable",
    }))) as unknown as typeof fetch;
    const subject = await import("./service-capability-state");

    const state = await subject.probeServiceCapabilities(true);

    expect(state.status).toBe("degraded");
    expect(state.report?.incidentId).toBe("inc_probe");
    expect(subject.capabilityAvailable("communityRead", state)).toBe(false);
    expect(subject.capabilityAvailable("studioLocalEditing", state)).toBe(true);
    expect(JSON.parse(localStorage.getItem("toonspectrum:service-capabilities:v1") ?? "null"))
      .toMatchObject({ status: "degraded" });
  });

  it("records recovery after a degraded report becomes available", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(Response.json(report("degraded", {
        ...availableCapabilities,
        marketplaceRead: "unavailable",
      })))
      .mockResolvedValueOnce(Response.json(report("available", availableCapabilities)));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const subject = await import("./service-capability-state");

    await subject.probeServiceCapabilities(true);
    const recovered = await subject.probeServiceCapabilities(true);

    expect(recovered.status).toBe("available");
    expect(recovered.recoveredAt).toEqual(expect.any(Number));
    expect(recovered.report?.incidentId).toBeNull();
  });
});
