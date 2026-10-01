// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringGlossaryPage } from "./EngineeringGlossaryPage";
import { EngineeringSeminarPrep } from "./EngineeringSeminarPrep";
import {
  ENGINEERING_GLOSSARY,
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERM_COUNT,
} from "./engineering-glossary-content";
import { buildDeckTrack } from "./engineering-deck-model";
import { resolveGlossaryLink } from "./engineering-glossary-links";
import {
  SEMINAR_PREP_CHECKLIST,
  SEMINAR_PREP_QUESTIONS,
} from "./engineering-seminar-prep-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("engineering glossary content", () => {
  it("covers every category with definition, analogy and real usage", () => {
    expect(GLOSSARY_TERM_COUNT).toBeGreaterThanOrEqual(35);
    expect(ENGINEERING_GLOSSARY.length).toBe(GLOSSARY_TERM_COUNT);
    const categoryIds = new Set(GLOSSARY_CATEGORIES.map((c) => c.id));
    for (const term of ENGINEERING_GLOSSARY) {
      expect(categoryIds.has(term.category)).toBe(true);
      expect(term.definition.ko.length).toBeGreaterThan(10);
      expect(term.analogy.ko.length).toBeGreaterThan(10);
      expect(term.inToonstudio.ko.length).toBeGreaterThan(10);
      // 영어 번역 누락 방지
      expect(term.definition.en.length).toBeGreaterThan(10);
      expect(term.analogy.en.length).toBeGreaterThan(10);
    }
    // id 중복 방지
    const ids = ENGINEERING_GLOSSARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links every ‘read more’ id to an existing story, guide or reference anchor", () => {
    for (const term of ENGINEERING_GLOSSARY) {
      for (const id of term.chapters) {
        const target = resolveGlossaryLink(id);
        expect(target, `${term.id} -> ${id}`).toBeDefined();
        expect(target?.href).toMatch(new RegExp(`^/about/technology/(story|guides|references)#${id}$`, "u"));
      }
    }
    expect(resolveGlossaryLink("pwa-safe-update")?.page).toBe("guides");
    expect(resolveGlossaryLink("threejs-r3f")?.page).toBe("references");
  });

  it("keeps every category non-empty", () => {
    for (const category of GLOSSARY_CATEGORIES) {
      const count = ENGINEERING_GLOSSARY.filter((t) => t.category === category.id).length;
      expect(count).toBeGreaterThan(0);
    }
  });
});

describe("EngineeringGlossaryPage", () => {
  it("renders all terms with search and category filters", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /기술 용어집|Technology glossary/u })).toBeTruthy();
    // 전체 용어 카드 수
    expect(document.querySelectorAll('article[id^="glossary-"]')).toHaveLength(ENGINEERING_GLOSSARY.length);

    // 검색: WASM
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "WASM" } });
    const cards = document.querySelectorAll('article[id^="glossary-"]');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(ENGINEERING_GLOSSARY.length);

    // 검색 초기화 후 카테고리 필터
    fireEvent.change(search, { target: { value: "" } });
    const brushButton = screen.getByRole("button", { name: /브러시 · 렌더링/u });
    fireEvent.click(brushButton);
    const brushCount = ENGINEERING_GLOSSARY.filter((t) => t.category === "brush").length;
    expect(document.querySelectorAll('article[id^="glossary-"]')).toHaveLength(brushCount);
  });

  it("links glossary terms to story chapters", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/glossary"]}>
        <EngineeringGlossaryPage />
      </MemoryRouter>,
    );
    const wasmCard = document.getElementById("glossary-wasm");
    if (!wasmCard) throw new Error("glossary-wasm card is missing");
    const chapterLink = wasmCard.querySelector('a[data-chapter-id="brush-engine"]');
    expect(chapterLink?.getAttribute("href")).toBe("/about/technology/story#brush-engine");
    // 링크 이름은 챕터 id가 아니라 사람이 읽는 챕터 제목이다.
    expect(within(wasmCard).getAllByRole("link").every((link) => !/^[a-z0-9-]+$/u.test(link.textContent ?? ""))).toBe(true);
  });
});

describe("seminar prep content", () => {
  it("answers ten anticipated questions with glossary links", () => {
    expect(SEMINAR_PREP_QUESTIONS).toHaveLength(10);
    const glossaryIds = new Set(ENGINEERING_GLOSSARY.map((t) => t.id));
    for (const item of SEMINAR_PREP_QUESTIONS) {
      expect(item.answer.ko.length).toBeGreaterThan(20);
      expect(item.answer.en.length).toBeGreaterThan(20);
      if (item.glossaryId) expect(glossaryIds.has(item.glossaryId)).toBe(true);
    }
    expect(SEMINAR_PREP_CHECKLIST.length).toBeGreaterThanOrEqual(5);
  });
});

describe("EngineeringSeminarPrep", () => {
  afterEach(() => window.localStorage.clear());

  it("derives the section schedule from the talk slides and jumps to a section", () => {
    const model = buildDeckTrack("talk", (text) => text.ko);
    const onJump = vi.fn();
    render(
      <MemoryRouter initialEntries={["/about/technology/deck"]}>
        <EngineeringSeminarPrep model={model} onJump={onJump} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 3, name: /구간 시간표 · 총 30:00/u })).toBeTruthy();
    const schedule = screen.getAllByRole("button").filter((button) => /슬라이드 \d+장/u.test(button.textContent ?? ""));
    expect(schedule).toHaveLength(model.sections.length);
    const core = model.sections.find((section) => section.id === "core");
    if (!core) throw new Error("core section is missing");
    const coreButton = schedule.find((button) => button.textContent?.includes(core.title));
    if (!coreButton) throw new Error("core schedule button is missing");
    fireEvent.click(coreButton);
    expect(onJump).toHaveBeenCalledWith(core.firstSlideIndex);

    expect(screen.getByRole("heading", { level: 3, name: /예상 질문 10개/u })).toBeTruthy();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(SEMINAR_PREP_CHECKLIST.length);
    const first = checkboxes[0];
    if (!(first instanceof HTMLInputElement)) throw new Error("checkbox is missing");
    fireEvent.click(first);
    expect(first.checked).toBe(true);
    expect(window.localStorage.getItem("toonstudio-seminar-prep-checklist-v1")).toContain("true");
  });
});
