import { describe, expect, it } from "vitest";

import { STUDIO_AUTHORED_SCENE_TEMPLATES } from "./studio-authored-scene-templates";
import { STUDIO_AUTHORED_SCENE_TEMPLATES_V2 } from "./studio-authored-scene-templates-v2";
import { summarizeStudioSceneTemplate } from "./studio-scene-template-summary";

const LEGACY_IDS = [
  "school-exam-silence", "school-locker-note", "daily-office-negotiation",
  "daily-transit-departure", "daily-phone-read-receipt", "romance-cafe-empty-seat",
  "romance-parallel-thoughts", "fantasy-royal-letter", "fantasy-portal-choice",
  "action-security-monitor", "action-knock-suspense", "narrative-time-montage",
  "narrative-chapter-divider", "narrative-creator-update",
];

describe("authored situation compositions", () => {
  it("preserves fourteen legacy compositions and appends eighteen independent V2 compositions", () => {
    expect(STUDIO_AUTHORED_SCENE_TEMPLATES_V2).toHaveLength(18);
    expect(STUDIO_AUTHORED_SCENE_TEMPLATES).toHaveLength(32);
    expect(STUDIO_AUTHORED_SCENE_TEMPLATES.slice(0, 14).map((template) => template.id)).toEqual(LEGACY_IDS);
    expect(STUDIO_AUTHORED_SCENE_TEMPLATES.slice(14)).toEqual(STUDIO_AUTHORED_SCENE_TEMPLATES_V2);
    expect(new Set(STUDIO_AUTHORED_SCENE_TEMPLATES.map((template) => template.id)).size).toBe(32);
    const shapes = STUDIO_AUTHORED_SCENE_TEMPLATES.map((template) => JSON.stringify(template.build(0, 0).map((seed) => [seed.type, seed.x, seed.y, seed.width, "height" in seed ? seed.height : seed.fontSize])));
    expect(new Set(shapes).size).toBe(32);
  });

  it.each(STUDIO_AUTHORED_SCENE_TEMPLATES)("keeps $id editable, bounded and origin-relative", (template) => {
    const summary = summarizeStudioSceneTemplate(template);
    expect(summary.width).toBe(720);
    expect(summary.height).toBeGreaterThan(0);
    // The scroll-reveal composition intentionally spans a 1080px vertical scene.
    if (template.id === "narrative-scroll-reveal") expect(summary.height).toBe(1080);
    else expect(summary.height).toBeLessThan(1000);
    const base = template.build(0, 0);
    const moved = template.build(21, -30);
    expect(base.length).toBeGreaterThan(1);
    expect(base.length).toBeLessThanOrEqual(120);
    expect(moved).toHaveLength(base.length);
    base.forEach((seed, index) => {
      const height = seed.type === "text" ? seed.fontSize * 1.5 : seed.height;
      expect(["frame", "bubble", "text", "focusLines", "speedLines"]).toContain(seed.type);
      expect([seed.x, seed.y, seed.width, height].every(Number.isFinite)).toBe(true);
      expect(seed.x).toBeGreaterThanOrEqual(0);
      expect(seed.y).toBeGreaterThanOrEqual(0);
      expect(seed.width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(seed.x + seed.width).toBeLessThanOrEqual(summary.width);
      expect(seed.y + height).toBeLessThanOrEqual(summary.height);
      expect(moved[index]).toEqual({ ...seed, x: seed.x + 21, y: seed.y - 30 });
    });
    const fresh = template.build(0, 0);
    base.forEach((seed, index) => {
      expect(fresh[index]).not.toBe(seed);
      seed.x += 999;
    });
    expect(template.build(0, 0)).toEqual(fresh);
  });

  it.each([
    { x: NaN }, { y: Infinity }, { width: 0 }, { height: 0 },
    { width: 8193 }, { height: 16001 },
  ])("rejects invalid or oversized schematic dimensions: %j", (change) => {
    const bad = {
      ...STUDIO_AUTHORED_SCENE_TEMPLATES[0],
      build: () => [{ type: "frame" as const, x: 0, y: 0, width: 10, height: 10, ...change }],
    };
    expect(() => summarizeStudioSceneTemplate(bad)).toThrow();
  });

  it("rejects excess elements without relaxing the preview resource budget", () => {
    const bad = {
      ...STUDIO_AUTHORED_SCENE_TEMPLATES[0],
      build: () => Array.from({ length: 121 }, () => ({ type: "frame" as const, x: 0, y: 0, width: 10, height: 10 })),
    };
    expect(() => summarizeStudioSceneTemplate(bad)).toThrow();
  });
});
