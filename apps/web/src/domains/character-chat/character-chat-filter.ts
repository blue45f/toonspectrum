/**
 * 금지 주제 가드 — 작가가 지정한 주제가 대화에 끼어들지 않게 막는다.
 *
 * 팬 입력은 엔진에 넘기기 전에 검사하고, 캐릭터 답변이 금지 주제를 건드리면
 * 캐릭터답게 화제를 돌리는 문구로 교체한다. 단순 키워드 포함 검사라 우회
 * 표현까지 다 잡지는 못한다 — 파일럿의 안전장치이지 검열 시스템이 아니다.
 * 그래도 "작가가 정한 선은 최소한 기계적으로라도 지킨다"는 약속을 코드로 둔다.
 */

import type { CharacterChatProfile } from "./character-chat-types";

/** 비교용 정규화 — 대소문자·전각·공백 차이를 흡수한다. */
function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export interface ForbiddenTopicHit {
  readonly topic: string;
}

/** 텍스트에서 금지 주제와 겹치는 항목을 찾는다. 없으면 빈 배열. */
export function findForbiddenTopicHits(
  profile: Pick<CharacterChatProfile, "forbiddenTopics">,
  text: string,
): readonly ForbiddenTopicHit[] {
  const haystack = normalizeForMatch(text);
  if (!haystack) return [];
  const hits: ForbiddenTopicHit[] = [];
  for (const topic of profile.forbiddenTopics) {
    const needle = normalizeForMatch(topic);
    if (needle && haystack.includes(needle)) hits.push({ topic });
  }
  return hits;
}

export type CharacterChatTurnGuard =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly matchedTopics: readonly string[] };

/** 팬 입력을 엔진에 넘겨도 되는지 판정한다. */
export function guardCharacterChatTurn(
  profile: Pick<CharacterChatProfile, "forbiddenTopics">,
  userText: string,
): CharacterChatTurnGuard {
  const hits = findForbiddenTopicHits(profile, userText);
  if (hits.length === 0) return { allowed: true };
  return { allowed: false, matchedTopics: hits.map((hit) => hit.topic) };
}

export interface CharacterReplySanitization {
  /** 팬에게 보여줄 최종 답변. */
  readonly text: string;
  /** 답변이 금지 주제를 건드려 교체됐으면 true. */
  readonly replaced: boolean;
  readonly matchedTopics: readonly string[];
}

/** 금지 주제가 섞인 캐릭터의 기본 회피 문구 — 세계관 밖 이야기로 돌린다. */
export function characterDeflectionLine(profile: Pick<CharacterChatProfile, "characterName">): string {
  return `그 얘기는 내가 함부로 할 수 있는 게 아니야. 대신 ${profile.characterName}인 나에 대해 다른 걸 물어봐 줄래?`;
}

/**
 * 캐릭터 답변 검열 — 금지 주제가 포함됐으면 회피 문구로 통째로 교체한다.
 * 부분 삭제는 문장을 깨뜨리고 맥락 누출 위험이 있어 교체 방식을 택했다.
 */
export function sanitizeCharacterReply(
  profile: Pick<CharacterChatProfile, "characterName" | "forbiddenTopics">,
  reply: string,
): CharacterReplySanitization {
  const hits = findForbiddenTopicHits(profile, reply);
  if (hits.length === 0) return { text: reply, replaced: false, matchedTopics: [] };
  return {
    text: characterDeflectionLine(profile),
    replaced: true,
    matchedTopics: hits.map((hit) => hit.topic),
  };
}
