// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CharacterShaperLearnCenter } from "./CharacterShaperLearnCenter";
import { SHAPER_LEARN_TABS, formatClipDuration } from "./character-shaper-learn-clips";

function renderCenter() {
  return render(
    <MemoryRouter initialEntries={["/shaper"]}>
      <CharacterShaperLearnCenter />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("CharacterShaperLearnCenter", () => {
  it("shows four tabs and opens on the presets track", () => {
    const { container } = renderCenter();

    const tablist = screen.getByRole("tablist", { name: "학습 트랙" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "프리셋 활용",
      "직접 그리기 · 포즈 편집",
      "AI 기능",
      "실전 워크플로우",
    ]);

    // 기본 탭은 선택 상태이고 패널과 연결된다.
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute("id")).toBe(tabs[0]?.getAttribute("aria-controls"));
    expect(panel?.getAttribute("aria-labelledby")).toBe(tabs[0]?.getAttribute("id"));

    expect(screen.getByRole("heading", { level: 2, name: "3D 학습 센터" })).toBeTruthy();
    expect(screen.getByText("15개 슬롯 카드를 고르고 되돌리는 기본 동작을 30초씩 익힙니다.")).toBeTruthy();
  });

  it("lists three 30-second clip cards per tab with title, description and difficulty", () => {
    renderCenter();

    for (const tabId of ["presets", "draw", "ai", "workflow"] as const) {
      const tabData = SHAPER_LEARN_TABS.find((tab) => tab.id === tabId)!;
      fireEvent.click(screen.getByRole("tab", { name: tabData.title }));
      expect(screen.getByText(tabData.blurb)).toBeTruthy();

      const panel = screen.getByRole("tabpanel");
      const cards = within(panel).getAllByRole("listitem");
      expect(cards).toHaveLength(tabData.clips.length);

      for (const clip of tabData.clips) {
        const card = within(panel)
          .getAllByRole("listitem")
          .find((item) => within(item).queryByText(clip.title) !== null);
        expect(card, clip.id).toBeTruthy();
        expect(within(card!).getByText(clip.description)).toBeTruthy();
        expect(within(card!).getByText(clip.difficulty)).toBeTruthy();
      }
      // 모든 클립은 30초 포맷 표기를 갖는다.
      expect(within(panel).getAllByText("0:30").length).toBe(tabData.clips.length);
      // 실제 영상이 없으므로 자동 재생되는 video 요소가 없고 준비 중 안내가 뜬다.
      expect(panel.querySelector("video")).toBeNull();
      expect(within(panel).getAllByText(/영상 준비 중/).length).toBe(tabData.clips.length);
    }
  });

  it("sends each track's try-it CTA to a real, registered studio route", () => {
    renderCenter();

    // 탭별 CTA는 실제 등록된 스튜디오 패널로만 연결된다(깨진 링크 금지).
    // 캐릭터 작업실 — 데이터의 /studio/character 별칭은 이 랜딩으로 되돌아오므로
    //   랜딩에서 편집기를 바로 여는 ?editor=open 주소로 바뀐다.
    // /studio/poser — 포즈 포저(StudioCuttoonEditorHost surface "poser", route-stage 테스트)
    // /studio?preset=4cut — 컷툰 프리셋(MakeHub "4컷·컷툰" 항목)
    const expectedHrefs: Record<string, string> = {
      presets: "/studio/assets/characters/new?editor=open",
      draw: "/studio/poser",
      ai: "/studio/assets/characters/new?editor=open",
      workflow: "/studio?preset=4cut",
    };

    for (const tabData of SHAPER_LEARN_TABS) {
      fireEvent.click(screen.getByRole("tab", { name: tabData.title }));
      const cta = screen.getByRole("link", { name: `바로 해보기 — ${tabData.studioLabel} 열기` });
      expect(cta.textContent).toContain("바로 해보기");
      expect(cta.getAttribute("href")).toBe(expectedHrefs[tabData.id]);
    }
  });
});

describe("shaper learn clips data contract", () => {
  it("keeps tab/clip ids unique and every clip on the 30-second format", () => {
    const tabIds = SHAPER_LEARN_TABS.map((tab) => tab.id);
    expect(new Set(tabIds).size).toBe(tabIds.length);

    const clipIds = SHAPER_LEARN_TABS.flatMap((tab) => tab.clips.map((clip) => clip.id));
    expect(new Set(clipIds).size).toBe(clipIds.length);

    for (const tab of SHAPER_LEARN_TABS) {
      expect(tab.clips.length).toBeGreaterThan(0);
      for (const clip of tab.clips) {
        expect(clip.durationSeconds).toBe(30);
        expect(formatClipDuration(clip.durationSeconds)).toBe("0:30");
        expect(clip.title.trim().length).toBeGreaterThan(0);
        expect(clip.description.trim().length).toBeGreaterThan(0);
        // videoUrl이 있으면 썸네일 대체 텍스트도 함께 있어야 한다.
        if (clip.videoUrl) expect(clip.posterAlt?.trim().length).toBeGreaterThan(0);
      }
      expect(tab.studioHref.startsWith("/studio")).toBe(true);
    }
  });
});
