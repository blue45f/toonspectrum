// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { TitleNotFound } from "./TitleNotFound";
import { titleSlugSearchQuery } from "./title-slug-query";

afterEach(cleanup);

describe("title not-found recovery", () => {
  it("turns a human-readable address into a search query", () => {
    expect(titleSlugSearchQuery("나-혼자만-레벨업")).toBe("나 혼자만 레벨업");
    expect(titleSlugSearchQuery("  the_second--life ")).toBe("the second life");
  });

  it("does not suggest catalog identifiers or empty values as searches", () => {
    expect(titleSlugSearchQuery("kw-4172")).toBeNull();
    expect(titleSlugSearchQuery("rd-845050520")).toBeNull();
    expect(titleSlugSearchQuery("---")).toBeNull();
    expect(titleSlugSearchQuery(undefined)).toBeNull();
  });

  it("links straight to a search for the recovered title and back to discovery", () => {
    render(
      <MemoryRouter>
        <TitleNotFound slug="나-혼자만-레벨업" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "이 주소의 작품을 찾지 못했어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /나 혼자만 레벨업/ }).getAttribute("href")).toBe(
      `/search?q=${encodeURIComponent("나 혼자만 레벨업")}`,
    );
    expect(screen.getByRole("link", { name: /탐색 허브로/ }).getAttribute("href")).toBe("/discover");
  });
});
