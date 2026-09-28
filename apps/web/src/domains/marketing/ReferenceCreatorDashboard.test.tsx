// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";

const initialLanguage = useI18n.getState().lang;

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
  useUi.getState().closeCommandPalette();
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 URL">{location.pathname}{location.search}</output>;
}

async function dashboard(language = "ko") {
  useI18n.setState({ lang: language });
  const observedNavigation: { href: string; prevented: boolean }[] = [];
  await act(async () => {
    render(<MemoryRouter><div role="presentation" onClick={(event) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      // Studio 진입의 네이티브 문서 전환을 관찰한 뒤 jsdom의 실제 페이지 이동만 막는다.
      observedNavigation.push({ href: anchor.getAttribute("href") ?? "", prevented: event.defaultPrevented });
      event.preventDefault();
    }}><ReferenceCreatorDashboard /></div><LocationProbe /></MemoryRouter>);
  });
  return observedNavigation;
}

describe("참조 디자인 크리에이터 홈의 실제 동선", () => {
  it("검색으로 공통 팔레트를 열고 검색과 알림을 흉내 내는 별도 GNB를 만들지 않는다", async () => {
    await dashboard();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("오늘은 어떤 이야기를만들까요?");
    expect(screen.queryByRole("banner")).toBeNull();
    expect(useUi.getState().commandPaletteOpen).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "작품·도구·소재, 필요한 것을 찾아보세요" }));
    expect(useUi.getState().commandPaletteOpen).toBe(true);
    expect(screen.getAllByRole("button", { name: "작품·도구·소재, 필요한 것을 찾아보세요" })).toHaveLength(1);
  });

  it("다섯 시작 동선이 실제 작업과 템플릿으로 이동한다", async () => {
    const observedNavigation = await dashboard();
    const start = screen.getByRole("navigation", { name: "무엇부터 시작할까요?" });
    const links = within(start).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/studio/new?kind=webtoon&template=webtoon-vertical",
      "/story-lab",
      "/studio/assets/characters/new",
      "/studio/bg3d",
      "/studio/new?kind=illustration&template=illustration-blank",
    ]);
    fireEvent.click(within(start).getByRole("link", { name: /빈 캔버스/u }));
    expect(observedNavigation).toEqual([{ href: "/studio/new?kind=illustration&template=illustration-blank", prevented: false }]);
    fireEvent.click(within(start).getByRole("link", { name: /스토리 만들기/u }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/story-lab");
  });

  it("8개 제작 모듈을 제공하고 실제 프로젝트와 설명용 그림을 구분한다", async () => {
    await dashboard();
    const modules = screen.getByRole("region", { name: "모든 이야기가 연결되는 곳" });
    const workspaces = within(modules).getAllByRole("article");
    expect(workspaces).toHaveLength(8);
    expect(workspaces.map((workspace) => within(within(workspace).getByRole("heading", { level: 3 })).getByRole("link").getAttribute("href"))).toEqual([
      "/studio", "/studio/assets/characters/new", "/studio/bg3d", "/studio/assets", "/story-lab", "/studio/ai-lab", "/studio/publish", "/community",
    ]);
    expect(within(modules).getByRole("link", { name: "전체 기능 보기" }).getAttribute("href")).toBe("/sitemap");
    expect(screen.getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("figure", { name: /편집기 콘셉트/u }).textContent).toContain("예시는 저장되지 않아요");
    expect(screen.getByRole("region", { name: "예시 작품" })).toBeTruthy();
    expect(screen.queryByText("최설의 도시")).toBeNull();
    expect(screen.queryByText(/2024\.11/u)).toBeNull();
  });

  it("영어 선택 시 모든 홈 동선과 접근성 이름을 영어로 제공한다", async () => {
    await dashboard("en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("What story will youcreate today?");
    expect(screen.getByRole("button", { name: "Find projects, tools and creative materials" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Where would you like to start?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My projects" }).getAttribute("href")).toBe("/studio");
    const root = document.querySelector("[data-reference-dashboard]");
    expect(root?.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByRole("textbox", { name: "Edit sample dialogue" }).getAttribute("value")).toBe("…This story isn't over.");
    for (const element of root?.querySelectorAll("[aria-label], [alt]") ?? []) {
      expect(`${element.getAttribute("aria-label") ?? ""}${element.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });

  it("예시 컷을 고르면 로컬 미리보기만 바뀌고 편집기로 이동하거나 검색을 실행하지 않는다", async () => {
    const observedNavigation = await dashboard();
    const frames = screen.getByRole("group", { name: "예시 컷 선택" });
    fireEvent.click(within(frames).getByRole("button", { name: "예시 컷 3 선택" }));
    expect(within(frames).getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(within(frames).getByRole("button", { name: "예시 컷 3 선택" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: "예시 컷 3" }).getAttribute("src")).toBe("/brand/illustrated-20260928/character-blue-640.webp");
    expect(screen.getByRole("img", { name: "예시 컷 3" }).getAttribute("srcset")).toContain("character-blue-320.webp 320w");
    expect(observedNavigation).toEqual([]);
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/");
    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("예시 대사를 편집하면 말풍선이 바뀌고 다시 홈을 열 때 저장된 작품으로 남지 않는다", async () => {
    await dashboard();
    fireEvent.change(screen.getByRole("textbox", { name: "예시 대사 편집" }), { target: { value: "우리의 다음 장면" } });
    expect(screen.getByText("우리의 다음 장면").className).toBe("rd-editor-bubble");
    expect(screen.getByRole("textbox", { name: "예시 대사 편집" }).getAttribute("maxlength")).toBe("60");
    cleanup();
    await dashboard();
    expect(screen.queryByText("우리의 다음 장면")).toBeNull();
    expect(screen.getByRole("textbox", { name: "예시 대사 편집" }).getAttribute("value")).toBe("…아직 끝나지 않았어.");
  });

  it("모든 이미지 경로는 제공된 삽화 계약과 배경 스튜디오 보조 소재만 사용한다", async () => {
    await dashboard();
    const root = document.querySelector("[data-reference-dashboard]");
    for (const img of root?.querySelectorAll("img") ?? []) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("/assets/studio/scene-assistant/")) {
        expect(img.closest(".rd-mini-workspace--background")).not.toBeNull();
      } else {
        expect(src).toMatch(/^\/brand\/illustrated-20260928\/(hero|canvas-noir|luna|character-pink|character-blue|background-city|project-romance|project-crimson|blank-canvas|storyboard|materials|background-classroom)-(320|640)\.webp$/u);
      }
    }
  });
});
