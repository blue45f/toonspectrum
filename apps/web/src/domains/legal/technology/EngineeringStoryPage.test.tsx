// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringDeckPage } from "./EngineeringDeckPage";
import { EngineeringFieldNotesPage } from "./EngineeringFieldNotesPage";
import { EngineeringGuidesPage } from "./EngineeringGuidesPage";
import { EngineeringLicensesPage } from "./EngineeringLicensesPage";
import { EngineeringStoryPage } from "./EngineeringStoryPage";
import { EngineeringVideosPage } from "./EngineeringVideosPage";

vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("engineering story pages", () => {
  it("renders all chapters with status, evidence and a reusable guide path", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/story"]}>
        <EngineeringStoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /기술 스토리 목차|Engineering story table of contents/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /기술과 신뢰|Technology & trust/u }).getAttribute("aria-current"))
      .toBe("location");
    expect(screen.getByRole("link", { name: /제작 스토리|Story/u }).getAttribute("aria-current"))
      .toBe("page");
    expect(document.querySelectorAll("article[id]")).toHaveLength(15);
    expect(screen.getByRole("link", { name: /적용 가이드 열기|Open implementation guides/u }).getAttribute("href"))
      .toBe("/about/technology/guides");
  });

  it("filters implementation guides without hiding the product boundaries", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/guides"]}>
        <EngineeringGuidesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Toss 인증|Toss authentication/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /CI와 선택형 Testifly 포털|CI and optional Testifly portal/u })).toBeTruthy();

    const liveFilter = screen.getByRole("button", { name: /^운영$|^Live$/u });
    fireEvent.click(liveFilter);
    expect(liveFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: /성능 예산|Performance budget/u })).toBeTruthy();
  });

  it("filters field notes while retaining Open API, troubleshooting and reference evidence", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/field-notes"]}>
        <EngineeringFieldNotesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: /기술 심화|Field notes/u }).getAttribute("aria-current"))
      .toBe("page");
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(12);
    expect(screen.getByRole("heading", { name: /Open API마다|Rights, provenance/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /실패를 숨기지 않고|Failures converted/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /참고한 제품|Reference products/u })).toBeTruthy();

    const threeDFilter = screen.getByRole("button", { name: /^Blender · 3D$/u });
    fireEvent.click(threeDFilter);
    expect(threeDFilter.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('[data-engineering-field-note="three-d-dcc"]')).toHaveLength(2);
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /^전체$|^All$/u }));
    const search = screen.getByRole("searchbox", { name: /기술 노트 검색|Search field notes/u });
    fireEvent.change(search, { target: { value: "MediaPipe" } });
    expect(document.querySelectorAll('[data-engineering-field-note-id="browser-local-ai"]')).toHaveLength(1);
    expect(document.querySelectorAll("[data-engineering-field-note]")).toHaveLength(1);
    expect(screen.getByText(/1개 \/ 전체 12개 노트|1 of 12 notes/u)).toBeTruthy();
  });

  it("supports presentation navigation and exact nested current-location semantics", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/deck"]}>
        <EngineeringDeckPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /기술과 신뢰|Technology & trust/u }).getAttribute("aria-current"))
      .toBe("location");
    expect(screen.getByRole("link", { name: /발표 모드|Deck/u }).getAttribute("aria-current"))
      .toBe("page");

    const previous = screen.getByRole("button", { name: /이전|Previous/u });
    const next = screen.getByRole("button", { name: /다음|Next/u });
    const notes = screen.getByRole("button", { name: /발표자 노트|Speaker notes/u });
    expect(previous.hasAttribute("disabled")).toBe(true);

    notes.focus();
    fireEvent.keyDown(notes, { key: " " });
    expect(previous.hasAttribute("disabled")).toBe(true);

    fireEvent.click(next);
    expect(previous.hasAttribute("disabled")).toBe(false);
    fireEvent.keyDown(document, { key: "Home" });
    expect(previous.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /기술 세미나 · 20장|Engineering seminar · 20 slides/u }));
    for (let step = 0; step < 11; step += 1) fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(
      document.querySelector('[data-engineering-deck-shell] [data-deck-slide] h2')?.textContent,
    ).toMatch(/Worker를 하나의 만능|Workers are task-specific/u);
  });

  it("renders the reviewable film and rights surfaces from the shared story model", () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/about/technology/videos"]}>
        <EngineeringVideosPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /영상도 페이지와 같은 사실|film.*same facts/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /검토 가능한 렌더 파이프라인|Reviewable render pipeline/u })).toBeTruthy();
    expect(document.querySelector('[aria-labelledby="storyboard-title"] ol')?.children).toHaveLength(7);
    unmount();

    render(
      <MemoryRouter initialEntries={["/about/technology/licenses"]}>
        <EngineeringLicensesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: /라이선스|Licensing/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /사용한 기술|Document what each technology/u })).toBeTruthy();
  });
});
