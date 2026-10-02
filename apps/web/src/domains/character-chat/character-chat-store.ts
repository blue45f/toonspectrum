/**
 * 캐릭터 토크 스토어 — 프로필·대화·사용량 계측.
 *
 * 게스트-퍼스트 정책(컷츠 스토어와 동일):
 * - 프로필 작성·대화·열람은 로그인 없이 동작하고, 모든 기록은 먼저
 *   이 브라우저(localStorage)에 남는다.
 * - 로그인 상태에서는 프로필 저장 시 서버(`/api/me/character-chat-profiles`)에도
 *   write-through를 시도한다. 서버가 없거나 실패해도 로컬 기록은 유지된다.
 * - 대화 내용 자체는 서버로 보내지 않는다 — 작가가 받는 건 메시지 수가
 *   아니라 활동 요약(몇 번·얼마나 대화했는지)뿐이다.
 *
 * 사용량 계측은 처음부터 붙인다. 플랫폼 키 경로(월 상한)를 열 때 이 숫자가
 * 그대로 과금·상한 판정의 근거가 된다.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { apiPost } from "@/shared/lib/store-api-post";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import {
  CHARACTER_CHAT_PROFILE_LIMIT,
  CHARACTER_CHAT_PROFILES_SERVER_PATH,
  CHARACTER_CHAT_STORAGE_KEY,
  buildCharacterChatProfile,
  characterChatProfileToDraft,
  resolveCharacterGreeting,
  reviseCharacterChatProfile,
} from "./character-chat-profile";
import { buildSeedCharacterChatProfiles } from "./character-chat-seed";
import type {
  CharacterChatActivitySummary,
  CharacterChatMessage,
  CharacterChatProfile,
  CharacterChatProfileDraft,
  CharacterChatRole,
  CharacterChatSession,
} from "./character-chat-types";

/** 세션 하나에 유지하는 최근 메시지 상한 — 저장 공간 보호. */
export const CHARACTER_CHAT_SESSION_MESSAGE_LIMIT = 200;

interface ProfileUsageCounters {
  readonly fanMessages: number;
  readonly characterMessages: number;
  readonly blocked: number;
}

const EMPTY_USAGE: ProfileUsageCounters = { fanMessages: 0, characterMessages: 0, blocked: 0 };

interface CharacterChatState {
  readonly profiles: readonly CharacterChatProfile[];
  readonly sessions: readonly CharacterChatSession[];
  readonly usageByProfile: Readonly<Record<string, ProfileUsageCounters>>;

  /** 초안으로 프로필을 만들고 저장한다. 상한을 넘으면 null. */
  createProfile: (draft: CharacterChatProfileDraft) => CharacterChatProfile | null;
  /** 기존 프로필을 초안으로 갱신한다. */
  updateProfile: (profileId: string, draft: CharacterChatProfileDraft) => CharacterChatProfile | null;
  removeProfile: (profileId: string) => void;
  setProfileChatEnabled: (profileId: string, enabled: boolean) => void;
  getProfile: (profileId: string) => CharacterChatProfile | undefined;
  /** 캐릭터와의 대화를 가져오거나(없으면 인사말로) 시작한다. */
  ensureSession: (profileId: string) => CharacterChatSession | null;
  getSession: (profileId: string) => CharacterChatSession | undefined;
  appendMessage: (profileId: string, role: CharacterChatRole, text: string) => CharacterChatMessage | null;
  /** 금지 주제 입력이 막힌 횟수를 센다(작가 요약용). */
  recordBlockedTurn: (profileId: string) => void;
  /** 작가 요약 리포트 — 대화 내용은 포함하지 않는다. */
  activitySummary: (profileId: string) => CharacterChatActivitySummary;
  resetForTests: () => void;
}

function writeThroughProfile(profile: CharacterChatProfile): void {
  // 로그인한 경우에만 서버 미러를 시도한다. 실패해도 로컬이 정본이다.
  if (!getAuthUserId()) return;
  apiPost(CHARACTER_CHAT_PROFILES_SERVER_PATH, profile);
}

function trimMessages(messages: readonly CharacterChatMessage[]): CharacterChatMessage[] {
  return messages.length > CHARACTER_CHAT_SESSION_MESSAGE_LIMIT
    ? messages.slice(-CHARACTER_CHAT_SESSION_MESSAGE_LIMIT)
    : [...messages];
}

function initialState() {
  return {
    profiles: buildSeedCharacterChatProfiles(),
    sessions: [] as CharacterChatSession[],
    usageByProfile: {} as Record<string, ProfileUsageCounters>,
  };
}

