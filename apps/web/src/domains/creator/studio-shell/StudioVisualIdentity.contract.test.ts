import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("ToonStudio visual identity contract", () => {
  it("ships every generated visual asset used by the creator lobby", () => {
    const assets = [
      "apps/web/public/brand/toonstudio-visual-identity/creator-lobby-hero.webp",
      "apps/web/public/brand/toonstudio-visual-identity/ai-creative-director.webp",
      "apps/web/public/brand/atelier-world-640.webp",
      "apps/web/public/brand/atelier-process-640.webp",
      "apps/web/public/brand/atelier-materials-640.webp",
    ];

    for (const asset of assets) {
      const absolutePath = resolve(ROOT, asset);
      const header = readFileSync(absolutePath).subarray(0, 12).toString("ascii");
      expect(header.startsWith("RIFF")).toBe(true);
      expect(header.includes("WEBP")).toBe(true);
      expect(statSync(absolutePath).size).toBeGreaterThan(2_000);
    }
  });

  it("keeps the creator lobby connected to the real project workflow", () => {
    const page = source(
      "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementPage.tsx",
    );
    const lobby = source(
      "apps/web/src/domains/creator/studio-shell/StudioCreatorLobby.tsx",
    );

    expect(page).toContain('controller.view === "active" ? <StudioCreatorLobby');
    expect(lobby).toContain("controller.projectResumeTarget(project)");
    expect(lobby).toContain("controller.library.touch(project.id, resume.documentId)");
    expect(lobby).toContain("toonspectrum:command-palette:open");
    expect(lobby).toContain("/studio/new?kind=webtoon&template=webtoon-vertical");
    expect(lobby).toContain("/studio/assets/characters/new");
    expect(lobby).toContain("/studio/bg3d");
  });

  it("preserves focus, responsive, accessibility, and editor-shell rules", () => {
    const css = source(
      "apps/web/src/domains/creator/studio-shell/studio-visual-identity.css",
    );

    expect(css).toContain('[data-studio-editor="true"]');
    expect(css).toContain("[data-studio-canvas-viewport]");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
