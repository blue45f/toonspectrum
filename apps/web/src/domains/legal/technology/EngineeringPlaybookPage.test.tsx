// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringPlaybookPage } from "./EngineeringPlaybookPage";

vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("EngineeringPlaybookPage", () => {
  it("publishes the service, benchmark, AI, film, seminar and reuse story in one navigable surface", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/playbook"]}>
        <EngineeringPlaybookPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
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
});
