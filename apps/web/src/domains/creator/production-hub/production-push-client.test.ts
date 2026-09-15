// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  productionPushSupported,
  subscribeProductionPush,
  unsubscribeProductionPush,
} from "./production-push-client";

const api = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock("./production-api", () => ({
  registerProductionPushSubscription: api.register,
  unregisterProductionPushSubscription: api.unregister,
}));

const subscription = {
  endpoint: "https://push.example/subscription-1",
  unsubscribe: vi.fn(),
  toJSON: vi.fn(() => ({
    endpoint: "https://push.example/subscription-1",
    expirationTime: null,
    keys: { p256dh: "p".repeat(64), auth: "a".repeat(24) },
  })),
} as unknown as PushSubscription;

const pushManager = {
  getSubscription: vi.fn(async () => subscription),
  subscribe: vi.fn(async () => subscription),
};

beforeEach(() => {
  api.register.mockReset().mockResolvedValue({ subscribed: true });
  api.unregister.mockReset().mockResolvedValue({ unsubscribed: true });
  pushManager.getSubscription.mockClear();
  pushManager.subscribe.mockClear();
  vi.mocked(subscription.unsubscribe).mockReset();
  vi.mocked(subscription.toJSON).mockClear();

  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  vi.stubGlobal("PushManager", class PushManagerStub {});
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: vi.fn(async () => "granted"),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("production push client", () => {
  it("reuses the browser subscription and registers it for the selected project", async () => {
    expect(productionPushSupported()).toBe(true);

    await subscribeProductionPush("project-a", "unused-existing-key");

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.register).toHaveBeenCalledWith(
      "project-a",
      subscription.toJSON(),
    );
  });

  it("removes only the selected project mapping", async () => {
    await unsubscribeProductionPush("project-a");

    expect(api.unregister).toHaveBeenCalledWith(
      "project-a",
      subscription.endpoint,
    );
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });
});
