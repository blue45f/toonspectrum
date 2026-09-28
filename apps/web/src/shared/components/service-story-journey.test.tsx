// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ServiceStoryJourney } from "./service-story-journey";

afterEach(cleanup);

describe("ServiceStoryJourney", () => {
  it("connects service, benchmark, presentation and film surfaces in one ordered journey", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/videos"]}>
        <ServiceStoryJourney current="film" />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", {
      name: /서비스 소개와 기술 스토리 흐름|Service and engineering story journey/u,
    });
    const links = Array.from(navigation.querySelectorAll("a"));

    expect(links).toHaveLength(6);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/product-tour",
      "/brand-film",
      "/about/technology/story",
      "/about/technology/playbook#benchmarks",
      "/about/technology/deck?audience=seminar&duration=30",
      "/about/technology/videos",
    ]);
    expect(
      links.find((link) => link.getAttribute("aria-current") === "page")
        ?.getAttribute("href"),
    ).toBe("/about/technology/videos");
  });

  it.each([15, 30, 45])("%i분 발표에서도 기본 세미나 링크와 현재 위치를 유지한다", (duration) => {
    render(
      <MemoryRouter initialEntries={[`/about/technology/deck?audience=seminar&duration=${duration}#slide-3`]}>
        <ServiceStoryJourney current="deck" />
      </MemoryRouter>,
    );

    const presentation = screen.getByRole("link", {
      name: /웹 발표 자료|Web presentation/u,
    });
    expect(presentation.getAttribute("href")).toBe("/about/technology/deck?audience=seminar&duration=30");
    expect(presentation.getAttribute("aria-current")).toBe("page");
    expect(
      screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });
});
