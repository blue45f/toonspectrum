// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PageShell } from "./PageShell";
import { LAYOUT_TOKENS } from "./layout-tokens";

afterEach(cleanup);

describe("PageShell 렌더링 계약", () => {
  it("children을 페이지 캔버스 안에 렌더한다", () => {
    const { container } = render(<PageShell>본문</PageShell>);
    expect(screen.getByText("본문")).toBeTruthy();
    // bg-canvas 배경 + 헤더 높이 확보 최소 높이 (Pricing/Membership 표준)
    const shell = container.firstElementChild!;
    expect(shell.className).toContain("bg-canvas");
    for (const token of LAYOUT_TOKENS.page.split(" ")) {
      expect(shell.className).toContain(token);
    }
  });

  it("hero 슬롯이 본문보다 앞에 렌더된다", () => {
    render(
      <PageShell hero={<p>히어로</p>}>
        <p>본문</p>
      </PageShell>
    );
    const container = screen.getByText("히어로").parentElement!;
    const items = [...container.children].map((child) => child.textContent);
    expect(items.indexOf("히어로")).toBeLessThan(items.indexOf("본문"));
  });

  it("hero가 없으면 children만 렌더된다", () => {
    const { container } = render(<PageShell>본문</PageShell>);
    expect(container.textContent).toBe("본문");
  });

  it("size 기본값은 wide이며 Container 너비와 일치한다", () => {
    const { container } = render(<PageShell>본문</PageShell>);
    expect(container.querySelector("[data-page-container]")?.getAttribute("data-page-container")).toBe("wide");
  });

  it("className을 외곽 래퍼에 합친다", () => {
    const { container } = render(<PageShell className="custom">본문</PageShell>);
    expect(container.firstElementChild?.className).toContain("custom");
  });
});
