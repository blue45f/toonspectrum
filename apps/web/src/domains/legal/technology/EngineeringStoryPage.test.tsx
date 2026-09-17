// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringGuidesPage } from "./EngineeringGuidesPage";
import { EngineeringStoryPage } from "./EngineeringStoryPage";

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
      .toBe("page");
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
});
