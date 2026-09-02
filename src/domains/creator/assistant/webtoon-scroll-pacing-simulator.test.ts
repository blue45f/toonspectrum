import { describe, expect, it } from "vitest";

import {
  WebtoonScrollPacingSimulator,
  type PanelVerticalSpan,
} from "./webtoon-scroll-pacing-simulator";

describe("WebtoonScrollPacingSimulator", () => {
  const simulator = new WebtoonScrollPacingSimulator();

  it("handles empty panels gracefully", () => {
    const res = simulator.analyze([], 5000);
    expect(res.panelCount).toBe(0);
    expect(res.pacingHealthScore).toBe(100);
  });

  it("classifies diverse gutter distances into appropriate narrative beats", () => {
    const panels: PanelVerticalSpan[] = [
      { id: "p1", topY: 100, bottomY: 600, heightPx: 500, dialogueCount: 1 },
      { id: "p2", topY: 720, bottomY: 1200, heightPx: 480, dialogueCount: 2 }, // gutter 120 (action-rush)
      { id: "p3", topY: 1470, bottomY: 2000, heightPx: 530, dialogueCount: 1 }, // gutter 270 (dialogue-beat)
      { id: "p4", topY: 2500, bottomY: 3000, heightPx: 500, dialogueCount: 0 }, // gutter 500 (scene-transition)
      { id: "p5", topY: 3800, bottomY: 4500, heightPx: 700, dialogueCount: 1 }, // gutter 800 (suspense-cliffhanger)
    ];

    const res = simulator.analyze(panels, 5000);

    expect(res.panelCount).toBe(5);
    expect(res.beats.length).toBe(4);
    expect(res.beats[0].beatType).toBe("action-rush");
    expect(res.beats[1].beatType).toBe("dialogue-beat");
    expect(res.beats[2].beatType).toBe("scene-transition");
    expect(res.beats[3].beatType).toBe("suspense-cliffhanger");
    expect(res.warnings.length).toBe(0);
    expect(res.pacingHealthScore).toBeGreaterThanOrEqual(90);
  });

  it("flags excessive void gaps greater than 1200px", () => {
    const panels: PanelVerticalSpan[] = [
      { id: "p1", topY: 0, bottomY: 500, heightPx: 500 },
      { id: "p2", topY: 2000, bottomY: 2500, heightPx: 500 }, // gutter 1500px!
    ];

    const res = simulator.analyze(panels, 3000);

    expect(res.beats[0].beatType).toBe("excessive-void");
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("너무 길어");
    expect(res.pacingHealthScore).toBeLessThan(90);
  });

  it("calculates estimated reading times across casual, skimmer, and immersive profiles", () => {
    const panels: PanelVerticalSpan[] = [
      { id: "p1", topY: 100, bottomY: 600, heightPx: 500, dialogueCount: 2 },
      { id: "p2", topY: 850, bottomY: 1400, heightPx: 550, dialogueCount: 3 },
    ];

    const res = simulator.analyze(panels, 2000);

    expect(res.estimatedReadingSeconds.casual).toBeGreaterThan(
      res.estimatedReadingSeconds.skimmer,
    );
    expect(res.estimatedReadingSeconds.immersive).toBeGreaterThan(
      res.estimatedReadingSeconds.casual,
    );
  });
});
