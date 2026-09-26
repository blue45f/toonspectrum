import { describe, expect, it } from "vitest";

import {
  isStudioServerCapabilityAvailable,
  isStudioServerUnavailableError,
  resolveStudioConnectivitySnapshot,
} from "./studio-connectivity";

describe("Studio connectivity mode", () => {
  it("keeps unknown reachability optimistic during the first online probe", () => {
    const snapshot = resolveStudioConnectivitySnapshot({
      browserOnline: true,
      serverReachable: null,
      checking: true,
    });
    expect(snapshot.mode).toBe("reconnecting");
    expect(snapshot.serverAvailable).toBe(true);
    expect(snapshot.localOnly).toBe(false);
  });

  it("enters local-only mode when the browser is offline", () => {
    const snapshot = resolveStudioConnectivitySnapshot({
      browserOnline: false,
      serverReachable: false,
      checking: false,
    });
    expect(snapshot.mode).toBe("offline");
    expect(snapshot.serverAvailable).toBe(false);
    expect(snapshot.localOnly).toBe(true);
  });

  it("treats an API outage as local-only even when the network interface is online", () => {
    const snapshot = resolveStudioConnectivitySnapshot({
      browserOnline: true,
      serverReachable: false,
      checking: false,
      consecutiveFailures: 2,
    });
    expect(snapshot.mode).toBe("server-unavailable");
    expect(snapshot.serverAvailable).toBe(false);
    expect(snapshot.consecutiveFailures).toBe(2);
  });

  it("returns to online after a successful readiness probe", () => {
    const snapshot = resolveStudioConnectivitySnapshot({
      browserOnline: true,
      serverReachable: true,
      checking: false,
    });
    expect(snapshot.mode).toBe("online");
    expect(snapshot.serverAvailable).toBe(true);
  });
});

describe("Studio server outage classification", () => {
  it("recognizes fetch network failures and server 5xx responses", () => {
    expect(isStudioServerUnavailableError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isStudioServerUnavailableError({ response: { status: 503 } })).toBe(true);
  });

  it("does not turn local programming errors or client responses into an outage", () => {
    expect(isStudioServerUnavailableError(
      new TypeError("Cannot read properties of undefined"),
    )).toBe(false);
    expect(isStudioServerUnavailableError({ response: { status: 409 } })).toBe(false);
  });
});

describe("Studio capability probe", () => {
  it("keeps Studio online when unrelated dependencies are degraded", async () => {
    await expect(isStudioServerCapabilityAvailable(new Response(JSON.stringify({
      status: "degraded",
      capabilities: {
        studioProjectRead: "available",
        studioCloudSave: "available",
        marketplaceRead: "unavailable",
      },
    }), { status: 200 }))).resolves.toBe(true);
  });

  it("enters local-only mode when project read or cloud save is unavailable", async () => {
    await expect(isStudioServerCapabilityAvailable(new Response(JSON.stringify({
      status: "degraded",
      capabilities: {
        studioProjectRead: "unavailable",
        studioCloudSave: "available",
      },
    }), { status: 200 }))).resolves.toBe(false);
  });

  it("fails closed on invalid or non-success capability responses", async () => {
    await expect(isStudioServerCapabilityAvailable(
      new Response("not-json", { status: 200 }),
    )).resolves.toBe(false);
    await expect(isStudioServerCapabilityAvailable(
      new Response(null, { status: 503 }),
    )).resolves.toBe(false);
  });
});
