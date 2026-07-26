import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");

function sourceBetween(start: string, end: string): string {
  const startIndex = studioPageSource.indexOf(start);
  const endIndex = studioPageSource.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return studioPageSource.slice(startIndex, endIndex);
}

describe("continuous drawing selection boundary", () => {
  it("does not reopen the properties inspector when a deferred stroke settles", () => {
    const deferredFlush = sourceBetween(
      "flushPendingStrokeCommitsRef.current = () => {",
      "discardPendingStrokeCommitsRef.current = () => {"
    );

    expect(deferredFlush).toContain("queueCommittedStrokeSurfaceHandoff");
    expect(deferredFlush).not.toContain("setSelectedId(");
    expect(deferredFlush).not.toContain('openInspectorRoute({ primary: "properties" }');
  });

  it("keeps pen and shape tools in continuous drawing context after pointerup", () => {
    const pointerRelease = sourceBetween(
      "const finished = releasePlan.stroke;",
      "if (releasePlan.quickShapeAnnouncementKind)"
    );

    expect(pointerRelease).not.toContain("requestAnimationFrame");
    expect(pointerRelease).not.toContain("setSelectedId(");
    expect(studioPageSource).not.toContain("openCompletedStrokeProperties");
  });
});
