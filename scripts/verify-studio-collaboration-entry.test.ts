import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioRoute } from "../apps/web/src/domains/creator/studio-router/studio-route-manifest";
import { STUDIO_DRAFT_CANVAS_PATHNAME } from "../apps/web/src/domains/creator/studio-workspace-route";

const source = readFileSync("scripts/verify-studio-collaboration-sync.mts", "utf8");

describe("collaboration browser entry contract", () => {
  it("opens the canonical editor rather than the non-editor Studio home", () => {
    expect(STUDIO_DRAFT_CANVAS_PATHNAME).toBe("/studio/canvas");
    expect(resolveStudioRoute({ pathname: STUDIO_DRAFT_CANVAS_PATHNAME })).toMatchObject({ kind: "editor" });
    expect(resolveStudioRoute({ pathname: "/studio" })).toMatchObject({ kind: "invalid" });
    expect(source).toContain("pageA.goto(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`");
    expect(source).toContain("fetch(`${origin}${STUDIO_DRAFT_CANVAS_PATHNAME}`)");
    expect(source).not.toContain("pageA.goto(`${origin}/studio`,");
  });

  it("keeps real canvas, room identity and bidirectional pixel convergence mandatory", () => {
    expect(source).toContain("Date.now() + 30_000");
    expect(source).toContain("canvas surface unavailable after 30 seconds at ${page.url()}");
    expect(source).not.toContain('canvas.waitFor({ state: "visible", timeout: 1 })');
    expect(source).toContain("pageB.goto(roomUrl");
    expect(source).toContain("pageC.goto(roomUrl");
    expect(source).toContain('waitForCanvasChange(pageB, blankB, "A -> B remote stroke")');
    expect(source).toContain('waitForCanvasChange(pageA, beforeSecondA, "B -> A remote stroke")');
    expect(source).toContain("late joiner did not restore authored ink");
  });

  it("captures the failed page location and screenshot for future navigation regressions", () => {
    expect(source).toContain("failure-tab-${index}.png");
    expect(source).toContain("url: page.url()");
  });
});
