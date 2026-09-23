import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const campusCss = readFileSync(new URL("./campus.css", import.meta.url), "utf8");
const fortuneCss = ["fortune-observatory.css", "fortune-cinematic.css"]
  .map((file) => readFileSync(new URL(`../../../domains/fortune/${file}`, import.meta.url), "utf8"))
  .join("\n");

describe("spatial campus theme contract", () => {
  it("keeps the dark observatory palette opaque inside light site themes", () => {
    expect(campusCss).toContain(
      "[data-campus-domain=fortune]{padding:0!important;max-width:none!important;background:var(--fo-bg)!important}",
    );
    expect(campusCss).not.toContain("background:transparent!important");
  });

  it("uses the observatory foreground pair for its directory and selected room", () => {
    expect(campusCss).toContain("color:var(--fo-ink,var(--color-fg))");
    expect(campusCss).toContain("color:var(--fo-muted,var(--color-fg-2))");
    expect(campusCss).toContain("color:var(--fo-gold,var(--color-accent))");
    expect(campusCss).toContain("background:var(--fo-panel,var(--color-panel))");
  });

  it("does not render readable fortune copy below ten pixels", () => {
    expect(fortuneCss).not.toMatch(/font-size:[6-9]px/u);
  });
});
