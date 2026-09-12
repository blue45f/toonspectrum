import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const boot = vi.hoisted(() => vi.fn());
vi.mock("./serverless-bootstrap", () => ({ createServerlessApplication: boot }));
vi.mock("./auth-api.module", () => ({ AuthApiModule: class AuthApiModule {} }));
vi.mock("./studio-api.module", () => ({ StudioApiModule: class StudioApiModule {} }));
vi.mock("./general-api.module", () => ({ GeneralApiModule: class GeneralApiModule {} }));
vi.mock("../app.module", () => ({ AppModule: class AppModule {} }));
vi.mock("../modules/catalog/catalog.service", () => ({ CatalogService: class CatalogService {} }));

beforeEach(() => {
  vi.resetModules();
  boot.mockReset().mockResolvedValue(() => undefined);
  vi.stubEnv("API_RUNTIME_ROLE", "full");
  vi.stubEnv("API_SERVERLESS_MODULES", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("serverless application partitions", () => {
  it("shares each concurrent cold initialization, not another route group's application", async () => {
    const { getServerlessApp } = await import("../serverless");
    const auth = getServerlessApp("/api/auth/session");
    expect(getServerlessApp("/api/auth/providers")).toBe(auth);
    await auth;
    expect(boot.mock.calls[0][0].name).toBe("AuthApiModule");
    expect(boot.mock.calls[0][1]).toBeUndefined();
    const studio = getServerlessApp("/api/creator/works");
    expect(studio).not.toBe(auth);
    expect(getServerlessApp("/api/studio-music/status")).toBe(studio);
    await studio;
    expect(boot.mock.calls[1][0].name).toBe("StudioApiModule");
    expect(boot.mock.calls[1][1]).toBeUndefined();
    await getServerlessApp("/api/search");
    expect(boot.mock.calls[2][0].name).toBe("GeneralApiModule");
    expect(boot.mock.calls[2][1].catalogInitializer).toBeTypeOf("function");
    expect(boot).toHaveBeenCalledTimes(3);
  });
  it("discards a failed initialization and retries without poisoning warm groups", async () => {
    const { getServerlessApp } = await import("../serverless");
    boot.mockRejectedValueOnce(new Error("boot failed"));
    await expect(getServerlessApp("/api/auth/session")).rejects.toThrow("boot failed");
    await expect(getServerlessApp("/api/auth/session")).resolves.toBeTypeOf("function");
    expect(boot).toHaveBeenCalledTimes(2);
  });
  it("preserves the full API for default callers, unknown routes and rollback", async () => {
    vi.stubEnv("API_SERVERLESS_MODULES", "0");
    const { getServerlessApp } = await import("../serverless");
    const pending = getServerlessApp();
    expect(getServerlessApp("/api/auth/session")).toBe(pending);
    expect(getServerlessApp("/api/creator/works")).toBe(pending);
    await pending;
    expect(boot.mock.calls[0][0].name).toBe("AppModule");
  });
  it("rejects an unsupported role before importing or booting a partition", async () => {
    vi.stubEnv("API_RUNTIME_ROLE", "studio-live");
    const { getServerlessApp } = await import("../serverless");
    await expect(getServerlessApp("/api/auth/session")).rejects.toThrow("API_RUNTIME_ROLE=full");
    expect(boot).not.toHaveBeenCalled();
  });
});
