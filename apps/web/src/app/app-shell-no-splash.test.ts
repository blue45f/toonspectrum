import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("AppShell product entry", () => {
  it("does not block route content behind an automatic full-screen intro", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/AppShell.tsx"),
      "utf8",
    );

    expect(source).not.toContain("RandomIntro");
    expect(source).not.toContain("shouldRenderAppSplash");
    expect(source).not.toMatch(/\bsplash\??:\s*ReactNode/);
  });
});
