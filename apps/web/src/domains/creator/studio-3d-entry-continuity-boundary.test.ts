import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const host = readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url),
  "utf8",
);
const admission = readFileSync(
  new URL("./studio-interactive-3d-surface.ts", import.meta.url),
  "utf8",
);

describe("Studio 3D entry continuity boundary", () => {
  it("makes an asset 3D open request route-authoritative even if open state was already stale", () => {
    const start = host.indexOf("function openStudioObjectInsert(");
    const end = host.indexOf("function clearStudioObjectInsertSeeds()", start);
    const source = host.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(source).toContain('navigateStudio2dSurface("poser")');
    expect(source).toContain('navigateStudio2dSurface("bg3d")');
  });

  it("allows routed 3D requests to replace another visible Studio surface", () => {
    const start = host.indexOf(
      "const upgradeRoutedSurface = useEffectEvent((surface: Studio2dWorkspaceSurface)",
    );
    const end = host.indexOf("const downgradeRoutedSurface", start);
    const source = host.slice(start, end);

    expect(source).toContain('surface === "bg3d"');
    expect(source).toContain('surface === "poser"');
    expect(source).toContain('surface === "character"');
    expect(source).toContain("requestsInteractiveThreeD");
    expect(source).toContain("navigateStudio2dSurface(surface)");
  });

  it("retires stale routed 3D peers only after the requested route owns presentation", () => {
    const start = host.indexOf('} else if (studioRoute.surface === "bg3d")');
    const end = host.indexOf('} else if (studioRoute.surface === "animation")', start);
    const source = host.slice(start, end);

    expect(source).toContain("setPoserVrmOpen(false)");
    expect(source).toContain("setCharacterShaperOpen(false)");
    expect(source).toContain("setMannequinPoserOpen(false)");
    expect(source).toContain("setBg3dOpen(false)");
    expect(source).toContain("setPoserVrmOpen(true)");
    expect(source).toContain("setCharacterShaperOpen(true)");
  });

  it("uses the current route to admit exactly one heavyweight renderer", () => {
    expect(host).toContain("routedSurface: studioRoute.surface");
    expect(admission).toContain('routedSurface === "bg3d"');
    expect(admission).toContain('routedSurface === "character"');
    expect(admission).toContain('routedSurface === "poser"');
    expect(admission).toContain("CLOSED_INTERACTIVE_3D_SURFACES");
  });

  it("returns route-less mannequin entry to canvas before it takes renderer ownership", () => {
    expect(host).toContain("const normalizeMannequinRoute = useEffectEvent");
    expect(host).toContain('navigateStudio2dSurface("canvas")');
    expect(admission).toContain(
      "return { ...CLOSED_INTERACTIVE_3D_SURFACES, mannequinPoserOpen: true }",
    );
  });
});
