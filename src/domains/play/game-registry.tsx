// 아케이드 게임 레지스트리 — 새 게임은 여기에 한 줄 추가하면 허브/라우팅에 자동 노출.
// 게임 본체는 lazy 로드해 무거운 의존(3D/웹캠)이 /play 진입 청크를 부풀리지 않게 한다.

import { Swords } from "lucide-react";
import { lazy } from "react";

import type { PlayGameMeta } from "./play-types";

export const PLAY_GAMES: PlayGameMeta[] = [
  {
    id: "card-battle",
    label: "웹툰 카드 배틀",
    tagline: "인기 웹툰을 카드로 — 하스스톤式 턴제 대전",
    Icon: Swords,
    hue: 268,
    category: "배틀",
    Component: lazy(() => import("./games/card-battle/CardBattleGame")),
  },
];

export function findGame(id: string | undefined): PlayGameMeta | undefined {
  return PLAY_GAMES.find((g) => g.id === id);
}
