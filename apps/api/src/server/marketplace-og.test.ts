import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ create: vi.fn(), getById: vi.fn(), close: vi.fn(async () => undefined) }));
vi.mock("@nestjs/core", () => ({ NestFactory: { createApplicationContext: deps.create } }));
vi.mock("../modules/creator-marketplace/creator-marketplace.module", () => ({ CreatorMarketplaceModule: class CreatorMarketplaceModule {} }));
vi.mock("../modules/creator-marketplace/creator-marketplace.service", () => ({ CreatorMarketplaceService: class CreatorMarketplaceService {} }));
const ID = "123e4567-e89b-42d3-a456-426614174000";
beforeEach(() => {
  vi.resetModules();
  deps.getById.mockReset(); deps.create.mockReset(); deps.close.mockClear();
  deps.create.mockResolvedValue({ get: () => ({ getById: deps.getById }), close: deps.close });
});
describe("marketplace OG policy adapter", () => {
  it("uses a single DI context but rechecks the anonymous public record on every request", async () => {
    const { readMarketplaceOgResource } = await import("./marketplace-og");
    deps.getById.mockResolvedValueOnce({ name: "visible" }).mockRejectedValueOnce(new Error("hidden"));
    await expect(readMarketplaceOgResource(ID)).resolves.toEqual({ name: "visible" });
    await expect(readMarketplaceOgResource(ID)).rejects.toThrow("hidden");
    expect(deps.create).toHaveBeenCalledTimes(1);
    expect(deps.getById.mock.calls).toEqual([[ID], [ID]]);
  });
  it("rejects malformed identifiers without importing/booting the marketplace", async () => {
    const { readMarketplaceOgResource } = await import("./marketplace-og");
    for (const id of ["", "../../private", ID + "\n"]) await expect(readMarketplaceOgResource(id)).resolves.toBeNull();
    expect(deps.create).not.toHaveBeenCalled();
  });
  it("retries a failed cold context and does not retain a rejected promise", async () => {
    const { readMarketplaceOgResource } = await import("./marketplace-og");
    deps.create.mockRejectedValueOnce(new Error("cold failure"));
    await expect(readMarketplaceOgResource(ID)).rejects.toThrow("cold failure");
    deps.getById.mockResolvedValue({ name: "recovered" });
    await expect(readMarketplaceOgResource(ID)).resolves.toEqual({ name: "recovered" });
    expect(deps.create).toHaveBeenCalledTimes(2);
  });
  it("closes a context when service resolution fails", async () => {
    deps.create.mockResolvedValueOnce({ get: () => { throw new Error("missing service"); }, close: deps.close });
    const { readMarketplaceOgResource } = await import("./marketplace-og");
    await expect(readMarketplaceOgResource(ID)).rejects.toThrow("missing service");
    expect(deps.close).toHaveBeenCalledOnce();
  });
});
