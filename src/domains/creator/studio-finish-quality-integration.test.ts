import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("Studio finish quality integration", () => {
  it("keeps the inspector in the existing lazy review surface", () => {
    const panel = source("src/domains/creator/StudioContinuityPanel.tsx");
    const stack = source("src/domains/creator/StudioLazyPanelStack.tsx");

    expect(panel).toContain('from "./StudioFinishQualityView"');
    expect(panel).toContain("inspectStudioFinishQuality");
    expect(panel).toContain("qualityPages");
    expect(stack).toContain("qualityPages={pages}");
    expect(stack).toContain("qualityComments={studioComments}");
    expect(stack).toContain("onSelectQualityIssue");
  });

  it("preserves the established continuity action identity while describing the broader audit", () => {
    const actions = source("src/domains/creator/StudioProjectReviewActions.tsx");

    expect(actions).toContain('id: "continuity"');
    expect(actions).toContain('label: "이야기 연속성 검사"');
    expect(actions).toContain("원고 구조·대사·말풍선·이미지·레이어·검토 상태");
  });
});
