// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CreatorEcosystemPage } from "./CreatorEcosystemPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatorEcosystemPage />
    </MemoryRouter>,
  );
}

const tabs = () => within(screen.getByRole("tablist", { name: "작업대 바로가기" })).getAllByRole("tab");

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

afterEach(cleanup);

describe("CreatorEcosystemPage", () => {
  it("열한 구역을 탭으로 나눠 처음에는 샘플 작품 구역 하나만 보여 준다", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "작품을 끝까지 완성하는 창작 생태계 작업대" })).toBeTruthy();

    expect(tabs()).toHaveLength(11);
    expect(tabs()[0]?.getAttribute("aria-selected")).toBe("true");
    // 보이는 패널은 하나이고, 탭과 이름으로 연결된다.
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("ecosystem-samples");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs()[0]?.id);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    // 나머지 구역은 사라지지 않고 숨겨져만 있다(입력 초안 보존).
    expect(document.getElementById("ecosystem-preflight")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelectorAll("section[role='tabpanel']")).toHaveLength(11);
  });

  it("탭을 누르면 그 구역만 보이고, 구역을 오가도 쓰던 입력은 남는다", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "원고 검수" }));
    expect(screen.getByRole("tabpanel").id).toBe("ecosystem-preflight");
    expect(window.location.hash).toBe("#ecosystem-preflight");

    const source = within(screen.getByRole("tabpanel")).getByRole("textbox");
    fireEvent.change(source, { target: { value: "{\"draft\":true}" } });

    fireEvent.click(screen.getByRole("tab", { name: "베타 독자" }));
    expect(screen.getByRole("tabpanel").id).toBe("ecosystem-beta");
    fireEvent.click(screen.getByRole("tab", { name: "원고 검수" }));
    expect(within(screen.getByRole("tabpanel")).getByRole("textbox")).toHaveProperty("value", "{\"draft\":true}");
  });

  it("다른 화면의 해시 링크로 들어오면 그 구역을 연다", () => {
    window.history.replaceState(null, "", "/#ecosystem-beta");
    renderPage();
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("베타 독자");
    expect(screen.getByRole("tabpanel").id).toBe("ecosystem-beta");
  });

  it("마지막 구역에는 이전 이동만, 첫 구역에는 다음 이동만 둔다", () => {
    renderPage();
    const footer = () => screen.getByRole("navigation", { name: "이전·다음 구역" });
    expect(within(footer()).queryByRole("button", { name: /^이전/u })).toBeNull();
    fireEvent.click(within(footer()).getByRole("button", { name: "다음 · 샘플 일러스트" }));
    expect(screen.getByRole("tabpanel").id).toBe("ecosystem-illustrations");
    fireEvent.keyDown(screen.getByRole("tab", { selected: true }), { key: "End" });
    expect(screen.getByRole("tabpanel").id).toBe("ecosystem-read-create");
    expect(within(footer()).queryByRole("button", { name: /^다음/u })).toBeNull();
  });
});
