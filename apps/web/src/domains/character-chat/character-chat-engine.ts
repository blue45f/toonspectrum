/**
 * 캐릭터 챗 엔진 어댑터 — LLM 연동을 이 인터페이스 뒤에 둔다.
 *
 * 정책(파일럿): 플랫폼이 비용을 부담하는 경로는 아직 붙이지 않는다.
 * 독자·작가가 `api-key-hub`(/settings/ai)에 등록한 자기 키(BYOK)를 공유
 * 텍스트 완성(`completeUserAiTextDetailed`)으로 재사용하는 어댑터만 제공한다.
 * 키가 없으면 엔진은 `not_configured`를 돌려주고, 화면은 "준비 중/키 등록
 * 안내" 상태를 보여준다. 플랫폼 키로 열 때는 월 상한을 숫자로 고정하고 이
 * 인터페이스를 구현하는 어댑터만 갈아 끼우면 된다 — 화면·스토어·프롬프트는
 * 손대지 않는다.
 *
 * 에러 계약: `generateReply`는 절대 throw하지 않는다. 스튜디오 AI 클라이언트와
 * 같은 성공/실패 결과 타입을 돌려줘 호출부가 try/catch 없이 분기할 수 있게 한다.
 */

import {
  completeUserAiTextDetailed,
  UserAiTransportError,
} from "@/shared/ai/user-ai-transport";
import {
  resolvedUserAiRoutes,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import { sanitizeCharacterReply } from "./character-chat-filter";
import {
  buildCharacterChatSystemPrompt,
  buildCharacterChatUserPrompt,
} from "./character-chat-prompt";
import type {
  CharacterChatMessage,
  CharacterChatProfile,
} from "./character-chat-types";

/**
 * 플랫폼 키 경로를 열 때 적용할 프로필당 월 메시지 상한 기본값.
 * BYOK 경로에서는 강제하지 않고 계측만 한다(비용 부담이 키 주인에게 있다).
 */
export const CHARACTER_CHAT_PLATFORM_MONTHLY_MESSAGE_CAP = 300;

export type CharacterChatEngineErrorCode =
  | "not_configured"
  | "request_failed"
  | "empty_reply";

export type CharacterChatEngineResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly code: CharacterChatEngineErrorCode;
      readonly error: string;
    };

export interface CharacterChatEngineInput {
  readonly profile: CharacterChatProfile;
  readonly history: readonly CharacterChatMessage[];
  readonly userText: string;
  readonly signal?: AbortSignal;
}

export interface CharacterChatEngine {
  readonly id: string;
  generateReply(input: CharacterChatEngineInput): Promise<CharacterChatEngineResult>;
}

/** 텍스트 완성 함수 — 테스트에서 스텁으로 교체할 수 있는 주입 지점. */
export type CharacterChatCompleter = (
  system: string,
  user: string,
  signal?: AbortSignal,
) => Promise<string>;

async function defaultCompleter(
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const completed = await completeUserAiTextDetailed(system, user, signal);
  return completed.content;
}

/** 설정 안에 "글" 용도로 쓸 수 있는 연결이 하나라도 있는지. */
export function hasCharacterChatTextRoute(configuration: UserAiConfiguration): boolean {
  return (configuration.connections ?? []).some(
    (connection) => resolvedUserAiRoutes(connection, "text").length > 0,
  );
}

const NOT_CONFIGURED_MESSAGE =
  "AI 연결이 아직 설정되지 않았어요. 키를 등록하면 캐릭터와 대화를 시작할 수 있어요.";

/** 키가 없을 때의 엔진 — 설정 안내로 유도하는 결과만 돌려준다. */
export function createUnavailableCharacterChatEngine(): CharacterChatEngine {
  return {
    id: "unavailable",
    async generateReply() {
      return { ok: false, code: "not_configured", error: NOT_CONFIGURED_MESSAGE };
    },
  };
}

/**
 * BYOK 엔진 — 사용자가 등록한 텍스트 연결로 캐릭터 답변을 만든다.
 * 답변이 금지 주제를 건드리면 필터가 회피 문구로 교체한 뒤 돌려준다.
 */
export function createByokCharacterChatEngine(
  completer: CharacterChatCompleter = defaultCompleter,
): CharacterChatEngine {
  return {
    id: "byok-user-ai",
    async generateReply(input) {
      const system = buildCharacterChatSystemPrompt(input.profile);
      const user = buildCharacterChatUserPrompt(input.profile, input.history, input.userText);
      let raw: string;
      try {
        raw = await completer(system, user, input.signal);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { ok: false, code: "request_failed", error: "답변 생성이 취소됐어요." };
        }
        const notConfigured =
          error instanceof UserAiTransportError && error.code === "not-configured";
        return {
          ok: false,
          code: notConfigured ? "not_configured" : "request_failed",
          error: notConfigured
            ? NOT_CONFIGURED_MESSAGE
            : "캐릭터 답변을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        };
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        return {
          ok: false,
          code: "empty_reply",
          error: "캐릭터가 답을 하지 않았어요. 다시 한 번 말해 주세요.",
        };
      }
      return { ok: true, text: sanitizeCharacterReply(input.profile, trimmed).text };
    },
  };
}

/**
 * 현재 AI 설정에 맞는 엔진을 고른다.
 * 텍스트 연결이 있으면 BYOK, 없으면 안내용 unavailable 엔진.
 * 플랫폼 키 경로가 열리면 이 판정 앞에 상한 검사를 둔 어댑터를 추가한다.
 */
export function resolveCharacterChatEngine(
  configuration: UserAiConfiguration,
  completer?: CharacterChatCompleter,
): CharacterChatEngine {
  if (!hasCharacterChatTextRoute(configuration)) {
    return createUnavailableCharacterChatEngine();
  }
  return createByokCharacterChatEngine(completer);
}
