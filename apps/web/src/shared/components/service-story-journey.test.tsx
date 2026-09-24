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
      "/about/technology/deck",
      "/about/technology/videos",
    ]);
    expect(
      links.find((link) => link.getAttribute("aria-current") === "page")
        ?.getAttribute("href"),
    ).toBe("/about/technology/videos");
  });
});
