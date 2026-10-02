/**
 * 캐릭터 토크 스토어 테스트 — 프로필 CRUD·세션·사용량 계측.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { useCharacterChatStore } from "./character-chat-store";
import type { CharacterChatProfileDraft } from "./character-chat-types";

function draft(overrides: Partial<CharacterChatProfileDraft> = {}): CharacterChatProfileDraft {
  return {
    characterName: "미르",
    workTitle: "구름 항해사",
    workSlug: "cloud-voyager",
    authorName: "작가이",
    description: "하늘 배의 견습 항해사",
    personality: "호기심이 많고 겁이 없다.",
    speechStyle: "밝은 존댓말",
    worldview: "구름 바다를 항해하는 세계.",
    greeting: "안녕하세요, 항해사 미르예요!",
    forbiddenTopics: ["선장의 과거"],
    appearanceHint: "바람개비 모자",
    avatarUrl: "",
    canonSheetId: "",
    chatEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useCharacterChatStore.getState().resetForTests();
});

describe("프로필", () => {
  it("처음에는 파일럿 데모 프로필이 들어 있다", () => {
    const profiles = useCharacterChatStore.getState().profiles;
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((profile) => profile.isDemo)).toBe(true);
  });

  it("프로필을 만들면 목록 맨 앞에 쌓인다", () => {
    const created = useCharacterChatStore.getState().createProfile(draft());
    expect(created?.characterName).toBe("미르");
    expect(useCharacterChatStore.getState().profiles[0]?.id).toBe(created?.id);
  });

  it("프로필 수정은 값을 갱신하고 공개 토글은 바로 반영된다", () => {
    const state = useCharacterChatStore.getState();
    const created = state.createProfile(draft({ chatEnabled: false }));
    if (!created) throw new Error("프로필 생성 실패");
    state.setProfileChatEnabled(created.id, true);
    expect(useCharacterChatStore.getState().getProfile(created.id)?.chatEnabled).toBe(true);
    const revised = state.updateProfile(created.id, draft({ personality: "속은 여리다." }));
    expect(revised?.personality).toBe("속은 여리다.");
  });

  it("삭제하면 세션도 함께 사라진다", () => {
    const state = useCharacterChatStore.getState();
    const created = state.createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    state.ensureSession(created.id);
    state.removeProfile(created.id);
    expect(useCharacterChatStore.getState().getProfile(created.id)).toBeUndefined();
    expect(useCharacterChatStore.getState().getSession(created.id)).toBeUndefined();
  });
});

describe("세션과 계측", () => {
  it("세션을 시작하면 캐릭터 인사말이 첫 메시지가 된다", () => {
    const state = useCharacterChatStore.getState();
    const created = state.createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    const session = state.ensureSession(created.id);
    expect(session?.messages).toHaveLength(1);
    expect(session?.messages[0]?.role).toBe("character");
    expect(session?.messages[0]?.text).toContain("미르");
    // 인사말은 캐릭터 답변 수로 세지 않는다.
    expect(state.activitySummary(created.id).characterMessageCount).toBe(0);
  });

  it("없는 프로필의 세션은 시작되지 않는다", () => {
    expect(useCharacterChatStore.getState().ensureSession("nope")).toBeNull();
  });

  it("메시지를 쌓으면 사용량이 집계되고 요약에 반영된다", () => {
    const state = useCharacterChatStore.getState();
    const created = state.createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    state.ensureSession(created.id);
    state.appendMessage(created.id, "fan", "안녕!");
    state.appendMessage(created.id, "character", "안녕하세요!");
    state.recordBlockedTurn(created.id);
    const summary = state.activitySummary(created.id);
    expect(summary.sessionCount).toBe(1);
    expect(summary.fanMessageCount).toBe(1);
    expect(summary.characterMessageCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.lastActiveAt).not.toBeNull();
  });

  it("세션 없는 프로필에 메시지를 쌓을 수 없다", () => {
    const state = useCharacterChatStore.getState();
    const created = state.createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    expect(state.appendMessage(created.id, "fan", "안녕")).toBeNull();
  });
});
