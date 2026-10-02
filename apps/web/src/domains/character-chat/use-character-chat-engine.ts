/**
 * 현재 AI 설정에서 캐릭터 챗 엔진을 얻는 훅.
 *
 * 설정(AI 키 볼트)이 바뀌면 엔진도 그에 맞춰 바뀐다. 텍스트 연결이 없으면
 * unavailable 엔진이 돌아와 화면이 "키 등록 안내" 상태가 된다 — 호출부(페이지)는
 * 엔진이 준비됐는지만 보고, 키 존재 여부를 직접 검사하지 않는다.
 */

import { useMemo } from "react";

import { useUserAi } from "@/shared/ai/user-ai-store";

import {
  hasCharacterChatTextRoute,
  resolveCharacterChatEngine,
  type CharacterChatEngine,
} from "./character-chat-engine";

export interface CharacterChatEngineState {
  readonly engine: CharacterChatEngine;
  /** 텍스트 연결이 있어 실제 대화가 가능한 상태인지. */
  readonly ready: boolean;
}

export function useCharacterChatEngine(): CharacterChatEngineState {
  const { configuration } = useUserAi();
  return useMemo(
    () => ({
      engine: resolveCharacterChatEngine(configuration),
      ready: hasCharacterChatTextRoute(configuration),
    }),
    [configuration],
  );
}
