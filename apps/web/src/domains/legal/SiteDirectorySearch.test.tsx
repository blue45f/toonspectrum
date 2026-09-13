// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SiteDirectorySearch } from "./SiteDirectorySearch";

const entries = [{ href: "/learn/records", label: { ko: "학습 기록", en: "Learning records" }, description: { ko: "백업 복원", en: "Back up progress" } }];
afterEach(cleanup);

describe("keyboard-friendly directory finder", () => {
  it("restores a shared query, focuses the first result on submit and restores input on clear", () => {
    render(<MemoryRouter initialEntries={["/sitemap?menu=학습"]}><SiteDirectorySearch entries={entries} locale="ko" /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "메뉴·도구 바로 찾기" });
    expect((input as HTMLInputElement).value).toBe("학습");
    fireEvent.submit(screen.getByRole("search"));
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /학습 기록/u }));
    fireEvent.click(screen.getByRole("button", { name: "메뉴 검색 지우기" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
  });
  it("announces no results without removing recovery and works in English", () => {
    render(<MemoryRouter><SiteDirectorySearch entries={entries} locale="en" /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "Find a page or tool" });
    fireEvent.change(input, { target: { value: "unknown" } });
    expect(screen.getByRole("status").textContent).toContain("0 destinations");
    fireEvent.click(screen.getByRole("button", { name: "Reset search" }));
    expect((input as HTMLInputElement).value).toBe("");
  });
});
