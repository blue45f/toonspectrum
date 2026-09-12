import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LazyServerlessCatalogService } from "./lazy-serverless-catalog.service";

const base = vi.hoisted(() => ({ initialize: vi.fn(), destroy: vi.fn() }));
vi.mock("./catalog.service", () => ({
  CatalogService: class {
    async onModuleInit() { await base.initialize(); }
    onModuleDestroy() { base.destroy(); }
  },
}));

beforeEach(() => {
  vi.stubEnv("WEBDEX_CATALOG_FORCE_DB", "0");
  vi.stubEnv("CATALOG_EAGER_INIT", "0");
  base.initialize.mockReset().mockResolvedValue(undefined);
  base.destroy.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

 describe("lazy serverless catalog lifecycle", () => {
  it("keeps ordinary/native server initialization eager", async () => {
    vi.stubEnv("VERCEL", "1");
    const service = new LazyServerlessCatalogService();
    await service.onModuleInit();
    expect(base.initialize).toHaveBeenCalledTimes(1);
  });
  it("defers only after explicit adapter opt-in and shares concurrent work", async () => {
    const service = new LazyServerlessCatalogService();
    service.deferInitializationUntilRequest();
    await service.onModuleInit();
    expect(base.initialize).not.toHaveBeenCalled();
    const first = service.ensureInitialized();
    expect(service.ensureInitialized()).toBe(first);
    await Promise.all([first, service.ensureInitialized()]);
    await service.ensureInitialized();
    expect(base.initialize).toHaveBeenCalledTimes(1);
  });
  it.each(["WEBDEX_CATALOG_FORCE_DB", "CATALOG_EAGER_INIT"])("keeps %s=1 eager", async (key) => {
    vi.stubEnv(key, "1");
    const service = new LazyServerlessCatalogService();
    service.deferInitializationUntilRequest();
    await service.onModuleInit();
    expect(base.initialize).toHaveBeenCalledTimes(1);
  });
  it("does not retain a rejected initialization promise", async () => {
    base.initialize.mockRejectedValueOnce(new Error("temporary failure"));
    const service = new LazyServerlessCatalogService();
    await expect(service.ensureInitialized()).rejects.toThrow("temporary failure");
    await service.ensureInitialized();
    expect(base.initialize).toHaveBeenCalledTimes(2);
  });
  it("closes the base lifecycle and refuses work after destruction", async () => {
    const service = new LazyServerlessCatalogService();
    service.onModuleDestroy();
    await expect(service.ensureInitialized()).rejects.toThrow("closed");
    expect(base.initialize).not.toHaveBeenCalled();
    expect(base.destroy).toHaveBeenCalledTimes(1);
  });
});
