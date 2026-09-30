import { describe, expect, it } from "vitest";

import { ENGINEERING_STORY_GROUPS } from "./engineering-story-groups";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

describe("제작 스토리 읽기 그룹", () => {
  it("공개 챕터는 모두 정확히 한 그룹에 속한다", () => {
    const grouped = ENGINEERING_STORY_GROUPS.flatMap((group) => group.chapterIds);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id).sort());
  });

  it("그룹은 고유한 id와 번역된 제목·소개를 가진다", () => {
    expect(new Set(ENGINEERING_STORY_GROUPS.map((group) => group.id)).size).toBe(ENGINEERING_STORY_GROUPS.length);
    for (const group of ENGINEERING_STORY_GROUPS) {
      expect(group.chapterIds.length, group.id).toBeGreaterThan(0);
      for (const locale of ["ko", "en"] as const) {
        expect(group.title[locale].length, group.id).toBeGreaterThan(1);
        expect(group.intro[locale].length, group.id).toBeGreaterThan(5);
      }
    }
  });

  it("발표 흐름처럼 제품에서 시작해 품질·운영으로 끝난다", () => {
    expect(ENGINEERING_STORY_GROUPS[0]?.chapterIds[0]).toBe("product-intent");
    expect(ENGINEERING_STORY_GROUPS.at(-1)?.id).toBe("quality");
  });
});
