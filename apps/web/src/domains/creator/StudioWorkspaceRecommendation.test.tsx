import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { resolveStudioWorkspaceRecommendation } from "./studio-workspace-recommendation";
import { STUDIO_DEFAULT_WORKSPACES } from "./studio-workspaces";
import { StudioWorkspaceRecommendation } from "./StudioWorkspaceRecommendation";

describe("StudioWorkspaceRecommendation", () => {
  it("renders a compact, accessible one-click transition card", () => {
    const recommendation = resolveStudioWorkspaceRecommendation(
      STUDIO_DEFAULT_WORKSPACES,
      "storyboard"
    );
    if (!recommendation) throw new Error("workspace recommendation missing");

    const html = renderToStaticMarkup(
      <StudioWorkspaceRecommendation recommendation={recommendation} onSelect={vi.fn()} />
    );

    expect(html).toContain('data-testid="studio-workspace-recommendation"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain("빠른 스케치");
    expect(html).toContain("처음이라면 가장 단순한 화면으로 시작하세요.");
    expect(html).toContain("캔버스 우선 · 되돌리기 · 펜 · 지우개 중심");
    expect(html).toContain('aria-label="빠른 스케치 작업공간으로 전환"');
    expect(html).toContain('data-workspace-id="quick-sketch"');
    expect(html).toContain("min-h-11");
  });
});
