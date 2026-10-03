import { useCallback, useState } from "react";

import {
  castStudioPollVote,
  closeStudioPoll,
  createStudioPoll,
  type StudioPoll,
  type StudioPollCreateInput,
} from "./studio-virtual-space-poll";

/** 투표는 아직 실시간 동기화 채널이 없어 이 기기에서만 진행되는 로컬 투표다. */
export function useStudioSpacePoll(input: { readonly voterId: string; readonly voterName: string }) {
  const { voterId, voterName } = input;
  const [spacePoll, setSpacePoll] = useState<StudioPoll | null>(null);
  const handleCreatePoll = useCallback((draft: Omit<StudioPollCreateInput, "id" | "createdBySessionId" | "createdByName" | "nowMs">) => {
    const result = createStudioPoll({ ...draft, createdBySessionId: voterId, createdByName: voterName, nowMs: Date.now() });
    if (result.ok) setSpacePoll(result.poll);
  }, [voterId, voterName]);
  const handleVotePoll = useCallback((optionId: string) => {
    setSpacePoll((current) => {
      if (!current) return current;
      const result = castStudioPollVote(current, { optionId, voterSessionId: voterId, voterName, nowMs: Date.now() });
      return result.ok ? result.poll : current;
    });
  }, [voterId, voterName]);
  const handleClosePoll = useCallback(() => {
    setSpacePoll((current) => (current ? closeStudioPoll(current) : current));
  }, []);

  return { spacePoll, handleCreatePoll, handleVotePoll, handleClosePoll };
}
