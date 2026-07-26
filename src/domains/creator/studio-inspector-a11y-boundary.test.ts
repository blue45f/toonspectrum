import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const inspectorSources = [
  {
    file: "StudioInspectorAside.tsx",
    source: readFileSync(new URL("./StudioInspectorAside.tsx", import.meta.url), "utf8"),
  },
  {
    file: "StudioInspectorFocusSpeedFrameControls.tsx",
    source: readFileSync(
      new URL("./StudioInspectorFocusSpeedFrameControls.tsx", import.meta.url),
      "utf8"
    ),
  },
  {
    file: "StudioInspectorCanvasControls.tsx",
    source: readFileSync(
      new URL("./StudioInspectorCanvasControls.tsx", import.meta.url),
      "utf8"
    ),
  },
  {
    file: "StudioPercentGuideControls.tsx",
    source: readFileSync(
      new URL("./StudioPercentGuideControls.tsx", import.meta.url),
      "utf8"
    ),
  },
  {
    file: "StudioInspectorBubbleAppearanceControls.tsx",
    source: readFileSync(
      new URL("./StudioInspectorBubbleAppearanceControls.tsx", import.meta.url),
      "utf8"
    ),
  },
] as const;
const inspectorSource = inspectorSources.map(({ source }) => source).join("\n");

describe("Studio inspector accessibility boundary", () => {
  it("keeps inspector-only form controls explicitly named", () => {
    expect(inspectorSource).toContain('가이드 #${index + 1} 위치');
    expect(inspectorSource).toContain('aria-label="선 색상"');
    expect(inspectorSource).toContain('aria-label="채우기 색상"');
    expect(inspectorSource).toContain('aria-label="말풍선 배경 투명"');
    expect(inspectorSource).toContain('aria-label="말풍선 테두리 커스텀"');
    expect(inspectorSource).toContain('aria-label="말풍선 그림자 사용"');
    expect(inspectorSource).toContain('aria-label="글자 외곽선 사용"');
    expect(inspectorSource).toContain('aria-label="글자 그림자 사용"');
    expect(inspectorSource).toContain('aria-label="패널 테두리 커스텀"');
  });

  it("never removes the native outline without a focus-visible replacement", () => {
    const violations = inspectorSources.flatMap(({ file, source }) =>
      source
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(
          ({ line }) => line.includes("outline-none") && !line.includes("focus-visible:outline")
        )
        .map(({ number }) => `${file}:${number}`)
    );

    expect(violations).toEqual([]);
    expect(inspectorSource.match(/focus-visible:outline-accent/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
  });
});
