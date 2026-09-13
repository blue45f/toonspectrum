// 아케이드 게임 레지스트리 — 새 게임은 여기에 한 줄 추가하면 허브/라우팅에 자동 노출.
// 게임 본체는 lazy 로드해 무거운 의존(3D/웹캠)이 /play 진입 청크를 부풀리지 않게 한다.

import { Dices, Eye, Grid3x3, Hand, HelpCircle, LayoutGrid, Palette, PenTool, Pencil, TrendingUp } from "lucide-react";
import { lazy } from "react";

import type { PlayGameMeta } from "./play-types";

export const PLAY_GAMES: PlayGameMeta[] = [
  {
    id: "sketch-sprint", label: "드로잉 스프린트", tagline: "오늘의 오리지널 주제로 짧게 그리고 PNG·SVG로 간직하세요.",
    Icon: Pencil, hue: 42, category: "드로잉", collection: "draw",
    duration: "30초–2분", localOnly: true,
    Component: lazy(() => import("./games/creative/SketchSprint")),
  },
  {
    id: "line-dojo", label: "선 긋기 도장", tagline: "직선부터 곡선까지 여섯 가지 가이드로 손의 리듬을 깨우세요.",
    Icon: PenTool, hue: 65, category: "드로잉", collection: "draw",
    duration: "2–5분", localOnly: true,
    Component: lazy(() => import("./games/creative/LineDojo")),
  },
  {
    id: "story-dice", label: "스토리 주사위", tagline: "장르·주인공·장소·사건·반전을 조합하고 마음에 드는 카드는 잠그세요.",
    Icon: Dices, hue: 85, category: "스토리", collection: "story",
    duration: "3–5분", localOnly: true,
    Component: lazy(() => import("./games/creative/StoryDice")),
  },
  {
    id: "four-panel", label: "4컷 콘티 빌더", tagline: "스케치와 대사, 카메라 연출을 엮어 나만의 네 컷을 완성하세요.",
    Icon: LayoutGrid, hue: 42, category: "스토리", collection: "story",
    duration: "5–15분", localOnly: true,
    Component: lazy(() => import("./games/creative/FourPanel")),
  },
  {
    id: "color-sense", label: "컬러 감각 훈련", tagline: "색상·채도·명도로 목표색을 재현하는 다섯 라운드 감각 게임.",
    Icon: Eye, hue: 150, category: "색감", collection: "sense",
    duration: "2–3분", localOnly: true,
    Component: lazy(() => import("./games/creative/ColorSense")),
  },
  {
    id: "palette-lab", label: "팔레트 실험실", tagline: "색을 잠그고 조화를 탐색해 작품용 팔레트와 CSS를 만드세요.",
    Icon: Palette, hue: 232, category: "색감", collection: "sense",
    duration: "2–5분", localOnly: true,
    Component: lazy(() => import("./games/creative/PaletteLab")),
  },
  {
    id: "rps",
    label: "웹툰 가위바위보",
    tagline: "손동작·음성으로 웹툰봇과 가위바위보 · 묵찌빠 (버튼 플레이도 가능)",
    Icon: Hand,
    hue: 142,
    category: "트래킹",
    usesCamera: true,
    Component: lazy(() => import("./games/rps/RpsGame")),
  },
  {
    id: "quiz",
    label: "웹툰 퀴즈",
    tagline: "커버·작가·장르 힌트로 제목 맞히기",
    Icon: HelpCircle,
    hue: 200,
    category: "퀴즈",
    Component: lazy(() => import("./games/quiz/QuizGame")),
  },
  {
    id: "popularity-duel",
    label: "웹툰 인기 대결",
    tagline: "둘 중 더 인기 있는 웹툰 맞히기 (Higher/Lower)",
    Icon: TrendingUp,
    hue: 25,
    category: "퀴즈",
    Component: lazy(() => import("./games/popularity-duel/PopularityDuelGame")),
  },
  {
    id: "memory",
    label: "웹툰 짝맞추기",
    tagline: "커버를 뒤집어 같은 작품 짝 찾기",
    Icon: Grid3x3,
    hue: 150,
    category: "퍼즐",
    Component: lazy(() => import("./games/memory/MemoryGame")),
  },
  {
    id: "roulette",
    label: "웹툰 룰렛",
    tagline: "돌려서 오늘의 웹툰 추천 받기",
    Icon: Dices,
    hue: 330,
    category: "추천",
    Component: lazy(() => import("./games/roulette/RouletteGame")),
  },
];

export function findGame(id: string | undefined): PlayGameMeta | undefined {
  return PLAY_GAMES.find((g) => g.id === id);
}
