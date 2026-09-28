// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { ReferenceCreatorDashboardModules } from "./ReferenceCreatorDashboardModules";

const initialLanguage = useI18n.getState().lang;

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

async function modules(language = "ko") {
  useI18n.setState({ lang: language });
  await act(async () => {
    render(<MemoryRouter><ReferenceCreatorDashboardModules /></MemoryRouter>);
  });
}

describe("홈 미니 작업공간의 탐색과 예시 조작", () => {
  it("서로 다른 8개 작업공간을 기존 작업 경로로 연결한다", async () => {
    await modules();
    const region = screen.getByRole("region", { name: "모든 이야기가 연결되는 곳" });
    const articles = within(region).getAllByRole("article");
    expect(articles).toHaveLength(8);
    expect(articles.map((article) => within(within(article).getByRole("heading", { level: 3 })).getByRole("link").getAttribute("href"))).toEqual([
      "/studio", "/studio/assets/characters/new", "/studio/bg3d", "/studio/assets", "/story-lab", "/studio/ai-lab", "/studio/publish", "/community",
    ]);
    expect(within(region).getByRole("link", { name: "전체 기능 보기" }).getAttribute("href")).toBe("/sitemap");
    expect(within(region).getAllByText("예시 작품")).toHaveLength(2);
    expect(within(region).getByText("캐릭터 스터디")).toBeTruthy();
    expect(within(region).queryByText(/최근 프로젝트|참여자|조회 수/u)).toBeNull();
  });

  it("캐릭터 선택은 로컬 이미지 스터디만 바꾼다", async () => {
    await modules();
    const picker = screen.getByRole("group", { name: "예시 캐릭터 선택" });
    const pink = within(picker).getByRole("button", { name: "벚꽃" });
    const blue = within(picker).getByRole("button", { name: "푸른빛" });
    expect(pink.getAttribute("aria-pressed")).toBe("true");
    expect(blue.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".rd-mini-character-portrait img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/character-pink-320.webp");
    fireEvent.click(blue);
    expect(pink.getAttribute("aria-pressed")).toBe("false");
    expect(blue.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".rd-mini-character-portrait img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/character-blue-320.webp");
    const crops = document.querySelectorAll(".rd-mini-expressions img");
    expect(crops).toHaveLength(3);
    expect(Array.from(crops).every((crop) => crop.getAttribute("src")?.endsWith("character-blue-320.webp"))).toBe(true);
  });

  it("배경 미리보기 선택을 접근성 이름과 함께 갱신한다", async () => {
    await modules();
    expect(screen.getByRole("img", { name: "도시 배경 예시" }).getAttribute("src")).toBe("/brand/illustrated-20260928/background-city-640.webp");
    fireEvent.click(screen.getByRole("button", { name: "궁궐 배경 보기" }));
    expect(screen.getByRole("img", { name: "궁궐 배경 예시" }).getAttribute("src")).toBe("/assets/studio/scene-assistant/imagegen25-v1/palace.webp");
    expect(screen.getByRole("button", { name: "궁궐 배경 보기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "도시 배경 보기" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("커뮤니티 예시 분류로 갤러리를 좁히고 전체로 복귀한다", async () => {
    await modules();
    const picker = screen.getByRole("group", { name: "예시 갤러리 분류" });
    expect(document.querySelectorAll(".rd-mini-community-gallery img")).toHaveLength(4);
    fireEvent.click(within(picker).getByRole("button", { name: "캐릭터" }));
    expect(document.querySelectorAll(".rd-mini-community-gallery img")).toHaveLength(2);
    expect(within(picker).getByRole("button", { name: "캐릭터" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(picker).getByRole("button", { name: "전체" }));
    expect(document.querySelectorAll(".rd-mini-community-gallery img")).toHaveLength(4);
  });

  it("발행 예시 체크는 미검수 상태에서 시작하고 개별적으로 되돌릴 수 있다", async () => {
    await modules();
    const checklist = screen.getByRole("group", { name: "발행 준비 예시" });
    const format = within(checklist).getByRole<HTMLInputElement>("checkbox", { name: "규격 확인" });
    const rights = within(checklist).getByRole<HTMLInputElement>("checkbox", { name: "사용 권리 확인" });
    expect(within(checklist).getAllByRole<HTMLInputElement>("checkbox").every((checkbox) => !checkbox.checked)).toBe(true);
    fireEvent.click(format);
    expect(format.checked).toBe(true);
    expect(rights.checked).toBe(false);
    fireEvent.click(format);
    expect(format.checked).toBe(false);
    expect(screen.getByText("준비 목록 예시 · 실제 검수는 발행에서")).toBeTruthy();
    expect(screen.getByRole("link", { name: "발행 & 공유 열기" }).getAttribute("href")).toBe("/studio/publish");
  });

  it("영어 환경에서 제목, 컨트롤, 예시 표기를 영어로 제공한다", async () => {
    await modules("en");
    const region = screen.getByRole("region", { name: "One place for every part of your story" });
    expect(within(region).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Projects", "Character studio", "Background studio", "Asset library", "Storyboard", "AI creative director", "Publish & share", "Community",
    ]);
    expect(within(region).getByRole("group", { name: "Choose an example character" })).toBeTruthy();
    expect(within(region).getByRole("button", { name: "View palace background" })).toBeTruthy();
    expect(within(region).getByRole("checkbox", { name: "Check rights" })).toBeTruthy();
    expect(within(region).getByRole("link", { name: "Explore AI tools" }).getAttribute("href")).toBe("/studio/ai-lab");
    expect(region.textContent).not.toMatch(/[가-힣]/u);
    const names = Array.from(region.querySelectorAll("[aria-label]"), (element) => element.getAttribute("aria-label")).join(" ");
    expect(names).not.toMatch(/[가-힣]/u);
  });
});


it.each([
  ["ko", "캐릭터·말풍선·효과 소재 예시", "망점 패턴", "집중선 효과"],
  ["en", "Character, speech bubble and effect examples", "Halftone pattern", "Speed line effect"],
])("%s CSS 소재 미리보기의 접근성 이름과 이미지 역할을 연결한다", async (locale, groupName, patternName, speedName) => {
  await modules(locale);
  const group = screen.getByRole("group", { name: groupName });
  expect(within(group).getByRole("img", { name: patternName })).toBeTruthy();
  expect(within(group).getByRole("img", { name: speedName })).toBeTruthy();
});
