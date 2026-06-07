import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin API security boundaries", () => {
  it("requires admin authorization before reading admin config", () => {
    const controller = readFileSync(join(process.cwd(), "apps/api/src/modules/admin/admin.controller.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "apps/api/src/modules/admin/admin.service.ts"), "utf8");

    expect(controller).toMatch(/const uid = enforceUserOrError\(userId\);\s*return this\.adminService\.getConfig\(uid\);/);
    expect(service).toMatch(/async getConfig\(userId: string\) \{\s*await requireAdminUser\(userId\);\s*return getAppConfig\(\);/);
  });
});
