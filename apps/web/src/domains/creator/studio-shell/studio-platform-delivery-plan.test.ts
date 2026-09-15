import { describe, expect, it } from "vitest";

import { createStudioPlatformDeliveryPlan } from "./studio-platform-delivery-plan";

const DOCUMENT = {
  id: "episode-1",
  title: "EP01 원고",
  kind: "webtoon" as const,
  width: 800,
  height: 1_280,
  pageCount: 1,
};

describe("studio platform delivery plan", () => {
  it("builds a source-aware checklist for a matching WEBTOON CANVAS document", () => {
    const plan = createStudioPlatformDeliveryPlan({
      projectId: "project-1",
      document: DOCUMENT,
      platformId: "webtoon-canvas",
      format: "jpg",
      generatedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(plan.status).toBe("ready");
    expect(plan.grade).toBe("pass");
    expect(plan.recommendedSliceCount).toBe(1);
    expect(plan.checklist).toMatchObject({
      projectId: "project-1",
      document: { id: "episode-1", width: 800, height: 1_280 },
      platform: { id: "webtoon-canvas", snapshotDate: "2026-09-03" },
      output: { format: "jpg", recommendedSliceCount: 1 },
      result: { grade: "pass", compliant: true },
    });
  });

  it("blocks a corroborated width mismatch instead of silently resizing", () => {
    const plan = createStudioPlatformDeliveryPlan({
      projectId: "project-1",
      document: DOCUMENT,
      platformId: "naver-webtoon",
      format: "jpg",
      generatedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.grade).toBe("fail");
    expect(plan.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "width", grade: "fail" }),
    ]));
  });

  it("does not invent dimensions for a document that has no canvas metadata", () => {
    const plan = createStudioPlatformDeliveryPlan({
      projectId: "project-1",
      document: { ...DOCUMENT, width: null, height: null },
      platformId: "kakao-page",
      generatedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(plan.status).toBe("needs-document-size");
    expect(plan.grade).toBeNull();
    expect(plan.recommendedSliceCount).toBeNull();
    expect(plan.checklist).toBeNull();
  });

  it("falls back to an allowed platform format and preserves source cautions", () => {
    const plan = createStudioPlatformDeliveryPlan({
      projectId: "project-1",
      document: { ...DOCUMENT, width: 690 },
      platformId: "naver-webtoon",
      format: "webp",
      generatedAt: "2026-09-16T00:00:00.000Z",
    });

    expect(plan.format).toBe("jpg");
    expect(plan.requiresOfficialRecheck).toBe(true);
    expect(plan.checklist?.platform.sourceStatus).not.toBe("official");
  });
});
