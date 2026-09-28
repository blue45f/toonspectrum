import { describe, expect, it } from "vitest";
import { SEMINAR_LESSONS, seminarLessonsForDuration } from "./engineering-seminar-curriculum";
import { clampDeckIndex, parseEngineeringDeckState } from "./engineering-deck-state";
import { buildOfflineEngineeringDeck } from "./engineering-deck-export";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";

describe("기술 세미나 콘텐츠와 상태 계약", () => {
  it.each([[15, 12], [30, 25], [45, 30]] as const)("%s분 구성은 %s장의 연결된 흐름을 제공한다", (minutes, count) => {
    const lessons = seminarLessonsForDuration(minutes);
    expect(lessons).toHaveLength(count);
    expect(lessons[0]?.id).toBe("seminar-opening");
    expect(lessons.at(-1)?.id).toBe("seminar-close");
  });
  it("모든 슬라이드에 번역·대본·질문·구현 챕터 근거가 있다", () => {
    const chapterIds = new Set(PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => chapter.id));
    expect(new Set(SEMINAR_LESSONS.map((lesson) => lesson.id)).size).toBe(30);
    for (const lesson of SEMINAR_LESSONS) {
      expect(chapterIds.has(lesson.chapterId)).toBe(true);
      expect(lesson.points).toHaveLength(3);
      expect(lesson.flow.length).toBeGreaterThanOrEqual(3);
      expect(lesson.technologies.length).toBeGreaterThan(0);
      for (const locale of ["ko", "en"] as const) {
        expect(lesson.title[locale].length).toBeGreaterThan(10);
        expect(lesson.script[locale].length).toBeGreaterThan(120);
        expect(lesson.question[locale].length).toBeGreaterThan(10);
      }
    }
  });
  it("기본은 기술 세미나이며 기존 해시 링크도 유지한다", () => {
    expect(parseEngineeringDeckState("", "")).toEqual({ audience: "seminar", duration: 30, index: 0 });
    expect(parseEngineeringDeckState("?audience=study&duration=45", "")).toEqual({ audience: "study", duration: 45, index: 0 });
    expect(parseEngineeringDeckState("?audience=seminar&duration=15", "#deck=investor:3")).toEqual({ audience: "investor", duration: 15, index: 2 });
  });
  it("잘못된 상태와 범위 밖 위치를 제한한다", () => {
    expect(parseEngineeringDeckState("?audience=unknown&duration=1", "#deck=seminar:Infinity")).toEqual({ audience: "seminar", duration: 30, index: 0 });
    expect(clampDeckIndex(999, 25)).toBe(24);
    expect(clampDeckIndex(-2, 25)).toBe(0);
    expect(clampDeckIndex(Number.NaN, 25)).toBe(0);
    expect(clampDeckIndex(1, 0)).toBe(0);
  });
  it("오프라인 발표본은 외부 리소스 없이 조작 가능하고 콘텐츠 HTML을 이스케이프한다", () => {
    const html = buildOfflineEngineeringDeck([{ id: "demo", eyebrow: "TEST", title: "<img src=x onerror=alert(1)>", body: "A & B", points: ["<script>"], note: "</script><script>alert(1)</script>" }], "ko");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<script>/gu)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:script|img|link)[^>]+(?:src|href)=/u);
    expect(html).toContain("ArrowRight");
    expect(html).toContain("외부 영상과 서비스는 포함하지 않습니다");
  });
});
