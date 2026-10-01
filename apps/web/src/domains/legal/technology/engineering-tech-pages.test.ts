import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENGINEERING_AI_WORKBENCH,
  ENGINEERING_BENCHMARK_GROUPS,
  ENGINEERING_PLAYBOOK_DOSSIERS,
  ENGINEERING_PLAYBOOK_PRINCIPLES,
  ENGINEERING_REUSE_BLUEPRINTS,
} from "./engineering-playbook-content";
import {
  ENGINEERING_FIELD_NOTES,
  ENGINEERING_OPEN_APIS,
  ENGINEERING_TROUBLESHOOTING_CASES as FIELD_CASES,
} from "./engineering-field-notes-content";
import { ENGINEERING_TROUBLESHOOTING_CASES as INCIDENT_ARCHIVE } from "./engineering-story-deep-dive-content";
import {
  PUBLISHED_ENGINEERING_CHAPTERS,
  PUBLISHED_ENGINEERING_GUIDES,
} from "./engineering-story-published-content";
import {
  ENGINEERING_PAGES,
  ENGINEERING_PAGE_GROUPS,
  ENGINEERING_PATH_PAGES,
  engineeringPageForPath,
  estimateReadingMinutes,
  findEngineeringPage,
  koreanTexts,
} from "./engineering-tech-pages";

/** 페이지가 실제로 보여주는 본문(요약·접힘 포함)만 모아 읽기 시간을 다시 계산한다. */
const PAGE_TEXTS = {
  story: PUBLISHED_ENGINEERING_CHAPTERS.flatMap((chapter) =>
    koreanTexts([chapter.title, chapter.thesis, chapter.problem, chapter.decision, chapter.userValue, chapter.tradeoff, chapter.reuseSteps])),
  playbook: [
    ...ENGINEERING_PLAYBOOK_PRINCIPLES.flatMap((principle) => koreanTexts([principle.title, principle.body])),
    ...ENGINEERING_PLAYBOOK_DOSSIERS.flatMap((dossier) =>
      koreanTexts([dossier.title, dossier.question, dossier.background, dossier.architecture, dossier.achievements, dossier.portability, dossier.limits])),
    ...ENGINEERING_BENCHMARK_GROUPS.flatMap((group) =>
      koreanTexts([group.title, group.marketSignal, group.observedPatterns, group.learned, group.applied, group.doNotClaim])),
    ...ENGINEERING_AI_WORKBENCH.flatMap((layer) => koreanTexts([layer.layer, layer.use, layer.artifact, layer.guardrail])),
  ],
  guides: [
    ...ENGINEERING_REUSE_BLUEPRINTS.flatMap((blueprint) =>
      koreanTexts([blueprint.title, blueprint.useWhen, blueprint.firstBoundary, blueprint.firstMilestone, blueprint.failureDrill, blueprint.doneEvidence])),
    ...PUBLISHED_ENGINEERING_GUIDES.flatMap((guide) => koreanTexts([guide.title, guide.summary, guide.outcome, guide.steps, guide.checklist])),
  ],
  "field-notes": [
    ...ENGINEERING_FIELD_NOTES.flatMap((note) => koreanTexts([note.title, note.summary, note.problem, note.pattern, note.boundary, note.reuseSteps])),
    ...ENGINEERING_OPEN_APIS.flatMap((api) => koreanTexts([api.purpose, api.access, api.rightsGate, api.resilience])),
    ...FIELD_CASES.flatMap((item) => koreanTexts([item.title, item.symptom, item.rootCause, item.fix, item.prevention])),
    ...INCIDENT_ARCHIVE.flatMap((item) =>
      koreanTexts([item.title, item.symptom, item.wrongTurn, item.rootCause, item.resolution, item.regression, item.lesson])),
  ],
} as const;

describe("기술 문서 페이지 목록", () => {
  it("발표 동선은 스토리 → 플레이북 → 가이드 → 심화 노트 → 발표 모드 다섯 단계다", () => {
    expect(ENGINEERING_PATH_PAGES.map((page) => [page.step, page.id])).toEqual([
      [1, "story"],
      [2, "playbook"],
      [3, "guides"],
      [4, "field-notes"],
      [5, "deck"],
    ]);
  });

  it("모든 페이지는 고유한 경로·짧은 한 줄 메뉴명·한 줄 목적을 가진다", () => {
    expect(new Set(ENGINEERING_PAGES.map((page) => page.id)).size).toBe(ENGINEERING_PAGES.length);
    expect(new Set(ENGINEERING_PAGES.map((page) => page.href)).size).toBe(ENGINEERING_PAGES.length);
    const groups = new Set(ENGINEERING_PAGE_GROUPS.map((group) => group.id));
    for (const page of ENGINEERING_PAGES) {
      expect(page.href.startsWith("/about/technology/"), page.id).toBe(true);
      expect(groups.has(page.group), page.id).toBe(true);
      expect(page.label.ko.length, page.id).toBeLessThanOrEqual(6);
      expect(page.label.en.length, page.id).toBeLessThanOrEqual(12);
      expect(page.purpose.ko.length, page.id).toBeLessThanOrEqual(40);
      expect(page.purpose.ko).not.toContain("\n");
    }
    for (const group of ENGINEERING_PAGE_GROUPS) {
      expect(ENGINEERING_PAGES.some((page) => page.group === group.id), group.id).toBe(true);
    }
  });

  it("모든 페이지 경로가 라우트에 등록되어 있다", () => {
    const routes = readFileSync("apps/web/src/app/routes/groups/legal.routes.tsx", "utf8");
    for (const page of ENGINEERING_PAGES) expect(routes, page.href).toContain(`path: "${page.href}"`);
  });

  it("현재 경로를 정확히 찾고 비슷한 이름의 경로와 혼동하지 않는다", () => {
    expect(engineeringPageForPath("/about/technology/story")?.id).toBe("story");
    expect(engineeringPageForPath("/about/technology/story/")?.id).toBe("story");
    expect(engineeringPageForPath("/about/technology/deck/print")?.id).toBe("deck");
    expect(engineeringPageForPath("/about/technology/storyline")).toBeUndefined();
    expect(engineeringPageForPath("/about/technology")).toBeUndefined();
    expect(findEngineeringPage("glossary").href).toBe("/about/technology/glossary");
  });
});

describe("읽기 시간", () => {
  it.each(Object.entries(PAGE_TEXTS))("%s 페이지의 고정 읽기 시간은 실제 본문으로 계산한 값과 같다", (id, texts) => {
    const page = ENGINEERING_PAGES.find((entry) => entry.id === id);
    expect(page && "readingMinutes" in page ? page.readingMinutes : undefined).toBe(estimateReadingMinutes(texts));
  });

  it("한국어는 공백 제외 글자 수, 영어는 단어 수로 계산하고 최소 1분이다", () => {
    expect(estimateReadingMinutes(["가".repeat(1000)])).toBe(2);
    expect(estimateReadingMinutes(["가 나 다"])).toBe(1);
    expect(estimateReadingMinutes([Array.from({ length: 460 }, () => "word").join(" ")], "en")).toBe(2);
    expect(estimateReadingMinutes([], "en")).toBe(1);
  });

  it("번역 묶음에서 한국어 문장만 모은다", () => {
    expect(koreanTexts([{ ko: "하나", en: "one" }, [{ ko: "둘", en: "two" }, { ko: "셋", en: "three" }], undefined])).toEqual(["하나", "둘", "셋"]);
  });
});
