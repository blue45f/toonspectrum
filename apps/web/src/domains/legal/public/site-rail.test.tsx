// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteRail, SiteShowMoreButton } from "./site-rail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Cards() {
  return (
    <SiteRail label="추천 조합" ordered>
      <article>첫째</article>
      <article>둘째</article>
      <article>셋째</article>
    </SiteRail>
  );
}

describe("SiteRail", () => {
  it("이름 붙은 목록으로 카드 순서를 그대로 읽힌다", () => {
    render(<Cards />);
    const list = screen.getByRole("list", { name: "추천 조합" });
    expect(list.tagName).toBe("OL");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("넘치지 않으면 쓸모없는 탭 정지점을 만들지 않는다", () => {
    render(<Cards />);
    expect(screen.getByRole("list", { name: "추천 조합" }).hasAttribute("tabindex")).toBe(false);
  });

  it("가로로 넘칠 때만 키보드 초점을 받아 링크 없는 카드 줄도 화살표로 넘길 수 있다", () => {
    vi.spyOn(Element.prototype, "scrollWidth", "get").mockReturnValue(640);
    vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(320);
    render(<Cards />);
    expect(screen.getByRole("list", { name: "추천 조합" }).getAttribute("tabindex")).toBe("0");
  });
});

describe("SiteShowMoreButton", () => {
  it("남은 개수가 없으면 아무것도 그리지 않고, 있으면 누르기 전에 분량을 라벨에 보여 준다", () => {
    const { rerender } = render(<SiteShowMoreButton remaining={0} onClick={() => undefined} label="더 보기" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<SiteShowMoreButton remaining={5} onClick={() => undefined} label="더 보기 · 5개 남음" />);
    expect(screen.getByRole("button", { name: "더 보기 · 5개 남음" })).toBeTruthy();
  });
});
