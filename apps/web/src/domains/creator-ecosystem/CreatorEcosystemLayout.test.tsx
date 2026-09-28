// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CreatorEcosystemLayout } from "./CreatorEcosystemLayout";

afterEach(cleanup);

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe("창작자 생태계 일러스트 패널", () => {
  it.each([
    ["/ecosystem/education", "성장 · 교육"],
    ["/ecosystem/collaboration", "비즈니스 · 협업"],
    ["/ecosystem/fandom", "팬덤 · 코스프레"],
    ["/ecosystem/library", "라이브러리"],
  ])("%s에서 활성 패널을 구분하고 오류와 입력을 보존한다", (path, label) => {
    const { container } = render(<MemoryRouter initialEntries={[path]}>
      <CreatorEcosystemLayout title="창작자 도구" intro="필요한 자료를 확인하세요.">
        <label>내 메모<input defaultValue="이어서 작성" /></label>
        <p role="alert">연결을 확인하세요.</p>
      </CreatorEcosystemLayout>
    </MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "창작자 생태계 메뉴" });
    const selected = within(nav).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain(label);
    expect(screen.getByRole("textbox", { name: "내 메모" }).getAttribute("value")).toBe("이어서 작성");
    expect(screen.getByRole("alert").textContent).toBe("연결을 확인하세요.");
    expect(container.querySelectorAll('.ecosystem-navigation-art[alt=""][aria-hidden="true"]')).toHaveLength(4);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("아트가 추가되어도 링크와 키보드 탐색 가능한 이름을 유지한다", () => {
    render(<MemoryRouter initialEntries={["/ecosystem/education"]}>
      <CreatorEcosystemLayout title="창작자 도구" intro="안내"><LocationProbe /></CreatorEcosystemLayout>
    </MemoryRouter>);
    const library = screen.getByRole("link", { name: /라이브러리.*소장·읽음·대여·도서관/ });
    library.focus();
    expect(document.activeElement).toBe(library);
    fireEvent.click(library);
    expect(screen.getByTestId("location").textContent).toBe("/ecosystem/library");
    expect(library.getAttribute("aria-current")).toBe("page");
  });
});
