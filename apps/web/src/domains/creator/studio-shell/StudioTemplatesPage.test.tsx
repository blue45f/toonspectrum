// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { StudioTemplatesPage } from "./StudioTemplatesPage";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioTemplatesPage", () => {
  it("searches the canonical catalog and keeps one clear start action", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /무엇을 만들지만 고르세요|Choose what you want to make/u })).toBeTruthy();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "피칭" } });

    expect(screen.getAllByText(/웹툰 피칭 자료|Webtoon pitch deck/u).length).toBeGreaterThan(0);
    expect(screen.queryByText(/4컷·컷툰/u)).toBeNull();
    expect(screen.getByRole("link", { name: /이 템플릿으로 시작|Start with this template/u }).getAttribute("href"))
      .toContain("template=presentation-webtoon-pitch");
  });

  it("persists favorites without creating another template library", () => {
    render(
      <MemoryRouter>
        <StudioTemplatesPage />
      </MemoryRouter>,
    );

    const favoriteButtons = screen.getAllByRole("button", { name: /즐겨찾기 전환|Toggle favorite/u });
    fireEvent.click(favoriteButtons[0]!);
    expect(window.localStorage.getItem("toonspectrum:studio-template-favorites:v1"))
      .toContain("webtoon-vertical-episode");

    fireEvent.click(screen.getByRole("button", { name: /^즐겨찾기$|^Favorites$/u }));
    expect(screen.getAllByText(/세로 웹툰 기본 원고|Vertical webtoon episode/u).length).toBeGreaterThan(0);
  });
});
