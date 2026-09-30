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
import {
  SEMINAR_PREP_CHECKLIST,
  SEMINAR_PREP_PATH_30MIN,
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
    expect(wasmCard).toBeTruthy();
    const chapterLink = within(wasmCard as HTMLElement).getByRole("link", { name: "brush-engine" });
    expect(chapterLink.getAttribute("href")).toBe("/about/technology/story#brush-engine");
  });
});

describe("seminar prep content", () => {
  it("builds a 30-minute arc that ends on time", () => {
    expect(SEMINAR_PREP_PATH_30MIN.length).toBeGreaterThanOrEqual(8);
    let cursor = 0;
    for (const step of SEMINAR_PREP_PATH_30MIN) {
      expect(step.startMinute).toBe(cursor);
      expect(step.endMinute).toBeGreaterThan(step.startMinute);
      expect(step.speakLine.ko.length).toBeGreaterThan(10);
      cursor = step.endMinute;
    }
    expect(cursor).toBeLessThanOrEqual(30);
  });

  it("answers ten anticipated questions with glossary links", () => {
    expect(SEMINAR_PREP_QUESTIONS).toHaveLength(10);
    const glossaryIds = new Set(ENGINEERING_GLOSSARY.map((t) => t.id));
    for (const item of SEMINAR_PREP_QUESTIONS) {
      expect(item.answer.ko.length).toBeGreaterThan(20);
      if (item.glossaryId) expect(glossaryIds.has(item.glossaryId)).toBe(true);
    }
    expect(SEMINAR_PREP_CHECKLIST.length).toBeGreaterThanOrEqual(5);
  });
});

describe("EngineeringSeminarPrep", () => {
  it("renders the 30-minute path, questions and checklist", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/deck"]}>
        <EngineeringSeminarPrep />
      </MemoryRouter>,
    );

    expect(screen.getByText(/오늘 밤 이것만 준비하세요|Tonight, prepare just this/u)).toBeTruthy();
    expect(screen.getByText(/30분 추천 구성|Recommended 30-minute arc/u)).toBeTruthy();
    // 9개 구간
    expect(screen.getAllByText(/0:00–2:00|2:00–5:00/u).length).toBeGreaterThan(0);
    // 예상 질문 10개
    expect(screen.getByText(/예상 질문 TOP 10|Top 10 anticipated questions/u)).toBeTruthy();
    // 체크리스트
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(SEMINAR_PREP_CHECKLIST.length);
    fireEvent.click(checkboxes[0] as HTMLElement);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });
});
