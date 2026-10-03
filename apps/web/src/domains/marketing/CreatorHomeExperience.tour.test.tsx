// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { PRODUCT_START_DESTINATIONS } from "@/shared/lib/product-identity";

import { CreatorHomeExperience } from "./CreatorHomeExperience";
import { STUDIO_DEPTH_LINKS, STUDIO_REGIONS, STUDIO_SUPPORT_TILES } from "./studio-tour-content";

vi.mock("./use-creator-home-section-navigation", () => ({ useCreatorHomeSectionNavigation: () => undefined }));
vi.mock("@/shared/lib/i18n-runtime-translation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n-runtime-translation")>();
  return { ...actual, loadRuntimeTranslationBundle: vi.fn(async () => false) };
});

const initial = useI18n.getState();

beforeEach(() => {
  useI18n.setState({ lang: "ko", translationBundleRevision: 0 });
});
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initial.lang, translationBundleRevision: initial.translationBundleRevision });
});

async function renderAt(entry: string) {
  await act(async () => {
    render(<MemoryRouter initialEntries={[entry]}><CreatorHomeExperience /></MemoryRouter>);
  });
}

const hrefs = (root: ParentNode) => [...root.querySelectorAll("a")].map((link) => link.getAttribute("href"));

describe("/about/studio 눌러서 보는 작업실 둘러보기", () => {
  it.each(["/about/studio", "/about/studio/", "/ABOUT/STUDIO"])("%s는 둘러보기 루트를 그리고 옛 래퍼 클래스를 쓰지 않는다", async (entry) => {
    await renderAt(entry);
    const root = document.querySelector('[data-home-view="introduction"]');
    expect(root).not.toBeNull();
    expect(root?.classList.contains("creator-experience")).toBe(false);
    expect(root?.classList.contains("creator-flagship")).toBe(false);
    expect(document.querySelector("[data-reference-dashboard]")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("작업실을 눌러서 둘러보세요.");
    const hero = document.querySelector(".cf-hero");
    expect(hrefs(hero ?? document)).toEqual(["/studio/new", "/studio"]);
  });

  it("세 탭으로 나뉘고 기본은 화면 구성이며, 번호 버튼·핀·설명이 같은 선택을 따른다", async () => {
    await renderAt("/about/studio");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["화면 구성", "바로 시작", "재료·협업·도움"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

    const group = screen.getByRole("group", { name: "작업실 영역 고르기" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons).toHaveLength(STUDIO_REGIONS.length);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    const first = STUDIO_REGIONS[0];
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(first?.ko.title);
    expect(document.querySelector("#creator-bridge article a")?.getAttribute("href")).toBe(first?.href);

    // 번호 버튼으로 고르기
    fireEvent.click(buttons[1] as HTMLElement);
    const second = STUDIO_REGIONS[1];
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(second?.ko.title);
    expect(document.querySelector("#creator-bridge article a")?.getAttribute("href")).toBe(second?.href);
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("false");

    // 예시 화면의 핀으로 고르기(마우스·터치용 — 키보드는 위 번호 버튼)
    const pins = [...document.querySelectorAll<HTMLButtonElement>(".isw-pin")];
    // 핀은 예시 화면의 배치 순서로 놓이므로 번호는 정렬해서 확인한다.
    expect(pins.map((pin) => pin.textContent).sort()).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(pins.find((pin) => pin.textContent === "3") as HTMLElement);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(STUDIO_REGIONS[2]?.ko.title);
    expect(document.querySelectorAll(".isw [data-active]")).toHaveLength(1);
    // 장식 그림은 보조기술에서 숨기고, 핀은 키보드 순서에 넣지 않는다.
    expect(document.querySelector(".isw-window")?.getAttribute("aria-hidden")).toBe("true");
    expect(pins.every((pin) => pin.tabIndex === -1)).toBe(true);
  });

  it("바로 시작 탭은 시작 선택기를 한 번만 그리고 모든 시작점으로 이어진다", async () => {
    await renderAt("/about/studio");
    fireEvent.click(screen.getByRole("tab", { name: "바로 시작" }));
    const nav = document.querySelector("#creator-start .cf-intent-visual-nav");
    expect(nav?.querySelectorAll("a")).toHaveLength(PRODUCT_START_DESTINATIONS.length);
    for (const destination of PRODUCT_START_DESTINATIONS) {
      expect(nav?.querySelector(`a[href="${destination.href}"]`)?.textContent).toContain(destination.label.ko);
    }
    expect(document.querySelectorAll("#creator-toolkit-title")).toHaveLength(1);
  });

  it("재료·협업·도움 탭은 세 입구와 더 깊이 읽을 소개 페이지를 건다", async () => {
    await renderAt("/about/studio");
    fireEvent.click(screen.getByRole("tab", { name: "재료·협업·도움" }));
    const panel = screen.getByRole("tabpanel");
    expect(hrefs(panel)).toEqual([...STUDIO_SUPPORT_TILES.map((tile) => tile.href), ...STUDIO_DEPTH_LINKS.map((link) => link.href)]);
  });

  it("예전 섹션 앵커와 ?tab 주소가 해당 탭을 연다", async () => {
    await renderAt("/about/studio#creator-support");
    expect(screen.getByRole("tab", { name: "재료·협업·도움" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    await renderAt("/about/studio?tab=start");
    expect(screen.getByRole("tab", { name: "바로 시작" }).getAttribute("aria-selected")).toBe("true");
  });

  it("끝에서 정본 순서의 이전·다음 소개로 이어진다", async () => {
    await renderAt("/about/studio");
    const pager = screen.getByRole("navigation", { name: "소개 페이지 이어 읽기" });
    expect(pager.querySelector('a[rel="prev"]')?.getAttribute("href")).toBe("/about");
    expect(pager.querySelector('a[rel="next"]')?.getAttribute("href")).toBe("/about/workflow");
  });

  it("영어 선택 시 제목·탭·영역 설명을 영어로 보여 준다", async () => {
    useI18n.setState({ lang: "en" });
    await renderAt("/about/studio");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tap around the studio.");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Screen tour", "Start here", "Assets & help"]);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(STUDIO_REGIONS[0]?.en.title);
    expect(document.querySelector('[data-home-view="introduction"]')?.getAttribute("lang")).toBe("en");
  });
});

describe("/ 공개 홈", () => {
  it("참고 보드형 대시보드를 그리고 끝에 '처음 둘러보는 순서'의 다음 버튼(서비스 소개)을 둔다", async () => {
    await renderAt("/");
    const root = document.querySelector('[data-home-view="dashboard"]');
    expect(root?.classList.contains("creator-experience")).toBe(true);
    expect(root?.querySelector("[data-reference-dashboard]")).not.toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    const flow = document.querySelector('nav[data-service-flow="home"]');
    expect(flow).not.toBeNull();
    expect(flow?.querySelector('a[aria-current="step"]')?.getAttribute("href")).toBe("/");
    const next = [...(flow?.querySelectorAll("a") ?? [])].find((link) => link.textContent?.startsWith("다음"));
    expect(next?.getAttribute("href")).toBe("/about");
    for (const sectionId of ["creator-flow", "creator-principles", "creator-support", "creator-bridge"]) {
      expect(document.getElementById(sectionId)).toBeNull();
    }
  });
});
