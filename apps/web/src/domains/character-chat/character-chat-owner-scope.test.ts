/**
 * 캐릭터챗 소유자 스코프 회귀 테스트.
 *
 * 프로필·대화 세션에 소유자가 없어, 같은 브라우저에서 계정을 바꾸면 이전
 * 계정의 프로필을 수정·삭제하고 대화 전문을 이어 읽을 수 있던 혼선을 막는다.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => actor.id,
}));
vi.mock("@/shared/lib/store-api-post", () => ({ apiPost: vi.fn() }));

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
    forbiddenTopics: [],
    appearanceHint: "",
    avatarUrl: "",
    canonSheetId: "",
    chatEnabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  actor.id = null;
  window.localStorage.clear();
  useCharacterChatStore.getState().resetForTests();
});

describe("프로필 소유자 스코프", () => {
  it("만든 계정이 소유자로 찍히고, 다른 계정은 수정·삭제·공개 토글을 할 수 없다", () => {
    actor.id = "user-a";
    const created = useCharacterChatStore.getState().createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    expect(created.ownerId).toBe("user-a");

    actor.id = "user-b";
    const state = useCharacterChatStore.getState();
    expect(state.updateProfile(created.id, draft({ personality: "남이 바꾼 성격" }))).toBeNull();
    state.setProfileChatEnabled(created.id, false);
    state.removeProfile(created.id);
    const after = useCharacterChatStore.getState().getProfile(created.id);
    expect(after?.personality).toBe("호기심이 많고 겁이 없다.");
    expect(after?.chatEnabled).toBe(true);

    actor.id = "user-a";
    expect(
      useCharacterChatStore.getState().updateProfile(created.id, draft({ personality: "내가 바꾼 성격" }))
        ?.personality,
    ).toBe("내가 바꾼 성격");
  });

  it("게스트가 만든 미귀속 프로필은 로그인 후 claim으로 소유가 확정된다", () => {
    const created = useCharacterChatStore.getState().createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");
    expect(created.ownerId).toBeNull();

    actor.id = "user-a";
    useCharacterChatStore.getState().claimUnownedProfiles("user-a");
    expect(useCharacterChatStore.getState().getProfile(created.id)?.ownerId).toBe("user-a");
    // 데모 시드는 claim 대상이 아니다.
    expect(
      useCharacterChatStore.getState().profiles
        .filter((profile) => profile.isDemo)
        .every((profile) => (profile.ownerId ?? null) === null),
    ).toBe(true);
  });
});

describe("대화 세션 소유자 스코프", () => {
  it("대화는 나눈 본인의 세션으로만 이어지고, 다른 계정에게는 새 세션이 열린다", () => {
    actor.id = "author";
    const created = useCharacterChatStore.getState().createProfile(draft());
    if (!created) throw new Error("프로필 생성 실패");

    actor.id = "fan-a";
    const state = useCharacterChatStore.getState();
    state.ensureSession(created.id);
    state.appendMessage(created.id, "fan", "비밀 이야기");
    expect(state.getSession(created.id)?.messages.some((m) => m.text === "비밀 이야기")).toBe(true);

    actor.id = "fan-b";
    const other = useCharacterChatStore.getState();
    expect(other.getSession(created.id)).toBeUndefined();
    const fresh = other.ensureSession(created.id);
    expect(fresh?.messages.some((m) => m.text === "비밀 이야기")).toBe(false);

    actor.id = "fan-a";
    expect(
      useCharacterChatStore.getState().getSession(created.id)?.messages
        .some((m) => m.text === "비밀 이야기"),
    ).toBe(true);
  });
});
