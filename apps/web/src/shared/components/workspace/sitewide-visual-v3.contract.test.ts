import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workspaceCss = readFileSync(new URL("./workspace-visual-v3.css", import.meta.url), "utf8");
const editorCss = readFileSync(
  new URL("../../../domains/creator/studio-shell/studio-visual-identity-v2.css", import.meta.url),
  "utf8",
);
const adminCss = readFileSync(
  new URL("../../../domains/admin/shell/admin-visual-v2.css", import.meta.url),
  "utf8",
);
const campusModel = readFileSync(
  new URL("../../lib/spatial-campus/campus-model.ts", import.meta.url),
  "utf8",
);
const routeVisual = readFileSync(
  new URL("../../lib/site-route-visual.ts", import.meta.url),
  "utf8",
);

describe("sitewide visual identity v3 contract", () => {
  it("gives every spatial district a distinct Image Generation 2.5 scene", () => {
    expect(workspaceCss.match(/data-campus-district=/gu)).toHaveLength(9);
    expect(campusModel.match(/gpt25-v1/gu)).toHaveLength(9);
    expect(new Set(campusModel.match(/\/assets\/studio\/generated-backgrounds\/gpt25-v1[^"']+/gu))).toHaveLength(9);
  });

  it("maps every route visual kind to generated artwork", () => {
    expect(routeVisual.match(/image: "\/assets\/studio\/generated-backgrounds\/gpt25-v1/gu)).toHaveLength(14);
  });

  it("keeps image-backed navigation and motion accessible", () => {
    expect(workspaceCss).toContain(".workspace-nav-visual-art");
    expect(workspaceCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(workspaceCss).toContain("@media(forced-colors:active)");
  });

  it("keeps the canvas quiet while upgrading editor chrome and the beta gate", () => {
    expect(editorCss).toContain('[data-studio-canvas-viewport]');
    expect(editorCss).toContain('[data-studio-rail-tool-id="pen"]');
    expect(editorCss).toContain('[data-studio-beta-notice="true"]');
    expect(editorCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(editorCss).toContain("@media(forced-colors:active)");
  });

  it("gives protected administration routes the same image-led visual language", () => {
    expect(adminCss).toContain('[data-admin-shell="true"]');
    expect(adminCss).toContain(".admin-nav-art");
    expect(adminCss).toContain('[data-admin-notice="true"]');
    expect(adminCss).toContain("@media(prefers-reduced-motion:reduce)");
  });
});