export const useCharacterChatStore = create<CharacterChatState>()(
  persist(
    (set, get) => ({
      ...initialState(),

      createProfile: (draft) => {
        const state = get();
        if (state.profiles.length >= CHARACTER_CHAT_PROFILE_LIMIT) return null;
        const profile = buildCharacterChatProfile(draft);
        set({ profiles: [profile, ...state.profiles] });
        writeThroughProfile(profile);
        return profile;
      },

      updateProfile: (profileId, draft) => {
        const state = get();
        const existing = state.profiles.find((profile) => profile.id === profileId);
        if (!existing) return null;
        const revised = reviseCharacterChatProfile(existing, draft);
        set({
          profiles: state.profiles.map((profile) =>
            profile.id === profileId ? revised : profile,
          ),
        });
        writeThroughProfile(revised);
        return revised;
      },

      removeProfile: (profileId) => {
        const state = get();
        set({
          profiles: state.profiles.filter((profile) => profile.id !== profileId),
          sessions: state.sessions.filter((session) => session.profileId !== profileId),
        });
      },

      setProfileChatEnabled: (profileId, enabled) => {
        const state = get();
        const existing = state.profiles.find((profile) => profile.id === profileId);
        if (!existing || existing.chatEnabled === enabled) return;
        const draft = { ...characterChatProfileToDraft(existing), chatEnabled: enabled };
        const revised = reviseCharacterChatProfile(existing, draft);
        set({
          profiles: state.profiles.map((profile) =>
            profile.id === profileId ? revised : profile,
          ),
        });
        writeThroughProfile(revised);
      },

      getProfile: (profileId) => get().profiles.find((profile) => profile.id === profileId),

      ensureSession: (profileId) => {
        const state = get();
        const existing = state.sessions.find((session) => session.profileId === profileId);
        if (existing) return existing;
        const profile = state.profiles.find((item) => item.id === profileId);
        if (!profile) return null;
        const now = new Date().toISOString();
        const greeting: CharacterChatMessage = {
          id: createSecureRandomUuid(),
          role: "character",
          text: resolveCharacterGreeting(profile),
          createdAt: now,
        };
        const session: CharacterChatSession = {
          id: createSecureRandomUuid(),
          profileId,
          messages: [greeting],
          createdAt: now,
          updatedAt: now,
        };
        set({ sessions: [...state.sessions, session] });
        return session;
      },

      getSession: (profileId) =>
        get().sessions.find((session) => session.profileId === profileId),

      appendMessage: (profileId, role, text) => {
        const state = get();
        const session = state.sessions.find((item) => item.profileId === profileId);
        if (!session) return null;
        const message: CharacterChatMessage = {
          id: createSecureRandomUuid(),
          role,
          text,
          createdAt: new Date().toISOString(),
        };
        set({
          sessions: state.sessions.map((item) =>
            item.id === session.id
              ? { ...item, messages: trimMessages([...item.messages, message]), updatedAt: message.createdAt }
              : item,
          ),
          usageByProfile: {
            ...state.usageByProfile,
            [profileId]: {
              ...(state.usageByProfile[profileId] ?? EMPTY_USAGE),
              fanMessages:
                (state.usageByProfile[profileId]?.fanMessages ?? 0) + (role === "fan" ? 1 : 0),
              characterMessages:
                (state.usageByProfile[profileId]?.characterMessages ?? 0) +
                (role === "character" ? 1 : 0),
            },
          },
        });
        return message;
      },

      recordBlockedTurn: (profileId) => {
        const state = get();
        set({
          usageByProfile: {
            ...state.usageByProfile,
            [profileId]: {
              ...(state.usageByProfile[profileId] ?? EMPTY_USAGE),
              blocked: (state.usageByProfile[profileId]?.blocked ?? 0) + 1,
            },
          },
        });
      },

      activitySummary: (profileId) => {
        const state = get();
        const sessions = state.sessions.filter((session) => session.profileId === profileId);
        const usage = state.usageByProfile[profileId] ?? EMPTY_USAGE;
        const lastActiveAt = sessions.reduce<string | null>(
          (latest, session) => (latest === null || session.updatedAt > latest ? session.updatedAt : latest),
          null,
        );
        return {
          profileId,
          sessionCount: sessions.length,
          fanMessageCount: usage.fanMessages,
          characterMessageCount: usage.characterMessages,
          blockedCount: usage.blocked,
          lastActiveAt,
        };
      },

      resetForTests: () => set({ ...initialState() }),
    }),
    {
      name: CHARACTER_CHAT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
