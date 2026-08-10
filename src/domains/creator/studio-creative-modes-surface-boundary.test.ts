import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The creative-modes pill and its panel are the only bottom-anchored Studio chrome that is not
 * owned by the mobile dock module, and they used to break two rules at once on a touch viewport:
 *
 *  - the pill sat at `bottom-4 z-[69]`, on top of the dock (`bottom-0 z-[55]`), so `elementFromPoint`
 *    at the centre of the 선택 and 펜 buttons returned the pill and the tools never armed;
 *  - the panel was 730px tall inside a 640px viewport, its only close button rendered at y=-106,
 *    and there was no Escape handler and no backdrop — nothing on screen could close it.
 *
 * These are source-shape assertions on purpose: the surface lives inside a 42k-line component that
 * no unit test renders, and the rules it must keep are structural.
 */
const source = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function classNameOf(marker: string): string {
  const anchor = source.indexOf(marker);
  expect(anchor).toBeGreaterThan(-1);
  const className = /className="([^"]+)"/u.exec(source.slice(anchor, anchor + 2_000));
  expect(className).not.toBeNull();
  return className![1]!;
}

describe("Studio creative modes surface", () => {
  it("lifts the mobile launcher off the editing dock while keeping the desktop position", () => {
    const className = classNameOf('data-studio-creative-modes-trigger="true"');

    expect(className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4rem)]");
    expect(className).toContain("lg:bottom-4");
    // Above the dock, but below the transient selection bar and coach (z-53).
    expect(className).toContain("z-[52]");
    expect(className).toContain("lg:z-[69]");
    expect(/(?:^|\s)bottom-4(?:\s|$)/u.test(className)).toBe(false);
  });

  it("clamps the panel to the viewport and scrolls inside it", () => {
    const className = classNameOf('data-studio-creative-modes-panel="true"');

    expect(className).toContain("max-h-[calc(100dvh-var(--studio-canvas-bottom-inset,7rem)-4rem)]");
    expect(className).toContain("lg:max-h-[calc(100dvh-5rem)]");
    expect(className).toContain("overflow-hidden");
    expect(source).toContain('data-studio-creative-modes-scroll="true"');
    expect(source).toMatch(/data-studio-creative-modes-scroll="true"\s*\n\s*className="[^"]*overflow-y-auto/u);
  });

  it("keeps three working dismissals: a 44px close button, Escape and an outside press", () => {
    expect(classNameOf('data-studio-creative-modes-close="true"')).toContain("size-11");
    expect(source).toContain("attachStudioDismissableSurface({");
    expect(source).toMatch(
      /ignore: \[creativeModesTriggerRef\.current\],\s*\n\s*onDismiss: \(\) => setCreativeModesOpen\(false\),\s*\n\s*surface,/u,
    );
    expect(source).toContain('role="dialog"\n      aria-label={creativeModesLabel}');
  });

  it("routes the launcher and close labels through the locale packs", () => {
    expect(source).toContain(
      'localizeStudioText(t, "크리에이티브 모드", "studio.creativeModes.title")',
    );
    expect(source).toContain('localizeStudioText(t, "닫기", "common.close")');
    expect(source).not.toContain(">\n      크리에이티브 모드\n    </button>");
  });
});
