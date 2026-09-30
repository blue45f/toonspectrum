// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PromoStepNav } from "./PromoStepNav";

afterEach(cleanup);

describe("PromoStepNav", () => {
  it("4단계를 순서대로 보여 주고 각 카드로 이동하는 링크를 제공한다", () => {
    render(
      <PromoStepNav
        panelCount={0}
        steps={[
          { id: "plan", state: "optional" },
          { id: "cuts", state: "current" },
          { id: "sound", state: "optional" },
          { id: "export", state: "todo" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "홍보영상 제작 단계" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#promo-step-plan",
      "#promo-step-cuts",
      "#promo-step-sound",
      "#promo-step-export",
    ]);
    // 지금 할 단계는 aria-current 와 문구로 함께 알린다(색에만 의존하지 않음).
    expect(links[1]?.getAttribute("aria-current")).toBe("step");
    expect(links[1]?.textContent).toContain("지금 할 차례");
    expect(links[1]?.textContent).toContain("웹툰 컷 3~6장을 올려 주세요");
    expect(links[3]?.textContent).toContain("컷을 추가하면 열려요");
  });

  it("완료한 단계는 준비된 컷 수와 완료 표시를 보여 준다", () => {
    render(
      <PromoStepNav
        panelCount={4}
        steps={[
          { id: "plan", state: "done" },
          { id: "cuts", state: "done" },
          { id: "sound", state: "done" },
          { id: "export", state: "current" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /컷과 장면/u }).textContent).toContain("4컷 준비됨");
    expect(screen.getAllByText("완료")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /내보내기/u }).getAttribute("aria-current")).toBe("step");
  });
});
