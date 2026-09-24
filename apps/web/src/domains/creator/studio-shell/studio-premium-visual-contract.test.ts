import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

const canvasWelcome = readFileSync(
  new URL("../canvas/StudioCinematicCanvasWelcome.tsx", import.meta.url),
  "utf8",
);
const canvasCss = readFileSync(
  new URL("../studio-cuttoon-editor/studio-cinematic-canvas-v4.css", import.meta.url),
  "utf8",
);
const creatorLobby = readFileSync(new URL("./StudioCreatorLobby.tsx", import.meta.url), "utf8");
const workspaceNavigation = readFileSync(
  new URL("../../../shared/components/workspace/WorkspaceNavigation.tsx", import.meta.url),
  "utf8",
);
const workspaceCss = readFileSync(
  new URL("../../../shared/components/workspace/workspace-visual-v3.css", import.meta.url),
  "utf8",
);
const iconDirectory = new URL(
  "../../../../public/brand/toonstudio-premium-icons/",
  import.meta.url,
);

const PREMIUM_ICON_NAMES = [
  "ai-director.webp",
  "assets.webp",
  "background.webp",
  "canvas.webp",
  "character.webp",
  "community.webp",
  "create.webp",
  "home.webp",
  "projects.webp",
  "settings.webp",
  "story.webp",
] as const;

describe("ToonStudio premium visual flow contract", () => {
  it("ships the complete generated premium icon family", () => {
    expect(readdirSync(iconDirectory).filter((name) => name.endsWith(".webp")).sort()).toEqual(
      [...PREMIUM_ICON_NAMES].sort(),
    );
    for (const name of PREMIUM_ICON_NAMES) {
      expect(readFileSync(new URL(name, iconDirectory)).byteLength).toBeGreaterThan(1_000);
    }
  });

  it("uses image-led creation paths in the lobby and global workspace navigation", () => {
    expect(creatorLobby).toContain("/brand/toonstudio-premium-icons");
    expect(creatorLobby.match(/art: "[^"]+\.webp"/gu)).toHaveLength(5);
    expect(workspaceNavigation.match(/toonstudio-premium-icons\/[^"]+\.webp/gu)).toHaveLength(4);
    expect(workspaceCss).toContain(".workspace-nav-visual>img");
  });

  it("turns the blank canvas into a mode and scene-led webtoon start flow", () => {
    expect(canvasWelcome.match(/data-canvas-start-mode/gu)).toHaveLength(1);
    expect(canvasWelcome.match(/id: "(romance|sf|action|fantasy|daily|horror)"/gu)).toHaveLength(6);
    expect(canvasCss).toContain(".studio-cinematic-canvas-welcome__scene-strip");
    expect(canvasCss).toContain("body:has([data-studio-cinematic-canvas-welcome");
  });

  it("preserves reduced-motion, high-contrast, and mobile-safe presentation", () => {
    expect(canvasCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(canvasCss).toContain("@media(forced-colors:active)");
    expect(canvasCss).toContain("env(safe-area-inset-top)");
    expect(canvasCss).toContain("env(safe-area-inset-bottom)");
  });
});
