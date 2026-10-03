/**
 * 캐릭터 챗 프로필 모델 — 정규화·검증·생성과 공개 목록 선택.
 *
 * 스튜디오 캐논 시트(`creator/ai/canon/studio-character-canon.ts`)와 같은
 * 원칙을 따른다: 입력은 NFKC 정규화하고 길이 상한을 강제해 localStorage와
 * 프롬프트 양쪽이 폭주하지 않게 한다. 이 모듈은 순수 로직만 담는다
 * (저장은 `character-chat-store.ts`, 프롬프트 조립은 `character-chat-prompt.ts`).
 */

import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import type {
  CharacterChatProfile,
  CharacterChatProfileDraft,
} from "./character-chat-types";

export const CHARACTER_CHAT_STORAGE_KEY = "toonstudio-character-chat-v1";
export const CHARACTER_CHAT_PROFILES_SERVER_PATH = "/api/me/character-chat-profiles";

/** 작가가 이 브라우저에 유지할 수 있는 프로필 상한 — 실수로 목록이 폭주하는 것을 막는다. */
export const CHARACTER_CHAT_PROFILE_LIMIT = 24;
export const PROFILE_CHARACTER_NAME_MAX = 40;
export const PROFILE_WORK_TITLE_MAX = 60;
export const PROFILE_AUTHOR_NAME_MAX = 40;
export const PROFILE_DESCRIPTION_MAX = 120;
export const PROFILE_PERSONALITY_MAX = 600;
export const PROFILE_SPEECH_STYLE_MAX = 300;
export const PROFILE_WORLDVIEW_MAX = 1200;
export const PROFILE_GREETING_MAX = 200;
export const PROFILE_APPEARANCE_HINT_MAX = 200;
export const FORBIDDEN_TOPIC_MAX = 40;
export const FORBIDDEN_TOPICS_LIMIT = 12;

function normalizeText(value: string, max: number): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function normalizeMultiline(value: string, max: number): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, max);
}

function normalizeSlug(value: string): string | null {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "");
  return slug ? slug.slice(0, 80) : null;
}

/** 이미지 URL은 사이트 내 경로·http(s)만 허용한다 — data URL은 저장 공간을 폭증시킨다. */
function normalizeAvatarUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed.slice(0, 500);
  }
  return null;
}

/** 금지 주제 목록 정규화 — 중복 제거, 빈 항목 제거, 상한 적용. */
export function normalizeForbiddenTopics(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const topic of topics) {
    const normalized = normalizeText(topic, FORBIDDEN_TOPIC_MAX);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= FORBIDDEN_TOPICS_LIMIT) break;
  }
  return result;
}

/** 폼 입력 검증 — 실패 사유를 사람이 읽을 수 있는 문장으로 돌려준다(저장 위치 무관). */
export function validateCharacterChatProfileDraft(
  draft: CharacterChatProfileDraft,
): readonly string[] {
  const errors: string[] = [];
  if (!normalizeText(draft.characterName, PROFILE_CHARACTER_NAME_MAX)) {
    errors.push("캐릭터 이름을 입력해 주세요.");
  }
  if (!normalizeText(draft.workTitle, PROFILE_WORK_TITLE_MAX)) {
    errors.push("작품 이름을 입력해 주세요.");
  }
  if (!normalizeText(draft.personality, PROFILE_PERSONALITY_MAX)) {
    errors.push("캐릭터의 성격을 적어 주세요. 챗에서 어떤 사람처럼 말할지가 여기서 결정돼요.");
  }
  if (!normalizeText(draft.speechStyle, PROFILE_SPEECH_STYLE_MAX)) {
    errors.push("말투를 적어 주세요. 예: 짧은 반말, 존댓말, 사투리 등.");
  }
  if (draft.chatEnabled && !normalizeMultiline(draft.worldview, PROFILE_WORLDVIEW_MAX)) {
    errors.push("챗을 공개하려면 세계관·배경 설정을 적어 주세요. 캐릭터가 아는 범위를 정하는 근거예요.");
  }
  return errors;
}

