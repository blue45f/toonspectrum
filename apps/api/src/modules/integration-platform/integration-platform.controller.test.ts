import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationPlatformController } from "./integration-platform.controller";
import type { IntegrationPlatformService } from "./integration-platform.service";

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
}));

vi.mock("../admin/admin-types", () => ({
  requireAdminUser: mocks.requireAdminUser,
}));

function createSubject() {
  const service = {
    catalog: vi.fn(() => ({ providers: [] })),
    recipes: vi.fn(() => ({ templates: [] })),
    runtime: vi.fn(() => ({ totalProviders: 0 })),
    validateRecipe: vi.fn(),
    buildPublishPackage: vi.fn(),
    buildFeedPreview: vi.fn(),
    developerManifest: vi.fn(),
  };
  return {
    controller: new IntegrationPlatformController(
      service as unknown as IntegrationPlatformService,
    ),
    service,
  };
}

describe("IntegrationPlatformController access boundaries", () => {
  beforeEach(() => {
    mocks.requireAdminUser.mockReset().mockResolvedValue({
      id: "admin-1",
      role: "admin",
    });
  });

  it("requires a verified session for the private provider catalogue", () => {
    const { controller, service } = createSubject();
    expect(() => controller.catalog(undefined)).toThrow(UnauthorizedException);
    expect(service.catalog).not.toHaveBeenCalled();
  });

  it("allows a verified session to read the provider catalogue", () => {
    const { controller, service } = createSubject();
    expect(controller.catalog("user-1")).toEqual({ providers: [] });
    expect(service.catalog).toHaveBeenCalledOnce();
  });

  it("requires administrator authorization for runtime configuration state", async () => {
    const { controller, service } = createSubject();
    await expect(controller.runtime("admin-1")).resolves.toEqual({
      totalProviders: 0,
    });
    expect(mocks.requireAdminUser).toHaveBeenCalledWith("admin-1");
    expect(service.runtime).toHaveBeenCalledOnce();
  });
});
