import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_CHAPTERS,
  ENGINEERING_GUIDES,
  ENGINEERING_LICENSE_GROUPS,
  ENGINEERING_STATUS_META,
  ENGINEERING_VIDEO_FORMATS,
} from "./engineering-story-content";

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

describe("engineering story content", () => {
  it("keeps a complete, ordered and uniquely addressable 15-chapter story", () => {
    expect(ENGINEERING_CHAPTERS).toHaveLength(15);
    expect(unique(ENGINEERING_CHAPTERS.map((chapter) => chapter.id))).toBe(true);
    expect(ENGINEERING_CHAPTERS.map((chapter) => chapter.order)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it("connects every chapter to evidence, reuse steps and bilingual status copy", () => {
    for (const chapter of ENGINEERING_CHAPTERS) {
      expect(chapter.evidence.length, chapter.id).toBeGreaterThan(0);
      expect(chapter.reuseSteps.length, chapter.id).toBeGreaterThan(1);
      expect(chapter.title.ko.trim(), chapter.id).not.toBe("");
      expect(chapter.title.en.trim(), chapter.id).not.toBe("");
      expect(ENGINEERING_STATUS_META[chapter.status].label.ko).toBeTruthy();
      expect(ENGINEERING_STATUS_META[chapter.status].label.en).toBeTruthy();
    }
  });

  it("keeps every published evidence reference attached to a repository path", () => {
    for (const chapter of ENGINEERING_CHAPTERS) {
      for (const item of chapter.evidence) {
        const [repositoryPath] = item.path.split("#", 1);
        expect(existsSync(repositoryPath), `${chapter.id}: missing evidence ${item.path}`).toBe(true);
      }
    }
  });

  it("publishes reusable guides with completion checks and no embedded credentials", () => {
    expect(ENGINEERING_GUIDES.length).toBeGreaterThanOrEqual(8);
    expect(unique(ENGINEERING_GUIDES.map((guide) => guide.id))).toBe(true);
    for (const guide of ENGINEERING_GUIDES) {
      expect(guide.steps.length, guide.id).toBeGreaterThan(2);
      expect(guide.checklist.length, guide.id).toBeGreaterThan(1);
    }

    const serialized = JSON.stringify(ENGINEERING_GUIDES);
    expect(serialized).not.toMatch(/sk-[a-z0-9]{12,}/iu);
    expect(serialized).not.toMatch(/client_secret\s*[:=]\s*["'][^${]/iu);
    expect(serialized).not.toMatch(/api[_-]?key\s*[:=]\s*["'][^${]/iu);
  });

  it("keeps rights families and reviewable video compositions uniquely identified", () => {
    expect(unique(ENGINEERING_LICENSE_GROUPS.map((group) => group.id))).toBe(true);
    expect(unique(ENGINEERING_VIDEO_FORMATS.map((format) => format.id))).toBe(true);
    expect(unique(ENGINEERING_VIDEO_FORMATS.map((format) => format.composition))).toBe(true);
    expect(ENGINEERING_LICENSE_GROUPS.some((group) => group.id === "ai-terms")).toBe(true);
  });
});
