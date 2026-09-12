import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("source hydration recovery ownership", () => {
  const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
  const start = host.indexOf("const [sourceHydrationAttempt,");
  const end = host.indexOf("sourceHydrationAttempt,", start + 60);
  const hydration = host.slice(start, end + 200);

  it("does not classify an unresolved auth session as an anonymous source request", () => {
    expect(start).toBeGreaterThan(-1);
    const gate = hydration.indexOf("if (!studioAuthReady) return;");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(hydration.indexOf("async function loadStudioWork"));
    expect(hydration).toContain("studioAuthReady,");
  });

  it("prepares optional schedule data before changing canvas state and rejects stale responses", () => {
    expect(hydration).toContain("normalizeStudioReleaseScheduleDeferred(doc?.releaseSchedule)");
    expect(hydration).not.toContain("loadStudioReleaseScheduleRuntime()");
    expect(hydration).toContain("if (!alive || controller.signal.aborted) return;");
    expect(hydration).toContain("controller.abort()");
    expect(hydration).toContain("setWorkHydrationFailed(true)");
    expect(hydration).toContain("setWorkHydrationError(message)");
  });

  it("passes an in-place retry action all the way to the locked canvas", () => {
    expect(host).toContain("onRetrySourceHydration={retrySourceHydration}");
    const viewport = readFileSync(new URL("./canvas/StudioCanvasViewport.tsx", import.meta.url), "utf8");
    expect(viewport.match(/onRetrySourceHydration/gu)?.length).toBeGreaterThanOrEqual(2);
    const column = readFileSync(new URL("./studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx", import.meta.url), "utf8");
    expect(column).toContain("onRetrySourceHydration={onRetrySourceHydration}");
  });
});
