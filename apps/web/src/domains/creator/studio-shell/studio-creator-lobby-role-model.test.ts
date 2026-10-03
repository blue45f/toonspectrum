import { describe, expect, it } from "vitest";

import { CREATOR_ROLE_IDS } from "@/shared/lib/creator-role-contract";

import { orderStudioLobbyActionsForRole } from "./studio-creator-lobby-role-model";

/** StudioCreatorLobby의 LOBBY_ACTIONS와 같은 href 집합(순서 포함). */
const WEBTOON = "/studio/new?kind=webtoon&template=webtoon-vertical";
const STORY_LAB = "/story-lab";
const CHARACTERS = "/studio/assets/characters/new";
const BACKGROUND = "/studio/bg3d";
const BLANK = "/studio/new?kind=illustration&template=illustration-blank";
const PRODUCTION = "/production";
const SPACE = "/studio/space";

const LOBBY_HREFS = [WEBTOON, STORY_LAB, CHARACTERS, BACKGROUND, BLANK, PRODUCTION, SPACE] as const;

function lobbyActions() {
  return LOBBY_HREFS.map((href) => ({ href }));
}

function hrefsOf(result: ReturnType<typeof orderStudioLobbyActionsForRole<{ href: string }>>) {
  return result.actions.map((action) => action.href);
}

describe("orderStudioLobbyActionsForRole", () => {
  it("keeps the neutral order when no role is active", () => {
    for (const role of [null, undefined] as const) {
      const result = orderStudioLobbyActionsForRole(lobbyActions(), role);
      expect(hrefsOf(result)).toEqual([...LOBBY_HREFS]);
      expect(result.featured).toBeNull();
    }
  });

  it("never drops or duplicates a card for any of the 16 roles", () => {
    for (const role of CREATOR_ROLE_IDS) {
      const result = orderStudioLobbyActionsForRole(lobbyActions(), role);
      expect(result.actions).toHaveLength(LOBBY_HREFS.length);
      expect(new Set(hrefsOf(result))).toEqual(new Set(LOBBY_HREFS));
    }
  });

  it("pulls story and production forward for a story writer (검토 §5 글·기획)", () => {
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "story");
    expect(hrefsOf(result)).toEqual([
      STORY_LAB,
      PRODUCTION,
      WEBTOON,
      CHARACTERS,
      BACKGROUND,
      BLANK,
      SPACE,
    ]);
    expect(result.featured?.href).toBe(STORY_LAB);
  });

  it("puts production first for editor, producer and reviewer (검토 §5 편집·검수·PD)", () => {
    for (const role of ["editor", "producer", "reviewer"] as const) {
      const result = orderStudioLobbyActionsForRole(lobbyActions(), role);
      expect(result.actions[0]?.href).toBe(PRODUCTION);
      expect(result.featured?.href).toBe(PRODUCTION);
    }
    // 편집자는 제작 관리 → 새 웹툰 → 스토리까지 §5 매트릭스와 정확히 일치한다.
    expect(hrefsOf(orderStudioLobbyActionsForRole(lobbyActions(), "editor")).slice(0, 3))
      .toEqual([PRODUCTION, WEBTOON, STORY_LAB]);
  });

  it("keeps the current order for a solo creator (검토 §5: 현행 7개 순서 유지)", () => {
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "creator");
    expect(hrefsOf(result)).toEqual([...LOBBY_HREFS]);
    expect(result.featured?.href).toBe(WEBTOON);
  });

  it("puts the character card first for a character designer via the assets destination", () => {
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "character");
    expect(result.actions[0]?.href).toBe(CHARACTERS);
    expect(result.featured?.href).toBe(CHARACTERS);
  });

  it("puts the background card first for background and 3D roles", () => {
    for (const role of ["background", "three-d"] as const) {
      const result = orderStudioLobbyActionsForRole(lobbyActions(), role);
      expect(result.actions[0]?.href).toBe(BACKGROUND);
    }
  });

  it("orders storyboard as story lab, production, then new webtoon from its declared actions", () => {
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "storyboard");
    expect(hrefsOf(result).slice(0, 3)).toEqual([STORY_LAB, PRODUCTION, WEBTOON]);
  });

  it("does not treat the library itself (/studio) as a quick-start card", () => {
    // 식자 직군의 첫 액션은 "/studio"(식자 원고 열기)지만 빠른 시작 카드가 아니므로
    // 어떤 카드도 그 액션에 끌려오지 않고, 두 번째 액션인 스토리 랩이 앞으로 온다.
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "lettering");
    expect(hrefsOf(result)).toEqual([
      STORY_LAB,
      WEBTOON,
      CHARACTERS,
      BACKGROUND,
      BLANK,
      PRODUCTION,
      SPACE,
    ]);
  });

  it("falls back to the neutral order when a role declares no lobby destination (educator)", () => {
    const result = orderStudioLobbyActionsForRole(lobbyActions(), "educator");
    expect(hrefsOf(result)).toEqual([...LOBBY_HREFS]);
    expect(result.featured).toBeNull();
  });

  it("does not mutate the input array", () => {
    const input = lobbyActions();
    const snapshot = input.map((action) => action.href);
    orderStudioLobbyActionsForRole(input, "editor");
    expect(input.map((action) => action.href)).toEqual(snapshot);
  });
});
