// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringPlaybookPage } from "./EngineeringPlaybookPage";
import { ENGINEERING_PLAYBOOK_DOSSIERS, ENGINEERING_PLAYBOOK_PRINCIPLES } from "./engineering-playbook-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

function renderPlaybook() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/playbook"]}>
      <EngineeringPlaybookPage />
    </MemoryRouter>,
  );
}

describe("EngineeringPlaybookPage", () => {
  it("원칙과 아키텍처 결정만 다루고, 목차의 모든 항목이 본문으로 이어진다", () => {
    renderPlaybook();

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    const techNav = screen.getByRole("navigation", { name: /기술 문서 메뉴|Engineering documents/u });
    expect(within(techNav).getByRole("link", { name: /플레이북|Playbook/u }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();

    const principles = document.getElementById("principles");
    if (!principles) throw new Error("principles section is missing");
    expect(within(principles).getAllByRole("listitem")).toHaveLength(ENGINEERING_PLAYBOOK_PRINCIPLES.length);
    expect(document.querySelectorAll('article[id^="dossier-"]')).toHaveLength(ENGINEERING_PLAYBOOK_DOSSIERS.length);
    expect(screen.getByRole("heading", { name: /경쟁 제품을 기능 체크리스트|Read competing products/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /AI를 제품 기능|Separate AI product/u })).toBeTruthy();

    const [toc] = screen.getAllByRole("navigation", { name: /기술 플레이북 목차|Engineering playbook sections/u });
    if (!toc) throw new Error("playbook table of contents is missing");
    const links = within(toc).getAllByRole("link");
    // 원칙 1 + 결정 10 + 벤치마크·AI·이동 안내 3
    expect(links).toHaveLength(ENGINEERING_PLAYBOOK_DOSSIERS.length + 4);
    for (const link of links) {
      const target = link.getAttribute("href")?.slice(1) ?? "";
      expect(document.getElementById(target), target).not.toBeNull();
    }
  });

  it("다른 페이지와 겹치던 영상·세미나·재사용 자료는 목적 페이지로 연결만 한다", () => {
    renderPlaybook();

    expect(screen.queryByRole("heading", { name: /필요한 모듈만 골라도|technical talk that stays coherent/u })).toBeNull();
    const relocated = document.getElementById("relocated");
    if (!relocated) throw new Error("relocated section is missing");
    expect(within(relocated).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/guides#blueprints",
      "/about/technology/deck",
      "/about/technology/videos#film-treatments",
    ]);
    expect(screen.getByRole("link", { name: /전체 기술 챕터|All engineering chapters/u }).getAttribute("href"))
      .toBe("/about/technology/story");

    const pager = screen.getByRole("navigation", { name: /기술 문서 이어보기|Continue through/u });
    expect(within(pager).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/about/technology/story",
      "/about/technology/guides",
    ]);
  });
});
