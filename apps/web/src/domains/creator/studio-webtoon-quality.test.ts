import { describe, expect, it } from "vitest";

import {
  analyzeStudioWebtoonQuality,
  placeStudioBalloon,
  synchronizeStudioDialogueBalloon,
} from "./studio-webtoon-quality";

describe("Studio webtoon quality engine", () => {
  it("flags mobile readability and scene rhythm problems without modifying art", () => {
    const report = analyzeStudioWebtoonQuality({
      viewport: { width: 1080, height: 1920, safeInsetTop: 0, safeInsetBottom: 0 },
      cuts: [
        {
          id: "cut-1",
          sceneId: "scene-a",
          bounds: { x: 0, y: 0, width: 1080, height: 1300 },
          faceRects: [{ x: 100, y: 5, width: 300, height: 320 }],
          dialogueCharacterCount: 120,
          balloonCount: 2,
          importance: 1,
        },
        {
          id: "cut-2",
          sceneId: "scene-b",
          bounds: { x: 0, y: 1320, width: 1080, height: 900 },
          faceRects: [],
          dialogueCharacterCount: 10,
          balloonCount: 1,
          importance: 0.8,
        },
      ],
      balloons: [
        {
          id: "b1",
          cutId: "cut-1",
          kind: "dialogue",
          bounds: { x: 40, y: 100, width: 500, height: 300 },
          text: "hello",
          fontSize: 18,
          minimumFontSize: 22,
          readingOrder: null,
        },
      ],
    });

    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "scene-transition-tight",
      "balloon-font-small",
      "reading-order-missing",
    ]));
    expect(report.blockingCount).toBeGreaterThan(0);
    expect(report.rhythm).toHaveLength(2);
  });

  it("syncs source dialogue unless both source and local lettering changed", () => {
    const link = {
      dialogueId: "d1",
      balloonId: "b1",
      sourceRevision: 1,
      localTextOverride: null,
    } as const;
    const synced = synchronizeStudioDialogueBalloon(
      { id: "d1", cutId: "cut-1", kind: "dialogue", text: "Changed", revision: 2 },
      link,
      "Old",
    );
    expect(synced.conflict).toBe(false);
    expect(synced.text).toBe("Changed");
    expect(synced.nextLink.sourceRevision).toBe(2);

    const conflict = synchronizeStudioDialogueBalloon(
      { id: "d1", cutId: "cut-1", kind: "dialogue", text: "Source changed", revision: 3 },
      { ...synced.nextLink, localTextOverride: "Local changed" },
      "Different local edit",
    );
    expect(conflict.conflict).toBe(true);
    expect(conflict.reason).toBe("source-and-local-changed");
  });

  it("places a balloon inside its cut while minimizing occupied overlap", () => {
    const placement = placeStudioBalloon({
      id: "balloon-1",
      cut: { x: 0, y: 0, width: 1000, height: 1000 },
      size: { width: 260, height: 150 },
      preferredAnchor: { x: 500, y: 250 },
      occupied: [{ x: 370, y: 175, width: 260, height: 150 }],
      margin: 32,
    });

    expect(placement.bounds.x).toBeGreaterThanOrEqual(32);
    expect(placement.bounds.y).toBeGreaterThanOrEqual(32);
    expect(placement.bounds.x + placement.bounds.width).toBeLessThanOrEqual(968);
    expect(placement.bounds.y + placement.bounds.height).toBeLessThanOrEqual(968);
    expect(Math.min(...placement.overlaps)).toBe(0);
  });
});
