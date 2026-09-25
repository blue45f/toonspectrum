import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("auth session import graph", () => {
  it("keeps the shared API client below the React auth facade without an ineffective dynamic edge", () => {
    const authStore = readFileSync(join(process.cwd(), "apps/web/src/domains/auth/public/session/auth-session-store.ts"), "utf8");
    const apiClient = readFileSync(join(process.cwd(), "apps/web/src/platform/api.ts"), "utf8");

    expect(authStore).not.toMatch(/import\s*\(\s*["']@\/src\/infrastructure\/api["']\s*\)/);
    expect(authStore).toContain('import { api, apiPath } from "@/platform/api"');
    expect(apiClient).not.toContain("@/domains/auth/public/session/auth-session-store");
    expect(apiClient).toContain("@/domains/auth/public/session/auth-session-state");
  });
});
