import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { escapeLike } from "../../apps/api/src/modules/admin/admin-types";

describe("admin API security boundaries", () => {
  it("requires admin authorization before reading admin config", () => {
    const controller = readFileSync(join(process.cwd(), "apps/api/src/modules/admin/admin.controller.ts"), "utf8");
    const metricsService = readFileSync(
      join(process.cwd(), "apps/api/src/modules/admin/admin-metrics.service.ts"),
      "utf8",
    );

    expect(controller).toMatch(/const uid = enforceUserOrError\(userId\);\s*return this\.adminService\.getConfig\(uid\);/);
    expect(metricsService).toMatch(/async getConfig\(userId: string\) \{\s*await requireAdminUser\(userId\);\s*return getAppConfig\(\);/);
  });

  it("does not gate /admin/me on ensureAdminSchema DDL (runtime role may lack CREATE)", () => {
    const metricsService = readFileSync(
      join(process.cwd(), "apps/api/src/modules/admin/admin-metrics.service.ts"),
      "utf8",
    );
    const match = metricsService.match(
      /async getAdminMe\(userId: string\) \{([\s\S]*?)\n\s*async getConfig/,
    );
    expect(match).not.toBeNull();
    const body = match![1].replace(/\/\/[^\n]*/g, "");
    expect(body).toMatch(/await requireAdminUser\(userId\)/);
    expect(body).not.toMatch(/await ensureAdminSchema\s*\(/);
  });

  it("correctly escapes LIKE wildcards and escape characters in escapeLike function", () => {
    expect(escapeLike("normal")).toBe("normal");
    expect(escapeLike("percent%sign")).toBe("percent\\%sign");
    expect(escapeLike("under_score")).toBe("under\\_score");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("mixed%_\\special")).toBe("mixed\\%\\_\\\\special");
  });
});
