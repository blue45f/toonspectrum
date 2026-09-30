// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { Compass } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SiteLinkCard } from "./site-link-card";
import { SitePageHeader } from "./site-page-header";

afterEach(cleanup);

describe("public page primitives", () => {
  it("renders the shared header grammar: eyebrow, one h1, description, children and actions in order", () => {
    render(
      <SitePageHeader
        eyebrow="DISCOVER"
        icon={Compass}
        title="작품 탐색"
        titleId="discover-title"
        description="한 줄 설명"
        actions={<button type="button">주요 행동</button>}
        aside={<p>보조 영역</p>}
        asideClassName="hidden lg:block"
      >
        <input aria-label="검색" />
      </SitePageHeader>,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "작품 탐색" });
    expect(heading.id).toBe("discover-title");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const search = screen.getByRole("textbox", { name: "검색" });
    const action = screen.getByRole("button", { name: "주요 행동" });
    expect(heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("보조 영역").parentElement?.className).toContain("hidden lg:block");
    expect(document.querySelector("[data-site-page-header]")?.getAttribute("data-site-page-header")).toBe("panel");
  });

  it("uses a plain divider surface for workspace pages", () => {
    render(<SitePageHeader surface="plain" eyebrow="SETTINGS" title="설정" />);
    expect(document.querySelector("[data-site-page-header]")?.getAttribute("data-site-page-header")).toBe("plain");
    expect(screen.queryByText("한 줄 설명")).toBeNull();
  });

  it("makes the whole destination card one keyboard-reachable link with its title and description", () => {
    render(
      <MemoryRouter>
        <SiteLinkCard href="/explore" icon={Compass} title="조건으로 탐색" description="장르·태그로 좁히기" cta="열기" />
        <SiteLinkCard layout="compact" href="/ranking" icon={Compass} title="통합 랭킹" description="여러 신호로 비교" />
      </MemoryRouter>,
    );

    const card = screen.getByRole("link", { name: /조건으로 탐색.*장르·태그로 좁히기.*열기/ });
    expect(card.getAttribute("href")).toBe("/explore");
    expect(card.getAttribute("data-site-link-card")).toBe("default");
    const compact = screen.getByRole("link", { name: /통합 랭킹/ });
    expect(compact.getAttribute("data-site-link-card")).toBe("compact");
    expect(compact.textContent).not.toContain("열기");
  });
});
