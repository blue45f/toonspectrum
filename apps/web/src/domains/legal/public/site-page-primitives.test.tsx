// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Compass } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFilterChips } from "./site-filter-chips";
import { SiteLinkCard } from "./site-link-card";
import { SiteDisclosure } from "./site-disclosure";
import { SitePageHeader } from "./site-page-header";
import { sitePageHeaderArtFor } from "./site-page-header-art";
import { SiteStepList } from "./site-step-list";

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

  it("shows the assigned header art as decoration when no aside is given", () => {
    const { container } = render(
      <SitePageHeader eyebrow="NEWS" title="소식" art={sitePageHeaderArtFor("/news")} />,
    );
    const art = container.querySelector<HTMLImageElement>("[data-site-page-header-art]");
    expect(art?.getAttribute("data-site-page-header-art")).toBe("canvas-noir");
    expect(art?.getAttribute("src")).toBe("/brand/illustrated-20260928/canvas-noir.webp");
    // 장식 아트는 작품·실제 화면으로 읽히지 않는다 (D-1 마스트헤드와 같은 계약).
    expect(art?.alt).toBe("");
    expect(art?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("prefers an explicit aside over header art", () => {
    const { container } = render(
      <SitePageHeader eyebrow="RANKING" title="랭킹" art="hero" aside={<p>보조 영역</p>} />,
    );
    expect(screen.getByText("보조 영역")).toBeTruthy();
    expect(container.querySelector("[data-site-page-header-art]")).toBeNull();
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

  it("keeps a tile card's description for screen readers while showing only icon and name on phones", () => {
    render(
      <MemoryRouter>
        <SiteLinkCard layout="tile" href="/studio/manual" icon={Compass} title="Studio 사용법" description="캔버스·레이어·브러시를 찾아봅니다." cta="관련 화면 열기" />
      </MemoryRouter>,
    );
    const tile = screen.getByRole("link", { name: /Studio 사용법.*캔버스·레이어·브러시/ });
    expect(tile.getAttribute("data-site-link-card")).toBe("tile");
    // 설명은 휴대폰에서는 시각적으로 숨기되(sr-only) sm 이상에서 보인다.
    expect(screen.getByText("캔버스·레이어·브러시를 찾아봅니다.").className).toContain("sr-only");
    expect(screen.getByText("캔버스·레이어·브러시를 찾아봅니다.").className).toContain("sm:not-sr-only");
  });

  it("shows every filter choice with its count and reports the pressed one without relying on color", () => {
    const picked: string[] = [];
    render(
      <SiteFilterChips
        label="카테고리"
        value="event"
        onChange={(next) => picked.push(next)}
        chips={[
          { id: "all", label: "전체", count: 20 },
          { id: "event", label: "공모전", count: 6 },
          { id: "novel", label: "웹소설", count: 0 },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "카테고리" });
    expect(group.querySelectorAll("button")).toHaveLength(3);
    const event = screen.getByRole("button", { name: /공모전/ });
    expect(event.getAttribute("aria-pressed")).toBe("true");
    expect(event.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: /웹소설/ }).textContent).toContain("0");
    expect(screen.getByRole("button", { name: /전체/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /전체/ }));
    expect(picked).toEqual(["all"]);
  });

  it("folds secondary guidance behind a one-line disclosure and lists numbered steps in order", () => {
    render(
      <SiteDisclosure title="처음이라면 30초 안내" summary="한 줄 요약">
        <SiteStepList steps={["검색한다", "조건으로 좁힌다", "결과를 비교한다"]} />
      </SiteDisclosure>,
    );
    const details = document.querySelector("details[data-site-disclosure]") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByText("한 줄 요약")).toBeTruthy();
    const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toEqual(["1검색한다", "2조건으로 좁힌다", "3결과를 비교한다"]);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });
});