/** 초안을 저장 가능한 프로필로 만든다. id/시각은 옵션으로 주입할 수 있다(테스트 결정성). */
export function buildCharacterChatProfile(
  draft: CharacterChatProfileDraft,
  options: {
    readonly id?: string;
    readonly now?: string;
    readonly isDemo?: boolean;
    readonly ownerId?: string | null;
  } = {},
): CharacterChatProfile {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? createSecureRandomUuid(),
    characterName: normalizeText(draft.characterName, PROFILE_CHARACTER_NAME_MAX),
    workTitle: normalizeText(draft.workTitle, PROFILE_WORK_TITLE_MAX),
    workSlug: normalizeSlug(draft.workSlug),
    authorName: normalizeText(draft.authorName, PROFILE_AUTHOR_NAME_MAX),
    description: normalizeText(draft.description, PROFILE_DESCRIPTION_MAX),
    personality: normalizeMultiline(draft.personality, PROFILE_PERSONALITY_MAX),
    speechStyle: normalizeMultiline(draft.speechStyle, PROFILE_SPEECH_STYLE_MAX),
    worldview: normalizeMultiline(draft.worldview, PROFILE_WORLDVIEW_MAX),
    greeting: normalizeMultiline(draft.greeting, PROFILE_GREETING_MAX),
    forbiddenTopics: normalizeForbiddenTopics(draft.forbiddenTopics),
    appearanceHint: normalizeMultiline(draft.appearanceHint, PROFILE_APPEARANCE_HINT_MAX),
    avatarUrl: normalizeAvatarUrl(draft.avatarUrl),
    canonSheetId: draft.canonSheetId.trim() ? draft.canonSheetId.trim().slice(0, 80) : null,
    chatEnabled: draft.chatEnabled,
    isDemo: options.isDemo ?? false,
    ownerId: options.ownerId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 기존 프로필을 초안 내용으로 갱신한다 — id와 createdAt은 유지한다. */
export function reviseCharacterChatProfile(
  profile: CharacterChatProfile,
  draft: CharacterChatProfileDraft,
  now?: string,
): CharacterChatProfile {
  const revised = buildCharacterChatProfile(draft, {
    id: profile.id,
    now: profile.createdAt,
    isDemo: profile.isDemo,
    ownerId: profile.ownerId ?? null,
  });
  return { ...revised, updatedAt: now ?? new Date().toISOString() };
}

/** 수정 폼 초기값 — 저장된 프로필을 초안 형태로 되돌린다. */
export function characterChatProfileToDraft(
  profile: CharacterChatProfile,
): CharacterChatProfileDraft {
  return {
    characterName: profile.characterName,
    workTitle: profile.workTitle,
    workSlug: profile.workSlug ?? "",
    authorName: profile.authorName,
    description: profile.description,
    personality: profile.personality,
    speechStyle: profile.speechStyle,
    worldview: profile.worldview,
    greeting: profile.greeting,
    forbiddenTopics: [...profile.forbiddenTopics],
    appearanceHint: profile.appearanceHint,
    avatarUrl: profile.avatarUrl ?? "",
    canonSheetId: profile.canonSheetId ?? "",
    chatEnabled: profile.chatEnabled,
  };
}

/** 팬 화면에 노출되는 프로필만 고른다 — 작가 opt-in(chatEnabled)이 켜진 것만. */
export function selectPublicCharacterChatProfiles(
  profiles: readonly CharacterChatProfile[],
): CharacterChatProfile[] {
  return profiles.filter((profile) => profile.chatEnabled);
}

/** 작품 페이지 진입 파라미터(workSlug)와 맞는 공개 프로필. */
export function findPublicProfileForWork(
  profiles: readonly CharacterChatProfile[],
  workSlug: string | null,
): CharacterChatProfile | null {
  if (!workSlug) return null;
  const normalized = normalizeSlug(workSlug);
  if (!normalized) return null;
  return (
    selectPublicCharacterChatProfiles(profiles).find(
      (profile) => profile.workSlug === normalized,
    ) ?? null
  );
}

/** 첫 인사 — 작가가 정한 인사가 없으면 성격·말투에 맞춘 기본 문구를 쓴다. */
export function resolveCharacterGreeting(profile: CharacterChatProfile): string {
  if (profile.greeting) return profile.greeting;
  return `안녕, 나는 ${profile.workTitle}의 ${profile.characterName}야. 궁금한 거 있으면 편하게 물어봐.`;
}
