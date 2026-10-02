/**
 * use-episode-access.ts
 *
 * 회차 접근 상태를 구독하는 훅. 정책 변경에 반응한다.
 * 서포터 증거(SupporterEvidence)는 호출 측에서 조합해 전달한다.
 */
import { useEffect, useState } from "react";

import {
  NO_SUPPORTER_EVIDENCE,
  resolveEpisodeAccess,
  type EpisodeAccessState,
  type SupporterEvidence,
} from "../models/paywall-model";
import {
  getEarlyAccessPolicy,
  subscribePaywallStore,
} from "../models/paywall-store";

export interface EpisodeAccessInput {
  readonly titleId: string;
  readonly publishedAt: string;
  readonly evidence?: SupporterEvidence;
}

export function useEpisodeAccess({
  titleId,
  publishedAt,
  evidence = NO_SUPPORTER_EVIDENCE,
}: EpisodeAccessInput): EpisodeAccessState {
  const [state, setState] = useState<EpisodeAccessState>(() =>
    resolveEpisodeAccess({
      policy: getEarlyAccessPolicy(titleId),
      publishedAt,
      evidence,
    }),
  );

  useEffect(() => {
    const refresh = () => {
      setState(
        resolveEpisodeAccess({
          policy: getEarlyAccessPolicy(titleId),
          publishedAt,
          evidence,
        }),
      );
    };
    refresh();
    return subscribePaywallStore(refresh);
  }, [titleId, publishedAt, evidence]);

  return state;
}
