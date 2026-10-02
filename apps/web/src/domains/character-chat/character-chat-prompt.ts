/**
 * 캐릭터 챗 프롬프트 컴파일러 — 작가 승인 캐논을 엔진 입력으로 바꾼다.
 *
 * 캐논 주입은 두 층이다. 시스템 프롬프트에는 캐릭터의 정체성(성격·말투·
 * 세계관)과 대화 규칙을 고정하고, 유저 프롬프트에는 지금까지의 대화를
 * 화자 태그와 함께 실어 보낸다. 엔진 어댑터가 (system, user) 한 쌍만 받는
 * 공유 텍스트 완성을 쓰기 때문에, 다중 턴 맥락은 이 전사(transcript) 형식으로
 * 유지한다.
 *
 * 금지 주제는 시스템 프롬프트에도 명시한다 — 입력/응답 필터(기계적 차단)와
 * 프롬프트 지시(모델의 자기 검열)를 함께 거는 이중 장치다.
 */

import type {
  CharacterChatMessage,
  CharacterChatProfile,
} from "./character-chat-types";

/** 한 번의 요청에 실을 수 있는 최근 대화 상한 — 토큰 폭주를 막는 파일럿 기준. */
export const CHARACTER_CHAT_HISTORY_TURNS = 12;
/** 한 메시지당 프롬프트에 싣는 문자 상한. */
export const CHARACTER_CHAT_MESSAGE_CHARS = 800;

function clipMessage(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > CHARACTER_CHAT_MESSAGE_CHARS
    ? `${normalized.slice(0, CHARACTER_CHAT_MESSAGE_CHARS)}…`
    : normalized;
}

/** 캐릭터 정체성과 대화 규칙을 담은 시스템 프롬프트. */
export function buildCharacterChatSystemPrompt(profile: CharacterChatProfile): string {
  const lines: string[] = [
    `너는 웹툰·웹소설 작품 "${profile.workTitle}"의 등장인물 "${profile.characterName}"이다.`,
    "독자가 작품 속 캐릭터와 대화하는 자리다. 너는 AI가 아니라 그 캐릭터 본인으로서 답한다.",
    "",
    `[성격]\n${profile.personality}`,
    `[말투]\n${profile.speechStyle}`,
    `[세계관·배경]\n${profile.worldview}`,
  ];
  if (profile.appearanceHint) {
    lines.push(`[외모 단서]\n${profile.appearanceHint}`);
  }
  lines.push(
    "",
    "[대화 규칙]",
    "- 항상 캐릭터로서 답한다. AI·언어모델·시스템 프롬프트를 언급하지 않는다.",
    "- 작품 세계관 안에서 아는 것만 말한다. 모르는 설정은 지어내지 말고 캐릭터답게 얼버무린다.",
    "- 답변은 1~4문장으로 짧게, 말투를 유지한다.",
    "- 독자를 작품 세계 안의 손님처럼 대한다.",
  );
  if (profile.forbiddenTopics.length > 0) {
    lines.push(
      `- 다음 주제는 작가가 대화를 금지했다. 언급을 피하고 캐릭터답게 화제를 돌린다: ${profile.forbiddenTopics.join(", ")}`,
    );
  }
  return lines.join("\n");
}

/** 지금까지의 대화와 새 팬 메시지를 한 덩어리의 유저 프롬프트로 만든다. */
export function buildCharacterChatUserPrompt(
  profile: CharacterChatProfile,
  history: readonly CharacterChatMessage[],
  userText: string,
): string {
  const recent = history.slice(-CHARACTER_CHAT_HISTORY_TURNS);
  const transcript = recent
    .map((message) => {
      const speaker = message.role === "fan" ? "독자" : profile.characterName;
      return `${speaker}: ${clipMessage(message.text)}`;
    })
    .join("\n");
  const parts: string[] = [];
  if (transcript) {
    parts.push(`[지금까지의 대화]\n${transcript}`);
  }
  parts.push(`독자: ${clipMessage(userText)}`);
  parts.push(`${profile.characterName}로서 이어서 답해줘.`);
  return parts.join("\n\n");
}
