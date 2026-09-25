// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import Link, { PreserveLinkQueryParams } from "./router-link";

import type { ComponentProps } from "react";

afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function renderLink(from: string, props: ComponentProps<typeof Link>) {
  const observedDefaultPrevented: boolean[] = [];
  render(
    <MemoryRouter initialEntries={[from]}>
      <div role="presentation" onClick={(event) => {
        // Observe the real RouterLink handler first, then cancel native navigation in jsdom.
        observedDefaultPrevented.push(event.defaultPrevented);
        event.preventDefault();
      }}>
        <Link {...props}>Open</Link>
      </div>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { anchor: screen.getByRole("link", { name: "Open" }), observedDefaultPrevented };
}

describe("Studio document boundaries in the shared Link", () => {
  it.each([
    ["/", "/studio"],
    ["/market", "/studio/bg3d?quality=high#scene"],
    ["/studio", "/create"],
    ["/studio/bg3d", "/market"],
  ])("leaves %s -> %s to native document navigation after guards", (from, href) => {
    const { anchor, observedDefaultPrevented } = renderLink(from, { href });
    fireEvent.click(anchor);
    expect(observedDefaultPrevented).toEqual([false]);
    expect(screen.getByTestId("location").textContent).toBe(from);
  });

  it.each([
    ["/", "/market", "/market"],
    ["/studio", "/studio/bg3d?camera=front#scene", "/studio/bg3d?camera=front#scene"],
    ["/studio/bg3d", "?camera=front", "/studio/bg3d?camera=front"],
    ["/studio-tools", "/create", "/create"],
  ])("preserves SPA navigation within a document family: %s -> %s", (from, href, expected) => {
    const { anchor, observedDefaultPrevented } = renderLink(from, { href });
    fireEvent.click(anchor);
    expect(observedDefaultPrevented).toEqual([true]);
    expect(screen.getByTestId("location").textContent).toBe(expected);
  });

  it("preserves a user onClick guard before crossing the Studio boundary", () => {
    const onClick = vi.fn<NonNullable<ComponentProps<typeof Link>["onClick"]>>((event) => {
      event.preventDefault();
    });
    const { anchor, observedDefaultPrevented } = renderLink("/studio", { href: "/create", onClick });
    fireEvent.click(anchor);
    expect(onClick).toHaveBeenCalledOnce();
    expect(observedDefaultPrevented).toEqual([true]);
    expect(screen.getByTestId("location").textContent).toBe("/studio");
  });

  it("allows an ancestor bubble guard to cancel without an early router transition", () => {
    const { anchor, observedDefaultPrevented } = renderLink("/studio/bg3d", { href: "/market" });
    expect(fireEvent.click(anchor)).toBe(false);
    expect(observedDefaultPrevented).toEqual([false]);
    expect(screen.getByTestId("location").textContent).toBe("/studio/bg3d");
  });

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { button: 1 },
  ])("preserves RouterLink modified-click behavior: %j", (click) => {
    const { anchor, observedDefaultPrevented } = renderLink("/", { href: "/market" });
    fireEvent.click(anchor, click);
    expect(observedDefaultPrevented).toEqual([false]);
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("preserves explicit targets and download attributes on boundary links", () => {
    const targeted = renderLink("/", { href: "/studio", target: "_blank", rel: "noopener" });
    fireEvent.click(targeted.anchor);
    expect(targeted.anchor.getAttribute("target")).toBe("_blank");
    expect(targeted.observedDefaultPrevented).toEqual([false]);
    cleanup();
    const download = renderLink("/", { href: "/studio/export.glb", download: "scene.glb" });
    fireEvent.click(download.anchor);
    expect(download.anchor.getAttribute("download")).toBe("scene.glb");
    expect(download.observedDefaultPrevented).toEqual([false]);
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("keeps external anchors usable outside a router", () => {
    render(<Link href="https://example.com/studio">External</Link>);
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://example.com/studio");
  });

  it("preserves object hrefs, explicit queries, and inherited query parameters", () => {
    render(
      <MemoryRouter>
        <PreserveLinkQueryParams params={{ source: "proof", mode: "safe" }}>
          <Link href={{ pathname: "/studio", query: { mode: "high" } }}>Open</Link>
        </PreserveLinkQueryParams>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/studio?mode=high&source=proof");
  });
});
