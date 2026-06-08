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

  it("correctly escapes LIKE wildcards and escape characters in escapeLike function", () => {
    const serviceContent = readFileSync(join(process.cwd(), "apps/api/src/modules/admin/admin.service.ts"), "utf8");
    const match = serviceContent.match(/function escapeLike\s*\(\s*value\s*:\s*string\s*\)\s*:\s*string\s*\{\s*(return\s+value\.replace\([\s\S]*?\);\s*)\}/);
    expect(match).not.toBeNull();

    // Reconstruct the function locally for validation
    const body = match![1];
    const escapeLikeLocal = new Function("value", body) as (v: string) => string;

    expect(escapeLikeLocal("normal")).toBe("normal");
    expect(escapeLikeLocal("percent%sign")).toBe("percent\\%sign");
    expect(escapeLikeLocal("under_score")).toBe("under\\_score");
    expect(escapeLikeLocal("back\\slash")).toBe("back\\\\slash");
    expect(escapeLikeLocal("mixed%_\\special")).toBe("mixed\\%\\_\\\\special");
  });
});
