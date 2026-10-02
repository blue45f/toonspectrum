/**
 * 캐릭터 챗 프로필 모델 테스트 — 정규화·검증·공개 선택 규칙.
 */

import { describe, expect, it } from "vitest";

import {
  buildCharacterChatProfile,
  characterChatProfileToDraft,
  findPublicProfileForWork,
  normalizeForbiddenTopics,
  resolveCharacterGreeting,
  reviseCharacterChatProfile,
  selectPublicCharacterChatProfiles,
  validateCharacterChatProfileDraft,
} from "./character-chat-profile";
import type { CharacterChatProfileDraft } from "./character-chat-types";

function draft(overrides: Partial<CharacterChatProfileDraft> = {}): CharacterChatProfileDraft {
  return {
    characterName: "레이나",
    workTitle: "달 그림자 기사단",
    workSlug: "moon-shadow-knights",
    authorName: "작가김",
    description: "떠돌이 검사",
    personality: "겉은 차갑지만 약자를 못 지나친다.",
    speechStyle: "짧은 반말",
    worldview: "달이 두 개 뜨는 왕국 아르테미아.",
    greeting: "…누구지. 볼일이 있으면 짧게 말해.",
    forbiddenTopics: ["왕의 죽음"],
    appearanceHint: "은발, 왼쪽 눈 밑 흉터",
    avatarUrl: "",
    canonSheetId: "",
    chatEnabled: true,
    ...overrides,
  };
}

describe("buildCharacterChatProfile", () => {
  it("입력을 정규화하고 상한을 강제한다", () => {
    const profile = buildCharacterChatProfile(
      draft({ characterName: "  레이나   ", personality: "a".repeat(900) }),
      { id: "p1", now: "2026-10-02T00:00:00.000Z" },
    );
    expect(profile.characterName).toBe("레이나");
    expect(profile.personality.length).toBeLessThanOrEqual(600);
    expect(profile.createdAt).toBe("2026-10-02T00:00:00.000Z");
    expect(profile.workSlug).toBe("moon-shadow-knights");
  });

  it("슬러그를 정규화하고 빈 슬러그는 null이다", () => {
    expect(buildCharacterChatProfile(draft({ workSlug: " Moon  Shadow " })).workSlug).toBe(
      "moon-shadow",
    );
    expect(buildCharacterChatProfile(draft({ workSlug: "   " })).workSlug).toBeNull();
  });

  it("허용되지 않은 이미지 URL은 버린다", () => {
    expect(buildCharacterChatProfile(draft({ avatarUrl: "javascript:alert(1)" })).avatarUrl).toBeNull();
    expect(buildCharacterChatProfile(draft({ avatarUrl: "data:image/png;base64,xx" })).avatarUrl).toBeNull();
    expect(buildCharacterChatProfile(draft({ avatarUrl: "/assets/reina.png" })).avatarUrl).toBe(
      "/assets/reina.png",
    );
    expect(buildCharacterChatProfile(draft({ avatarUrl: "https://example.com/a.png" })).avatarUrl).toBe(
      "https://example.com/a.png",
    );
  });
});

describe("normalizeForbiddenTopics", () => {
  it("중복과 빈 항목을 제거하고 상한을 적용한다", () => {
    expect(normalizeForbiddenTopics(["결말", " 결말 ", "", "정체"])).toEqual(["결말", "정체"]);
    expect(normalizeForbiddenTopics(Array.from({ length: 20 }, (_, i) => `주제${i}`))).toHaveLength(12);
  });
});

describe("validateCharacterChatProfileDraft", () => {
  it("필수 항목이 비면 사유를 돌려준다", () => {
    const errors = validateCharacterChatProfileDraft(
      draft({ characterName: " ", personality: "", speechStyle: "" }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("챗 공개인데 세계관이 비면 막는다", () => {
    expect(validateCharacterChatProfileDraft(draft({ worldview: "" }))).toHaveLength(1);
    expect(
      validateCharacterChatProfileDraft(draft({ worldview: "", chatEnabled: false })),
    ).toHaveLength(0);
  });

  it("완성된 초안은 통과한다", () => {
    expect(validateCharacterChatProfileDraft(draft())).toEqual([]);
  });
});

describe("공개 선택", () => {
  it("opt-in한 프로필만 공개 목록에 들어간다", () => {
    const open = buildCharacterChatProfile(draft(), { id: "open" });
    const closed = buildCharacterChatProfile(draft({ chatEnabled: false }), { id: "closed" });
    expect(selectPublicCharacterChatProfiles([open, closed]).map((p) => p.id)).toEqual(["open"]);
  });

  it("작품 슬러그로 공개 프로필을 찾는다", () => {
    const open = buildCharacterChatProfile(draft(), { id: "open" });
    expect(findPublicProfileForWork([open], "Moon-Shadow-Knights")?.id).toBe("open");
    expect(findPublicProfileForWork([open], "other-work")).toBeNull();
    expect(findPublicProfileForWork([open], null)).toBeNull();
  });
});

describe("수정과 인사말", () => {
  it("수정해도 id와 생성 시각은 유지된다", () => {
    const original = buildCharacterChatProfile(draft(), {
      id: "p1",
      now: "2026-10-01T00:00:00.000Z",
    });
    const revised = reviseCharacterChatProfile(
      original,
      draft({ personality: "속은 따뜻하다." }),
      "2026-10-02T00:00:00.000Z",
    );
    expect(revised.id).toBe("p1");
    expect(revised.createdAt).toBe("2026-10-01T00:00:00.000Z");
    expect(revised.updatedAt).toBe("2026-10-02T00:00:00.000Z");
    expect(revised.personality).toBe("속은 따뜻하다.");
  });

  it("초안 왕복 변환이 값을 보존한다", () => {
    const profile = buildCharacterChatProfile(draft(), { id: "p1" });
    const roundTripped = buildCharacterChatProfile(characterChatProfileToDraft(profile), {
      id: "p1",
    });
    expect(roundTripped.characterName).toBe(profile.characterName);
    expect(roundTripped.forbiddenTopics).toEqual(profile.forbiddenTopics);
    expect(roundTripped.chatEnabled).toBe(profile.chatEnabled);
  });

  it("인사가 없으면 기본 인사를 만든다", () => {
    const profile = buildCharacterChatProfile(draft({ greeting: "" }), { id: "p1" });
    expect(resolveCharacterGreeting(profile)).toContain("레이나");
    const withGreeting = buildCharacterChatProfile(draft(), { id: "p2" });
    // 저장 시 NFKC 정규화로 "…"는 "..."이 된다 — 그대로 돌려주는지 확인한다.
    expect(resolveCharacterGreeting(withGreeting)).toBe("...누구지. 볼일이 있으면 짧게 말해.");
  });
});
