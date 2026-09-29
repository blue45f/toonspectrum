// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { appRoutes } from "./groups/app-routes";
import { resolveBreadcrumbTrail } from "./route-breadcrumb";
import { AppBreadcrumb, withRouteBreadcrumb } from "../components/breadcrumb";

afterEach(cleanup);

describe("route breadcrumb trails", () => {
  it("resolves curated 2-depth trails with a home root and a current page", () => {
    const trail = resolveBreadcrumbTrail("/market/browse");
    expect(trail.map((item) => item.ko)).toEqual(["홈", "마켓", "둘러보기"]);
    expect(trail[0]).toMatchObject({ href: "/" });
    expect(trail[1]).toMatchObject({ href: "/market" });
    expect(trail.at(-1)?.href).toBeUndefined();
  });

  it("normalizes trailing slashes before lookup", () => {
    expect(resolveBreadcrumbTrail("/about/technology/guides/").map((item) => item.ko))
      .toEqual(["홈", "소개", "기술", "가이드"]);
  });

  it("returns an empty trail for uncurated paths instead of guessing labels", () => {
    expect(resolveBreadcrumbTrail("/some/future/page")).toEqual([]);
  });

  it("points every curated trail href at a registered route", () => {
    const registered = new Set(appRoutes.map((route) => route.path));
    const staticPaths = appRoutes
      .map((route) => route.path)
      .filter((path) => !path.includes(":") && !path.includes("*"));
    let covered = 0;
    for (const path of staticPaths) {
      const trail = resolveBreadcrumbTrail(path);
      if (trail.length === 0) continue;
      covered += 1;
      for (const item of trail) {
        if (item.href) expect(registered.has(item.href), `${path} -> ${item.href}`).toBe(true);
      }
    }
    expect(covered).toBeGreaterThan(20);
  });
});

describe("AppBreadcrumb", () => {
  it("marks the last item as the current page and links the ancestors", () => {
    render(
      <MemoryRouter>
        <AppBreadcrumb items={resolveBreadcrumbTrail("/market/browse")} />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "현재 위치" });
    expect(nav).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "마켓" }).getAttribute("href")).toBe("/market");
    const current = screen.getByText("둘러보기");
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  it("renders nothing for an empty trail", () => {
    const { container } = render(
      <MemoryRouter>
        <AppBreadcrumb items={[]} />
      </MemoryRouter>,
    );
    expect(container.querySelector("nav")).toBeNull();
  });

  it("withRouteBreadcrumb wraps a route element without touching the page itself", () => {
    const wrapped = withRouteBreadcrumb(resolveBreadcrumbTrail("/market/browse"), <div data-page="">page</div>);
    const { container } = render(<MemoryRouter>{wrapped}</MemoryRouter>);
    expect(container.querySelector("nav")).not.toBeNull();
    expect(container.querySelector("[data-page]")).not.toBeNull();
  });

  it("withRouteBreadcrumb passes the element through when no trail is curated", () => {
    const wrapped = withRouteBreadcrumb([], <div data-page="">page</div>);
    const { container } = render(<MemoryRouter>{wrapped}</MemoryRouter>);
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("[data-page]")).not.toBeNull();
  });
});
