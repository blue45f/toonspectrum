// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HeroBlock } from "./HeroBlock";
import { LAYOUT_TOKENS } from "./layout-tokens";

afterEach(cleanup);

describe("HeroBlock 렌더링 계약", () => {
  it("title을 h1으로, eyebrow·lede·actions 슬롯을 렌더한다", () => {
    render(
      <HeroBlock
        eyebrow="PRICING"
        title="무료로 시작하세요"
        lede="리드 문단"
        actions={<button type="button">시작하기</button>}
      />
    );
    expect(screen.getByRole("heading", { level: 1, name: "무료로 시작하세요" })).toBeTruthy();
    expect(screen.getByText("PRICING")).toBeTruthy();
    expect(screen.getByText("리드 문단")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시작하기" })).toBeTruthy();
  });

  it("media 슬롯이 없으면 카피만 렌더한다", () => {
    const { container } = render(<HeroBlock title="제목" />);
    expect(container.querySelector("header")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("align=left(기본)면 카피·미디어가 2열 그리드로 나뉜다", () => {
    const { container } = render(
      <HeroBlock title="제목" media={<img alt="미디어" src="/x.png" />} />
    );
    const grid = container.querySelector("div.lg\\:grid-cols-2");
    expect(grid).not.toBeNull();
    // 카피(h1)가 미디어(img)보다 앞에 렌더된다
    const headings = [...grid!.querySelectorAll("h1")];
    const images = [...grid!.querySelectorAll("img")];
    expect(headings.length).toBe(1);
    expect(images.length).toBe(1);
    expect(headings[0]!.compareDocumentPosition(images[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("align=center이면 카피가 가운데 정렬되고 미디어가 아래에 렌더된다", () => {
    render(
      <HeroBlock
        align="center"
        title="제목"
        eyebrow="EYEBROW"
        lede="리드"
        actions={<button type="button">시작</button>}
        media={<img alt="미디어" src="/x.png" />}
      />
    );
    const header = screen.getByRole("banner");
    // 카피 블록 text-center
    expect(screen.getByText("제목").closest("div")?.className).toContain("text-center");
    // 미디어가 카피 뒤에
    const mediaWrap = screen.getByAltText("미디어").parentElement!;
    expect(mediaWrap.className).toContain("mt-8");
    expect(header.textContent).toContain("EYEBROW");
  });

  it("titleId를 h1 id로 연결한다", () => {
    render(<HeroBlock title="제목" titleId="hero-title" />);
    expect(screen.getByRole("heading", { level: 1 }).getAttribute("id")).toBe("hero-title");
  });

  it("히어로 타이포 토큰을 사용한다", () => {
    render(<HeroBlock title="제목" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    for (const token of LAYOUT_TOKENS.type.heroTitle.split(" ")) {
      expect(h1.className).toContain(token);
    }
  });
});
