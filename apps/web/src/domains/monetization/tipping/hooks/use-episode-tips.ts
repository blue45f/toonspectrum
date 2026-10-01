/**
 * use-episode-tips.ts
 *
 * 특정 회차의 후원 집계 상태를 구독하는 훅.
 * tip-store의 변경 이벤트에 반응해 항상 최신 집계를 보여준다.
 */
import { useCallback, useEffect, useState } from "react";

import {
  listTipsByEpisode,
  subscribeTipStore,
} from "../models/tip-store";
import {
  summarizeEpisodeTips,
  type EpisodeTipSummary,
  type TipRecord,
} from "../models/tip-model";

export interface EpisodeTipsState {
  readonly tips: readonly TipRecord[];
  readonly summary: EpisodeTipSummary;
  readonly refresh: () => void;
}

export function useEpisodeTips(episodeId: string): EpisodeTipsState {
  const [tips, setTips] = useState<readonly TipRecord[]>(() =>
    listTipsByEpisode(episodeId),
  );

  const refresh = useCallback(() => {
    setTips(listTipsByEpisode(episodeId));
  }, [episodeId]);

  useEffect(() => {
    refresh();
    return subscribeTipStore(refresh);
  }, [refresh]);

  return {
    tips,
    summary: summarizeEpisodeTips(episodeId, tips),
    refresh,
  };
}
