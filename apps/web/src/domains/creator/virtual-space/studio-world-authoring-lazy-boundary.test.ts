import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("world authoring eager-boundary policy", () => {
  it("keeps authoring component and reusable package metadata out of live/core imports", () => {
    const page = readFileSync(new URL("./StudioVirtualSpacePage.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/from\s+["']\.\/StudioVirtualSpaceWorldAuthoringPanel["']/u);
    const loader = readFileSync(new URL("./load-studio-world-authoring.ts", import.meta.url), "utf8");
    expect(loader).toContain('import("./StudioVirtualSpaceWorldAuthoringPanel")');
    const contract = readFileSync("packages/studio-project-model/src/graph/world-publication.ts", "utf8");
    expect(contract).not.toContain("studioWorldTemplatePackageSchema");
    expect(contract).toContain("assetIntegrity"); expect(contract).toContain("interactionRules");
  });
});
