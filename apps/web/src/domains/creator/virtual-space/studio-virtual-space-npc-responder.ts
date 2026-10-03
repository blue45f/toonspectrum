/**
 * LLM 대화형 AI NPC (Track 4 · 벤치마크 gap 3)
 *
 * 안내원 NPC가 실제 질문에 답하는 형태. 실제 LLM 연동은 API 키가 필요하므로
 * 응답자(responder) 인터페이스를 플러그형으로 설계하고, 기본은 스크립트/모의
 * 응답으로 동작한다.
 *
 * 확장 포인트 (코드·문서 명시):
 * - `StudioNpcResponder`: `respond(input)` 하나만 구현하면 되는 인터페이스.
 *   LLM 어댑터는 이 인터페이스만 구현해서 갈아끼우면 된다.
 * - `createLlmNpcResponder(config)`: 팩토리. endpoint·apiKey가 갖춰지면
 *   실제 어댑터를 반환하고, 지금은 설정 부족을 알리는 스텁을 반환한다.
 *   실제 구현은 fetch/SSE 스트리밍 + 시스템 프롬프트(아키타입 역할 주입)로
 *   교체한다 (후속 작업 — API 키는 Secure Vault 경유).
 * - 스크립트 응답자는 아키타입 preset 대사(`studioNpcArchetypeDialogue`)를
 *   재사용하므로, 대사를 고치면 모의 응답도 함께 바뀐다.
 */

import {
  studioNpcArchetypeDialogue,
  type StudioNpcArchetypeKey,
} from "./studio-virtual-space-npc-archetypes";

/** 응답 요청. */
export interface StudioNpcResponderInput {
  readonly npcId: string;
  readonly archetypeKey: string;
  readonly npcName: string;
  readonly userText: string;
  readonly locale: "ko" | "en";
  readonly history: readonly StudioNpcResponderTurn[];
  readonly context?: {
    readonly roomName?: string;
    readonly nearbyLabel?: string;
  };
}

export interface StudioNpcResponderTurn {
  readonly role: "user" | "npc";
  readonly text: string;
}

/** 응답 결과. */
export interface StudioNpcResponderResult {
  readonly textKo: string;
  readonly textEn: string;
  /** 모의/스크립트 응답 표시. */
  readonly scripted: boolean;
  readonly suggestedFollowups?: readonly { readonly ko: string; readonly en: string }[];
}

/**
 * NPC 응답자 (플러그형).
 * LLM 어댑터·스크립트·모의 모두 이 인터페이스를 구현한다.
 */
export interface StudioNpcResponder {
  readonly id: string;
  respond(input: StudioNpcResponderInput): Promise<StudioNpcResponderResult> | StudioNpcResponderResult;
}

/** 대화 세션 (히스토리 윈도우 포함). */
export interface StudioNpcConversation {
  readonly npcId: string;
  readonly archetypeKey: string;
  readonly npcName: string;
  readonly turns: readonly StudioNpcResponderTurn[];
}

/** 히스토리에 남길 최대 턴 수. */
export const STUDIO_NPC_CONVERSATION_WINDOW = 6;

export function createNpcConversation(npcId: string, archetypeKey: string, npcName: string): StudioNpcConversation {
  return { npcId, archetypeKey, npcName, turns: [] };
}

function trimHistory(turns: readonly StudioNpcResponderTurn[]): readonly StudioNpcResponderTurn[] {
  return turns.length <= STUDIO_NPC_CONVERSATION_WINDOW
    ? turns
    : turns.slice(turns.length - STUDIO_NPC_CONVERSATION_WINDOW);
}

const GREET_PATTERN = /(안녕|하이|헬로|hello|hi\b|처음)/i;
const THANKS_PATTERN = /(고마워|감사|고맙|thank)/i;
const BYE_PATTERN = /(잘가|바이|빠이|bye|goodbye)/i;
const WHERE_PATTERN = /(어디|어딨|위치|where|위치)/i;

interface ScriptedIntent {
  readonly ko: string;
  readonly en: string;
  readonly followups: readonly (readonly [string, string])[];
}

