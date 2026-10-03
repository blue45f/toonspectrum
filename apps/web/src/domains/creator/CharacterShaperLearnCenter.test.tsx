// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CharacterShaperLearnCenter } from "./CharacterShaperLearnCenter";
import {
  SHAPER_LEARN_LEVEL_LABEL,
  SHAPER_LEARN_TABS,
  SHAPER_LEARN_TABS_EN,
  formatClipDuration,
} from "./character-shaper-learn-clips";

import { useI18n } from "@/shared/lib/i18n";

function renderCenter() {
  return render(
    <MemoryRouter initialEntries={["/shaper"]}>
      <CharacterShaperLearnCenter />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("CharacterShaperLearnCenter", () => {
  it("shows four tracks and opens on the presets track", () => {
    const { container } = renderCenter();

    const tablist = screen.getByRole("tablist", { name: "학습 트랙" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "프리셋 활용",
      "직접 그리기 · 포즈 편집",
      "AI 기능",
      "실전 워크플로우",
    ]);

    // 기본 트랙은 선택 상태이고 패널과 연결된다. 선택되지 않은 탭은 Tab 순서에서 빠진다.
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    const panel = container.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute("id")).toBe(tabs[0]?.getAttribute("aria-controls"));
    expect(panel?.getAttribute("aria-labelledby")).toBe(tabs[0]?.getAttribute("id"));

    expect(screen.getByText("15개 슬롯 카드를 고르고 되돌리는 기본 동작을 30초씩 익힙니다.")).toBeTruthy();
  });

  it("moves between tracks with the arrow keys", () => {
    renderCenter();

    const first = screen.getByRole("tab", { name: "프리셋 활용" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "직접 그리기 · 포즈 편집" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "직접 그리기 · 포즈 편집" }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(first.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "실전 워크플로우" }).getAttribute("aria-selected")).toBe("true");
  });

  it("lists three 30-second lessons per track with title, description and level", () => {
    renderCenter();

    for (const tabId of ["presets", "draw", "ai", "workflow"] as const) {
      const tabData = SHAPER_LEARN_TABS.find((tab) => tab.id === tabId)!;
      fireEvent.click(screen.getByRole("tab", { name: tabData.title }));
      expect(screen.getByText(tabData.blurb)).toBeTruthy();

      const panel = screen.getByRole("tabpanel");
      const rows = within(panel).getAllByRole("listitem");
      expect(rows).toHaveLength(tabData.clips.length);

      for (const clip of tabData.clips) {
        const row = rows.find((item) => within(item).queryByText(clip.title) !== null);
        expect(row, clip.id).toBeTruthy();
        expect(within(row!).getByText(clip.description)).toBeTruthy();
        expect(within(row!).getByText(SHAPER_LEARN_LEVEL_LABEL[clip.level][0])).toBeTruthy();
      }
      // 모든 클립은 30초 포맷 표기를 갖는다.
      expect(within(panel).getAllByText("0:30").length).toBe(tabData.clips.length);
      // 실제 영상이 없으므로 video 요소가 없고, 준비 중 안내는 클립마다가 아니라 한 번만 나온다.
      expect(panel.querySelector("video")).toBeNull();
      expect(within(panel).getAllByText(/영상은 아직 준비 중입니다/)).toHaveLength(1);
    }
  });

  it("sends each track's try-it CTA to a real, registered studio route", () => {
    renderCenter();

    // 탭별 CTA는 실제 등록된 스튜디오 패널로만 연결된다(깨진 링크 금지).
    // 캐릭터 작업실 — 데이터의 /studio/character 별칭은 이 랜딩으로 되돌아오므로
    //   랜딩에서 편집기를 바로 여는 ?editor=open 주소로 바뀐다.
    // 표면 드로잉·포즈 클립도 같은 편집기에서 따라 할 수 있어(/studio/poser의 데생 인형에는 표면 드로잉이 없다)
    //   캐릭터 작업실로 보낸다.
    // /studio?preset=4cut — 컷툰 프리셋(MakeHub "4컷·컷툰" 항목)
    const expectedHrefs: Record<string, string> = {
      presets: "/studio/assets/characters/new?editor=open",
      draw: "/studio/assets/characters/new?editor=open",
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

  it("speaks English with the same routes when the UI language is English", () => {
    useI18n.setState({ lang: "en" });
    renderCenter();

    expect(screen.getByRole("tablist", { name: "Learning tracks" })).toBeTruthy();
    for (const tabData of SHAPER_LEARN_TABS_EN) {
      fireEvent.click(screen.getByRole("tab", { name: tabData.title }));
      expect(screen.getByText(tabData.blurb)).toBeTruthy();
      const cta = screen.getByRole("link", { name: `Try it now — open ${tabData.studioLabel}` });
      expect(cta.getAttribute("href")).toBeTruthy();
      for (const clip of tabData.clips) expect(screen.getByText(clip.title), clip.id).toBeTruthy();
    }
    expect(screen.getAllByText(/Videos are still in production/)).toHaveLength(1);
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

  it("keeps the English tree the same shape as the Korean one so the screen can pair them", () => {
    expect(SHAPER_LEARN_TABS_EN).toHaveLength(SHAPER_LEARN_TABS.length);
    SHAPER_LEARN_TABS.forEach((koTab, tabIndex) => {
      const enTab = SHAPER_LEARN_TABS_EN[tabIndex]!;
      // 문자열이 아닌 값은 두 언어가 같아야 한다.
      expect(enTab.id).toBe(koTab.id);
      expect(enTab.studioHref).toBe(koTab.studioHref);
      expect(enTab.clips.map((clip) => [clip.id, clip.level, clip.durationSeconds]))
        .toEqual(koTab.clips.map((clip) => [clip.id, clip.level, clip.durationSeconds]));
      // 영어 문구는 비어 있지 않고 한글이 섞이지 않는다.
      for (const text of [enTab.title, enTab.blurb, enTab.studioLabel, ...enTab.clips.flatMap((clip) => [clip.title, clip.description])]) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/[가-힣]/u);
      }
    });
  });
});
