// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtelierWorkbenchDemo } from "./AtelierWorkbenchDemo";
import { SiteAtelierChapter } from "./SiteAtelierChapter";
import { SiteExperienceFrame } from "./SiteExperienceFrame";
import { EXPERIENCE_MODE_KEY } from "./site-experience-model";

let observe: (visible: boolean) => void;
let changePreference: () => void;
let reduced = false;
const disconnect = vi.fn();

beforeEach(() => {
  localStorage.clear(); reduced = false; disconnect.mockClear();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { observe = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    observe() { observe(true); }
    disconnect() { disconnect(); }
  });
  vi.stubGlobal("matchMedia", () => ({
    get matches() { return reduced; },
    addEventListener: (_event: string, callback: () => void) => { changePreference = callback; },
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (child = <AtelierWorkbenchDemo />) => render(<MemoryRouter>{child}</MemoryRouter>);
const demo = () => screen.getByTestId("atelier-workbench");

describe("atelier workbench", () => {
  it("changes actual brush line weight without touching editor state", () => {
    mount();
    fireEvent.change(screen.getByRole("slider", { name: /예시 선 굵기/ }), { target: { value: "12" } });
    expect(demo().style.getPropertyValue("--atelier-weight")).toBe("12");
    expect(screen.getByRole("link", { name: "브러시로 그리기" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByText("인터랙티브 콘셉트 데모")).not.toBeNull();
  });
  it("supports keyboard tab selection, wrapping and associated panels", () => {
    mount();
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[4]);
    expect(tabs[4].getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[4].id);
    fireEvent.keyDown(tabs[4], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: "End" });
    expect(document.activeElement).toBe(tabs[4]);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });
  it("toggles illustration layers independently and preserves control state across tabs", () => {
    const result = mount();
    fireEvent.click(screen.getByRole("tab", { name: "색과 레이어" }));
    fireEvent.click(screen.getByRole("button", { name: "채색" }));
    expect(result.container.querySelector('[data-color="false"]')).not.toBeNull();
    expect(screen.getByText("2 / 3 설명 레이어")).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "선의 감각" }));
    fireEvent.click(screen.getByRole("tab", { name: "색과 레이어" }));
    expect(screen.getByRole("button", { name: "채색" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("changes panel composition and camera position", () => {
    const result = mount();
    fireEvent.click(screen.getByRole("tab", { name: "컷과 이야기" }));
    fireEvent.click(screen.getByRole("button", { name: "세로 흐름" }));
    expect(result.container.querySelector('[data-vertical="true"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "움직이는 컷" }));
    fireEvent.change(screen.getByRole("slider", { name: /카메라 위치 직접 조절/ }), { target: { value: "76" } });
    expect(demo().style.getPropertyValue("--atelier-camera")).toBe("76");
    expect(demo().dataset.running).toBe("false");
  });
  it("pauses offscreen and when manually paused", () => {
    const result = mount();
    expect(demo().dataset.running).toBe("true");
    act(() => observe(false));
    expect(demo().dataset.running).toBe("false");
    act(() => observe(true));
    fireEvent.click(screen.getByRole("button", { name: "모션 일시정지" }));
    expect(demo().dataset.running).toBe("false");
    result.unmount(); expect(disconnect).toHaveBeenCalledOnce();
  });
  it("responds to reduced motion changes and hidden tabs", () => {
    mount();
    reduced = true; act(() => changePreference());
    expect(demo().dataset.running).toBe("false");
    expect(screen.queryByRole("button", { name: "모션 일시정지" })).toBeNull();
    reduced = false; act(() => changePreference());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(demo().dataset.running).toBe("false");
  });
  it("respects calm appearance and uses unique accessible IDs", () => {
    localStorage.setItem(EXPERIENCE_MODE_KEY, "calm");
    const result = mount(<SiteExperienceFrame enabled><AtelierWorkbenchDemo /><AtelierWorkbenchDemo locale="en" /></SiteExperienceFrame>);
    expect(screen.getAllByTestId("atelier-workbench").every((item) => item.dataset.running === "false")).toBe(true);
    const ids = Array.from(result.container.querySelectorAll("[id]")).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("recovers from a broken image without breaking the actions", () => {
    mount(); fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText(/이미지 없이도/)).not.toBeNull();
    expect(screen.getByRole("link", { name: "브러시로 그리기" })).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "색과 레이어" }));
    expect(screen.getByRole("img")).not.toBeNull();
  });
  it("makes resource pages contextual without duplicating the home demo or touching studio", () => {
    const result = mount(<SiteAtelierChapter pathname="/insights/resources" locale="ko" />);
    expect(demo().dataset.scene).toBe("layers");
    result.rerender(<MemoryRouter><SiteAtelierChapter pathname="/" locale="ko" /></MemoryRouter>);
    expect(screen.queryByTestId("atelier-workbench")).toBeNull();
    result.rerender(<MemoryRouter><SiteAtelierChapter pathname="/studio/comic" locale="ko" /></MemoryRouter>);
    expect(screen.queryByTestId("atelier-workbench")).toBeNull();
  });
});
