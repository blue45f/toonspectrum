import type { DesignTheme } from "./theme-presets";

export type ThemeSceneLayout =
  | "aurora"
  | "blossom"
  | "starlight"
  | "ink"
  | "paper"
  | "graphite"
  | "midnight"
  | "sepia"
  | "contrast";

export interface ThemeSceneAsset {
  id: ThemeSceneLayout;
  src: string;
  altKo: string;
  altEn: string;
}

/** Distinct local illustrations, not recolours of one shared image. */
export const THEME_SCENE_ASSETS: Readonly<Record<DesignTheme, ThemeSceneAsset>> = {
  aurora: {
    id: "aurora",
    src: "/brand/theme-scenes/aurora-studio.svg",
    altKo: "스펙트럼 리본과 작업 화면이 떠 있는 밝은 오로라 창작 스튜디오",
    altEn: "A bright Aurora studio with spectrum ribbons and floating drawing panels",
  },
  blossom: {
    id: "blossom",
    src: "/brand/theme-scenes/blossom-studio.svg",
    altKo: "고양이 일러스트레이터와 꽃잎이 있는 복숭아빛 웹툰 작업실",
    altEn: "A peach-toned webtoon room with a cat illustrator and drifting petals",
  },
  starlight: {
    id: "starlight",
    src: "/brand/theme-scenes/starlight-studio.svg",
    altKo: "달빛 창과 별자리 아래 빛나는 캔버스가 있는 밤 작업실",
    altEn: "A night studio with a moon window, constellations and a glowing canvas",
  },
  dark: {
    id: "ink",
    src: "/brand/theme-scenes/ink-studio.svg",
    altKo: "굵은 붓 자국과 펜촉, 만화 패널로 구성한 잉크 작업실",
    altEn: "An Ink studio composed of bold brush marks, a pen nib and comic panels",
  },
  light: {
    id: "paper",
    src: "/brand/theme-scenes/paper-studio.svg",
    altKo: "콘티 용지와 연필, 자가 펼쳐진 밝은 페이퍼 작업대",
    altEn: "A bright Paper desk with storyboard sheets, pencils and rulers",
  },
  graphite: {
    id: "graphite",
    src: "/brand/theme-scenes/graphite-studio.svg",
    altKo: "원근 격자와 목탄 도구가 놓인 흑백 그래파이트 제도판",
    altEn: "A monochrome Graphite board with perspective guides and charcoal tools",
  },
  midnight: {
    id: "midnight",
    src: "/brand/theme-scenes/midnight-studio.svg",
    altKo: "비 오는 도시 창가와 푸른 모니터가 빛나는 미드나이트 작업실",
    altEn: "A Midnight studio with a rainy city window and blue drawing display",
  },
  sepia: {
    id: "sepia",
    src: "/brand/theme-scenes/sepia-studio.svg",
    altKo: "필름과 마른 잎, 잉크병이 놓인 빈티지 세피아 스크랩북",
    altEn: "A vintage Sepia scrapbook with film, dried leaves and an ink bottle",
  },
  contrast: {
    id: "contrast",
    src: "/brand/theme-scenes/contrast-studio.svg",
    altKo: "검정과 흰색, 노란색 초점 표시로 구성한 고대비 만화 보드",
    altEn: "A high-contrast comic board in black, white and focus yellow",
  },
};

export function getThemeSceneAsset(theme: DesignTheme): ThemeSceneAsset {
  return THEME_SCENE_ASSETS[theme];
}
