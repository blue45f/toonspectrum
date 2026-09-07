import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  join(process.cwd(), "apps/web/src/app/App.tsx"),
  "utf8",
);
const routerSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/router/AdminRouter.tsx"),
  "utf8",
);
const paletteSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/domains/admin/components/AdminQuickPalette.tsx",
  ),
  "utf8",
);
const shellSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/shell/AdminShell.tsx"),
  "utf8",
);

describe("admin shell review regressions", () => {
  it("retains authentication and public-site actions outside the authorized shell", () => {
    expect(routerSource).toContain("<AuthMenuShell />");
    expect(routerSource).toContain('href="/"');
  });

  it("sets the KMAS one-shot latch only when the deferred request begins", () => {
    const runIndex = appSource.indexOf("const run = () =>");
    const latchIndex = appSource.indexOf("kmasEntryMergeStarted = true", runIndex);
    expect(runIndex).toBeGreaterThan(-1);
    expect(latchIndex).toBeGreaterThan(runIndex);
  });

  it("portals the command palette to the document body", () => {
    expect(paletteSource).toContain("createPortal(");
    expect(paletteSource).toContain("document.body");
  });

  it("keeps a public-site exit visible at mobile widths", () => {
    expect(shellSource).toContain("aria-label={copy.openPublicSite}");
    expect(shellSource).toContain('className="inline-flex size-10');
  });

  it("provides the completed admin gate to embedded legacy pages", () => {
    expect(routerSource).toContain("<AdminGateOverrideProvider value={gateState}>");
  });
});
