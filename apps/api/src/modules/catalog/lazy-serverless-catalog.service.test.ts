import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LazyServerlessCatalogService } from "./lazy-serverless-catalog.service";

const base = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("./catalog.service", () => ({
  CatalogService: class {
    async onModuleInit() { await base.initialize(); }
  },
}));

beforeEach(() => {
  vi.stubEnv("CATALOG_EAGER_INIT", "0");
  base.initialize.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("lazy serverless catalog lifecycle", () => {
  it("keeps ordinary/native server initialization eager", async () => {
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

  it("keeps CATALOG_EAGER_INIT=1 eager", async () => {
    vi.stubEnv("CATALOG_EAGER_INIT", "1");
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

  it("refuses initialization after destruction", async () => {
    const service = new LazyServerlessCatalogService();
    service.onModuleDestroy();
    await expect(service.ensureInitialized()).rejects.toThrow("closed");
    expect(base.initialize).not.toHaveBeenCalled();
  });
});
