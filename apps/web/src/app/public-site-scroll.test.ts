import { describe, expect, it } from "vitest";

import { PUBLIC_SCROLL_HISTORY_LIMIT, publicHashTarget, rememberPublicScrollPosition, type PublicScrollPosition } from "./public-site-scroll";

describe("public page navigation recovery", () => {
  it("decodes Korean anchors without treating malformed fragments as selectors", () => {
    expect(publicHashTarget("#%EC%9E%91%ED%92%88")).toBe("작품");
    expect(publicHashTarget("#creator-faq-title")).toBe("creator-faq-title");
    expect(publicHashTarget("#")).toBeNull();
    expect(publicHashTarget("")).toBeNull();
    expect(publicHashTarget("#%E0%A4%A")).toBeNull();
    expect(publicHashTarget('#a[title="b"]')).toBe('a[title="b"]');
  });

  it("keeps independent positions for separate entries of the same route", () => {
    const history = new Map<string, PublicScrollPosition>();
    rememberPublicScrollPosition(history, "entry-one", { x: 0, y: 1400 });
    rememberPublicScrollPosition(history, "entry-two", { x: 0, y: 250 });
    expect(history.get("entry-one")?.y).toBe(1400);
    expect(history.get("entry-two")?.y).toBe(250);
  });

  it("bounds retained entries and keeps an updated entry as the newest", () => {
    const history = new Map<string, PublicScrollPosition>();
    for (let index = 0; index < PUBLIC_SCROLL_HISTORY_LIMIT; index += 1) rememberPublicScrollPosition(history, String(index), { x: 0, y: index });
    rememberPublicScrollPosition(history, "0", { x: 0, y: 800 });
    rememberPublicScrollPosition(history, "next", { x: 0, y: 900 });
    expect(history.size).toBe(PUBLIC_SCROLL_HISTORY_LIMIT);
    expect(history.has("1")).toBe(false);
    expect(history.get("0")?.y).toBe(800);
  });

  it("does not retain invalid browser coordinates or mutable references", () => {
    const history = new Map<string, PublicScrollPosition>();
    const position = { x: -12, y: Number.POSITIVE_INFINITY };
    rememberPublicScrollPosition(history, "safe", position);
    position.y = 999;
    expect(history.get("safe")).toEqual({ x: 0, y: 0 });
  });
});
