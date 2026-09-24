import { describe, expect, it } from "vitest";

import {
  createStudioProjectDefinition,
  legacyStudioProjectDefinition,
  parseStudioProjectDefinition,
  projectDefinitionForRead,
} from "./studio-project-definition";

describe("studio project definitions", () => {
  it("normalizes primary workspaces, duplicate workspaces and delivery profiles", () => {
    const definition = createStudioProjectDefinition({
      format: "cuttoon",
      purpose: "brand",
      startPoint: "script",
      collaboration: "client",
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["storyboard", "webtoon", "design", "design", "review"],
      deliveryProfileIds: ["social-square", "social-square", "vertical-promo", ""],
    });

    expect(definition).toEqual({
      schemaVersion: 1,
      format: "cuttoon",
      purpose: "brand",
      startPoint: "script",
      collaboration: "client",
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["webtoon", "storyboard", "design", "review"],
      deliveryProfileIds: ["social-square", "vertical-promo"],
    });
    expect(parseStudioProjectDefinition(JSON.parse(JSON.stringify(definition)))).toEqual(definition);
  });

  it("rejects invalid definitions without guessing", () => {
    expect(parseStudioProjectDefinition(null)).toBeNull();
    expect(parseStudioProjectDefinition({
      schemaVersion: 1,
      format: "unknown",
      purpose: "serial",
      startPoint: "idea",
      collaboration: "solo",
      primaryWorkspace: "webtoon",
      enabledWorkspaces: ["webtoon"],
      deliveryProfileIds: [],
    })).toBeNull();
  });

  it("derives compatible definitions for existing projects", () => {
    expect(legacyStudioProjectDefinition("webtoon", "webtoon-four-cut")).toMatchObject({
      format: "cuttoon",
      primaryWorkspace: "webtoon",
    });
    expect(legacyStudioProjectDefinition("webtoon", "webtoon-page")).toMatchObject({
      format: "page-comic",
      deliveryProfileIds: ["page-pdf", "page-images", "print-package"],
    });
    expect(legacyStudioProjectDefinition("animation", "motion-webtoon")).toMatchObject({
      format: "motion-toon",
      primaryWorkspace: "animation",
    });
    expect(projectDefinitionForRead({ broken: true }, "illustration", "illustration-portrait"))
      .toMatchObject({ format: "illustration", purpose: "portfolio" });
    expect(legacyStudioProjectDefinition("slides", "slides-pitch")).toBeNull();
  });
});
