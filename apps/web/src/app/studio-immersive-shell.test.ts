/**
 * Studio immersive shell — site GNB/footer must not render on the first /studio render.
 * Route truth owns web chrome; the ui-store remains a lifecycle mirror for other consumers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { useUi } from "@/shared/lib/ui-store";
import { isImmersiveMobileRoute } from "@/src/app/routes/immersive-mobile-route";

describe("studio immersive shell", () => {
  beforeEach(() => {
    useUi.setState({ commandPaletteOpen: false, immersiveSurface: null });
  });

  it("treats /studio paths as immersive routes", () => {
    expect(isImmersiveMobileRoute("/studio")).toBe(true);
    expect(isImmersiveMobileRoute("/studio/")).toBe(true);
    expect(isImmersiveMobileRoute("/studio/work/1")).toBe(true);
    expect(isImmersiveMobileRoute("/studio-guide")).toBe(false);
    expect(isImmersiveMobileRoute("/")).toBe(false);
  });

  it("derives the App chrome gate from the current route before effects run", () => {
    expect(useUi.getState().immersiveSurface).toBeNull();
    expect(isImmersiveMobileRoute("/studio/work/1/canvas")).toBe(true);

    const appSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/App.tsx"),
      "utf8",
    );
    expect(appSource).toContain(
      "const studioImmersive = isImmersiveMobileRoute(pathname);",
    );
    expect(appSource).not.toContain(
      'useUi((state) => state.immersiveSurface === "studio")',
    );
  });

  it("keeps one retained 3D host in the AppShell chrome layer", () => {
    const appSource = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/app/App.tsx"),
      "utf8",
    );
    expect(appSource).toMatch(
      /chromeOverlay=\{[\s\S]*?<StudioBg3dRetainedOwnerHost \/>/,
    );
    expect(appSource.match(/<StudioBg3dRetainedOwnerHost \/>/g)).toHaveLength(1);
  });

  it("keeps the shared immersive lifecycle mirror scoped and idempotent", () => {
    useUi.getState().acquireImmersiveSurface("studio");
    expect(useUi.getState().immersiveSurface).toBe("studio");

    useUi.getState().releaseImmersiveSurface("studio");
    expect(useUi.getState().immersiveSurface).toBeNull();

    useUi.getState().releaseImmersiveSurface("studio");
    expect(useUi.getState().immersiveSurface).toBeNull();
  });
});
