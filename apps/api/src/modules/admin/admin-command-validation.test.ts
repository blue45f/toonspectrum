import "reflect-metadata";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { requireAdminCommandBoolean } from "./admin-command-validation";
import { AdminController } from "./admin.controller";

import type { AdminService } from "./admin.service";

// Keep the controller's real command validator while isolating unrelated DB services.
vi.mock("./admin.service", () => ({ AdminService: class {} }));
vi.mock("./admin-types", () => ({
  normalizeAdminBenchmarkQuery: () => ({ iterations: 3, warmup: false }),
}));

function fixture() {
  const service = {
    setMaintenanceMode: vi.fn().mockResolvedValue({ ok: true }),
    setContentVisibility: vi.fn().mockResolvedValue({ ok: true }),
  };
  return { service, controller: new AdminController(service as unknown as AdminService) };
}

const invalid: unknown[] = ["false", "true", "0", "1", 0, 1, null, undefined, [], {}, "yes", "", Number.NaN];

describe("explicit admin command booleans", () => {
  it.each(invalid)("rejects %j without invoking either service", async (value) => {
    const { controller, service } = fixture();
    expect(() => requireAdminCommandBoolean(value, "enabled")).toThrow(BadRequestException);
    await expect(controller.setMaintenanceMode("admin", { enabled: value })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setContentVisibility("admin", "review", "qa", { hidden: value })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.setMaintenanceMode).not.toHaveBeenCalled();
    expect(service.setContentVisibility).not.toHaveBeenCalled();
  });

  it.each([false, true])("forwards explicit %s unchanged", async (value) => {
    const { controller, service } = fixture();
    await controller.setMaintenanceMode("admin", { enabled: value, message: "QA" });
    await controller.setContentVisibility("admin", "review", "qa", { hidden: value });
    expect(service.setMaintenanceMode).toHaveBeenCalledWith("admin", value, "QA");
    expect(service.setContentVisibility).toHaveBeenCalledWith("admin", "review", "qa", value);
  });

  it("checks identity before reading a malformed body", async () => {
    const { controller, service } = fixture();
    await expect(controller.setMaintenanceMode(undefined, { enabled: "false" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.setMaintenanceMode).not.toHaveBeenCalled();
  });
});
