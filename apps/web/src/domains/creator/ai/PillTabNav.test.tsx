// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { Clapperboard, Cpu, Sparkles } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PillTabNav, type PillTabNavItem } from "./PillTabNav";

const ITEMS: readonly PillTabNavItem[] = [
  { id: "director", href: "/studio/ai-lab", label: "디렉터", icon: Sparkles, active: false },
  { id: "generate", href: "/studio/generate", label: "생성 실험실", icon: Clapperboard, active: false },
  { id: "runtime", href: "/studio/ai-lab#ai-runtime", label: "내 AI 런타임", icon: Cpu, active: true },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLUListElement.prototype, "scrollLeft");
});

describe("PillTabNav", () => {
  it("marks exactly one current tab inside a labelled navigation", () => {
    render(<MemoryRouter><PillTabNav label="AI 도구 이동" items={ITEMS} /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "AI 도구 이동" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, null, "page"]);
    expect(within(nav).getByRole("link", { name: "생성 실험실" }).getAttribute("href")).toBe("/studio/generate");
  });

  it("scrolls only the tab row so a clipped current tab becomes visible on narrow screens", () => {
    let scrollLeft = 0;
    Object.defineProperty(HTMLUListElement.prototype, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value; },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function bounds(this: HTMLElement) {
      if (this instanceof HTMLUListElement) return new DOMRect(0, 0, 300, 44);
      return this.getAttribute("aria-current") === "page" ? new DOMRect(340, 0, 100, 44) : new DOMRect(0, 0, 100, 44);
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });

    render(<MemoryRouter><PillTabNav label="AI 도구 이동" items={ITEMS} /></MemoryRouter>);

    expect(scrollLeft).toBe(240);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