function intentFor(input: StudioNpcResponderInput, seed: string): ScriptedIntent {
  const text = input.userText;
  const archetypeKey = input.archetypeKey as StudioNpcArchetypeKey;
  const greet = studioNpcArchetypeDialogue(archetypeKey, "greet", seed);
  const idle = studioNpcArchetypeDialogue(archetypeKey, "idle", `${seed}:idle`);
  if (GREET_PATTERN.test(text)) {
    return {
      ko: greet.ko, en: greet.en,
      followups: [["여기 뭐가 있어?", "What's here?"], ["도와줄 수 있어?", "Can you help?"]],
    };
  }
  if (THANKS_PATTERN.test(text)) {
    return {
      ko: "천만에요! 또 놀러 오세요.", en: "You're welcome! Come again!",
      followups: [],
    };
  }
  if (BYE_PATTERN.test(text)) {
    return {
      ko: "안녕히 가세요! 좋은 하루 보내세요!", en: "Goodbye! Have a great day!",
      followups: [],
    };
  }
  if (WHERE_PATTERN.test(text) && input.context?.roomName) {
    return {
      ko: `${input.context.roomName}에 계세요!`, en: `You're at ${input.context.roomName}!`,
      followups: [["다른 곳도 알려줘", "Tell me about other places"]],
    };
  }
  return {
    ko: idle.ko, en: idle.en,
    followups: [["안녕!", "Hello!"]],
  };
}

/** 기본 스크립트 응답자. 키워드 규칙 + 아키타입 preset 대사. */
export function createScriptedNpcResponder(): StudioNpcResponder {
  return {
    id: "scripted",
    respond(input: StudioNpcResponderInput): StudioNpcResponderResult {
      const userText = input.userText.trim();
      if (!userText) {
        return {
          textKo: "네? 다시 말씀해 주세요!",
          textEn: "Sorry, say that again!",
          scripted: true,
        };
      }
      const seed = `${input.npcId}:${input.history.length}`;
      const intent = intentFor({ ...input, userText }, seed);
      return {
        textKo: intent.ko,
        textEn: intent.en,
        scripted: true,
        suggestedFollowups: intent.followups.map(([ko, en]) => ({ ko, en })),
      };
    },
  };
}

/** LLM 어댑터 설정. */
export interface StudioLlmNpcResponderConfig {
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly model?: string;
}

/**
 * LLM 응답자 팩토리 (스텁).
 * endpoint·apiKey가 모두 있으면 실제 어댑터를 만들어야 하지만,
 * 지금은 설정 부족을 알리는 스텁을 반환한다.
 * 실제 구현 확장 포인트: fetch POST (SSE 스트리밍) + 시스템 프롬프트에
 * 아키타입 역할(roleKo/roleEn)·대사 스타일 주입. API 키는 Secure Vault 경유.
 */
export function createLlmNpcResponder(config: StudioLlmNpcResponderConfig): StudioNpcResponder {
  const configured = Boolean(config.endpoint && config.apiKey);
  return {
    id: configured ? "llm" : "llm-unconfigured",
    respond(_input: StudioNpcResponderInput): StudioNpcResponderResult {
      if (!configured) {
        return {
          textKo: "AI 대화는 API 키를 연결하면 켜져요. 지금은 기본 응답으로 답할게요!",
          textEn: "AI chat turns on after connecting an API key. Answering with default replies for now!",
          scripted: true,
        };
      }
      // 실제 LLM 호출 자리 (후속 작업).
      throw new Error("LLM 어댑터 미구현: fetch/SSE 스트리밍 연동이 필요하다");
    },
  };
}

/** 한 턴 대화: 응답자에게 묻고 히스토리를 갱신한다. */
export async function askStudioNpc(
  responder: StudioNpcResponder,
  conversation: StudioNpcConversation,
  userText: string,
  locale: "ko" | "en",
  context?: StudioNpcResponderInput["context"],
): Promise<{ readonly result: StudioNpcResponderResult; readonly conversation: StudioNpcConversation }> {
  const input: StudioNpcResponderInput = {
    npcId: conversation.npcId,
    archetypeKey: conversation.archetypeKey,
    npcName: conversation.npcName,
    userText,
    locale,
    history: conversation.turns,
    context,
  };
  const result = await responder.respond(input);
  const turns = trimHistory([
    ...conversation.turns,
    { role: "user" as const, text: userText },
    { role: "npc" as const, text: locale === "ko" ? result.textKo : result.textEn },
  ]);
  return { result, conversation: { ...conversation, turns } };
}
