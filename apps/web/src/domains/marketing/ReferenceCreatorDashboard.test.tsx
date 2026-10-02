// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext } from "@/domains/auth/public/session/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";
import { useUi } from "@/shared/lib/ui-store";
import { completeUserAiTextDetailed, UserAiTransportError, type CompletedUserAiText } from "@/shared/ai/user-ai-transport";
import { ReferenceCreatorDashboard } from "./ReferenceCreatorDashboard";
import { HOME_CORE_STUDIOS, HOME_LEARN_MORE, HOME_LUNA_SUGGESTIONS } from "./reference-home-content";

vi.mock("@/shared/ai/user-ai-transport", () => {
  class MockUserAiTransportError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    UserAiTransportError: MockUserAiTransportError,
    completeUserAiTextDetailed: vi.fn(),
    isUserAiQuotaExhaustion: (error: unknown) => error instanceof MockUserAiTransportError && error.code === "quota-exceeded",
  };
});

const completeAi = vi.mocked(completeUserAiTextDetailed);
const completedText = (content: string): CompletedUserAiText => ({
  content,
  connection: {} as CompletedUserAiText["connection"],
  attemptedConnectionIds: [],
  attemptedRouteIds: [],
});

const initialLanguage = useI18n.getState().lang;

beforeEach(() => {
  completeAi.mockReset();
});

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
  it("아이디어 입력이 만들기의 시작점이고 검색 팔레트는 상단 크롬의 몫으로 남는다", async () => {
    await dashboard();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("오늘은 어떤 이야기를만들까요?");
    expect(screen.queryByRole("banner")).toBeNull();
    // 히어로의 주인공은 찾기(⌘K)가 아니라 만들기 입력이다.
    expect(screen.queryByRole("button", { name: "작품·도구·소재, 필요한 것을 찾아보세요" })).toBeNull();
    // 게스트에게는 개인 스트립이 없다.
    expect(screen.queryByRole("region", { name: "내 작업 이어가기" })).toBeNull();
    const idea = screen.getByRole("textbox", { name: "아이디어 입력" });
    fireEvent.change(idea, { target: { value: "비 오는 날의 첫사랑" } });
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe(`/story-lab?idea=${encodeURIComponent("비 오는 날의 첫사랑")}`);
    expect(useUi.getState().commandPaletteOpen).toBe(false);
  });

  it("빈 아이디어로 시작하면 쿼리 없이 스토리 연구실로 이동한다", async () => {
    await dashboard();
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/story-lab");
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
      "/studio/canvas",
    ]);
    fireEvent.click(within(start).getByRole("link", { name: /빈 캔버스/u }));
    expect(observedNavigation).toEqual([{ href: "/studio/canvas", prevented: false }]);
    fireEvent.click(within(start).getByRole("link", { name: /스토리 만들기/u }));
    expect(screen.getByLabelText("현재 URL").textContent).toBe("/story-lab");
  });

  it("기능 목록 그리드는 홈에 쌓지 않고 예시와 편집기 콘셉트를 실제 프로젝트와 구분한다", async () => {
    await dashboard();
    expect(screen.queryByRole("region", { name: "모든 이야기가 연결되는 곳" })).toBeNull();
    expect(screen.getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("figure", { name: /편집기 콘셉트/u }).textContent).toContain("예시는 저장되지 않아요");
    expect(screen.getByRole("region", { name: "예시 작품" })).toBeTruthy();
    expect(screen.getByText("12화 · 어제 업데이트")).toBeTruthy();
    expect(screen.getByText("8화 · 3일 전")).toBeTruthy();
    expect(screen.queryByText("최설의 도시")).toBeNull();
    expect(screen.queryByText(/2024\.11/u)).toBeNull();
  });

  it("로그인하면 홈은 그대로이고 개인 스트립으로 내 홈에 이어진다", async () => {
    useI18n.setState({ lang: "ko" });
    await act(async () => {
      render(<MemoryRouter><SessionContext.Provider value={{ data: { user: { name: "연우" } }, ready: true, status: "authenticated", update: async () => null }}><ReferenceCreatorDashboard /></SessionContext.Provider></MemoryRouter>);
    });
    const strip = screen.getByRole("region", { name: "내 작업 이어가기" });
    expect(within(strip).getByText("연우님, 다시 오셨네요")).toBeTruthy();
    expect(within(strip).getByRole("link", { name: /내 홈 열기/u }).getAttribute("href")).toBe("/home");
    expect(within(strip).getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("오늘은 어떤 이야기를만들까요?");
  });

  it("영어 선택 시 모든 홈 동선과 접근성 이름을 영어로 제공한다", async () => {
    await dashboard("en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("What story will youcreate today?");
    expect(screen.getByRole("textbox", { name: "Idea input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Ask Luna" })).toBeTruthy();
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
    const coreArt = new Set(HOME_CORE_STUDIOS.map((studio) => studio.image));
    for (const img of root?.querySelectorAll("img") ?? []) {
      const src = img.getAttribute("src") ?? "";
      if (img.closest(".rd-core-studios")) {
        expect(coreArt.has(src), src).toBe(true);
      } else if (src.startsWith("/assets/studio/scene-assistant/")) {
        expect(img.closest(".rd-mini-workspace--background")).not.toBeNull();
      } else {
        expect(src).toMatch(/^\/brand\/illustrated-20260928\/(?:(hero|canvas-noir|luna|character-pink|character-blue|background-city|project-romance|project-crimson|blank-canvas|storyboard|materials|background-classroom)-(320|640)\.webp|(hero|luna)\.webp)$/u);
      }
    }
    // 포스터 히어로는 축소 썸네일이 아니라 원본 컨셉 아트를 쓴다.
    expect(document.querySelector(".rd-poster-art")?.getAttribute("src")).toBe("/brand/illustrated-20260928/hero.webp");
  });

  it("드로잉·3D·협업·가상 스튜디오 입구를 첫 화면 가까이에 실제 작업실로 연결한다", async () => {
    await dashboard();
    const core = screen.getByRole("region", { name: "핵심 작업실, 바로 들어가기" });
    const cards = within(core).getAllByRole("listitem");
    expect(cards.map((card) => card.getAttribute("data-core-studio"))).toEqual(["drawing", "three-d", "collaboration", "virtual-studio"]);
    expect(within(core).getByRole("link", { name: "가상 스튜디오 입장" }).getAttribute("href")).toBe("/studio/space");
    expect(within(core).getByRole("link", { name: "제작 관리 열기" }).getAttribute("href")).toBe("/production");
    expect(within(core).getByRole("link", { name: "3D 캐릭터 만들기" }).getAttribute("href")).toBe("/studio/assets/characters/new");
    expect(within(core).getByRole("link", { name: "3D 배경 스튜디오" }).getAttribute("href")).toBe("/studio/bg3d");
    expect(HOME_CORE_STUDIOS.every((studio) => studio.secondary.href !== studio.href)).toBe(true);
  });

  it("Luna는 실제 도구로 가는 제안 칩과 직접 물을 수 있는 입력창을 함께 제공한다", async () => {
    await dashboard();
    const luna = screen.getByRole("complementary", { name: "Luna 창작 안내" });
    expect(within(luna).getByText("안녕하세요! 어떤 이야기를 함께 만들어 볼까요?")).toBeTruthy();
    expect(within(luna).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(HOME_LUNA_SUGGESTIONS.map((item) => item.href));
    expect(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" })).toBeTruthy();
  });

  it("Luna에게 물으면 사용자 AI 전송으로 답하고, 연결이 없으면 키 등록 동선을 안내한다", async () => {
    completeAi.mockResolvedValueOnce(completedText("가제를 정했다면 스토리 연구실에서 인물의 욕망부터 적어 보세요."));
    await dashboard();
    const luna = screen.getByRole("complementary", { name: "Luna 창작 안내" });
    fireEvent.change(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" }), { target: { value: "뭐부터 시작해?" } });
    fireEvent.click(within(luna).getByRole("button", { name: "Luna에게 보내기" }));
    expect(await within(luna).findByText("가제를 정했다면 스토리 연구실에서 인물의 욕망부터 적어 보세요.")).toBeTruthy();
    expect(completeAi).toHaveBeenCalledTimes(1);

    completeAi.mockRejectedValueOnce(new UserAiTransportError("not-configured", "AI 연결이 설정되지 않았습니다"));
    fireEvent.change(within(luna).getByRole("textbox", { name: "Luna에게 물어보기" }), { target: { value: "캐릭터는 어떻게 만들어?" } });
    fireEvent.click(within(luna).getByRole("button", { name: "Luna에게 보내기" }));
    expect(await within(luna).findByText(/AI 연결이 설정되지 않아/u)).toBeTruthy();
    expect(within(luna).getByRole("link", { name: /AI 키 등록하기/u }).getAttribute("href")).toBe("/settings/ai");
  });

  it("홈 하단에서 서비스 소개·영상·제작 과정·원칙으로 이어진다", async () => {
    await dashboard();
    const more = screen.getByRole("navigation", { name: "서비스 더 알아보기" });
    expect(within(more).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(HOME_LEARN_MORE.map((link) => link.href));
  });
});
