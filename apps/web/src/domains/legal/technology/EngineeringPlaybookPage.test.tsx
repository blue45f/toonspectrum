// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringPlaybookPage } from "./EngineeringPlaybookPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("EngineeringPlaybookPage", () => {
  it("publishes the service, benchmark, AI, film, seminar and reuse story in one navigable surface", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/playbook"]}>
        <EngineeringPlaybookPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    fireEvent.click(screen.getByText(/소개·기술 문서 둘러보기|Browse service and engineering documents/u));
    expect(screen.getByRole("link", { name: /플레이북|Playbook/u }).getAttribute("aria-current"))
      .toBe("page");
    expect(screen.getByRole("navigation", { name: /기술 플레이북 목차|Engineering playbook sections/u })).toBeTruthy();
    expect(document.querySelectorAll('article[id^="dossier-"]')).toHaveLength(10);
    expect(screen.getByRole("heading", { name: /경쟁 제품을 기능 체크리스트|Read competing products/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /AI를 제품 기능|Separate AI product/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /필요한 모듈만 골라도|technical talk that stays coherent/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /전체 기술 챕터|All engineering chapters/u }).getAttribute("href"))
      .toBe("/about/technology/story");
  });

  it("관련 문서를 펼치기 전에도 제목과 모든 본문 절에 바로 접근할 수 있다", () => {
    render(<MemoryRouter initialEntries={["/about/technology/playbook"]}><EngineeringPlaybookPage /></MemoryRouter>);

    const disclosure = screen.getByText(/소개·기술 문서 둘러보기|Browse service and engineering documents/u).closest("details");
    expect(disclosure?.open).toBe(false);
    expect(screen.getByRole("heading", { level: 1 }).closest("details")).toBeNull();
    const contents = screen.getByRole("navigation", { name: /기술 플레이북 목차|Engineering playbook sections/u });
    const links = within(contents).getAllByRole("link");
    expect(contents.closest("details")).toBeNull();
    expect(links).toHaveLength(7);
    for (const link of links) {
      const target = link.getAttribute("href")?.slice(1);
      expect(target).toBeTruthy();
      expect(document.getElementById(target ?? "")).not.toBeNull();
    }

    fireEvent.click(screen.getByText(/소개·기술 문서 둘러보기|Browse service and engineering documents/u));
    expect(disclosure?.open).toBe(true);
    expect(screen.getByRole("navigation", { name: /ToonStudio 소개 메뉴|ToonStudio introduction/u })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /기술 스토리 세부 메뉴|Engineering story sections/u })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: /서비스 소개와 기술 스토리 흐름|Service and engineering story journey/u })).toBeTruthy();
  });
});
