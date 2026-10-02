/**
 * 컷츠 시드 — 데모 회차와 피드용 샘플 클립.
 *
 * 실제 회차 연동 전에도 피드·스튜디오를 바로 써볼 수 있도록 가상의
 * 작품/회차를 제공한다. 패널 이미지는 프로시저럴 아트로 생성되므로
 * 외부 에셋이 전혀 필요 없다.
 */

import { buildCutsClip } from "./cuts-clip-builder";
import { buildRemixClip } from "./cuts-remix";
import type { CutsClip, EpisodeSource } from "./cuts-types";

/** 클립 만들기 UI에서 고를 수 있는 데모 회차 목록. */
export const DEMO_EPISODES: ReadonlyArray<EpisodeSource> = [
  {
    titleId: "midnight-noodle",
    title: "심야 국수집",
    author: "김밤하늘",
    episodeNumber: 12,
    episodeTitle: "마지막 손님",
    panels: [
      {
        alt: "비 내리는 밤, 불 켜진 국수집",
        caption: "비가 오는 밤 11시, 국수집에 마지막 손님이 들어왔다.",
        narration: "[신비]비가 오는 밤 11시,[/신비] 국수집에 마지막 손님이 들어왔다.",
      },
      {
        alt: "주인이 국수를 건네는 장면",
        caption: "주인: \"오늘도 늦었네. 따뜻한 거 하나 말아줄게.\"",
        narration: "주인이 웃으며 말했다. [강조]오늘도 늦었네. 따뜻한 거 하나 말아줄게.[/강조]",
      },
      {
        alt: "김 모락모락 나는 국수 그릇 클로즈업",
        caption: "김 모락모락 — 하루의 피로가 녹아내렸다.",
        narration: "[느리게]김 모락모락.[/느리게] 하루의 피로가 녹아내렸다.",
      },
      {
        alt: "창밖 빗소리와 빈 그릇",
        caption: "빗소리 사이로, 오늘 하루가 조용히 마무리됐다.",
        narration: "빗소리 사이로, [쉼] 오늘 하루가 조용히 마무리됐다.",
      },
    ],
  },
  {
    titleId: "sky-whale",
    title: "하늘 고래",
    author: "박구름",
    episodeNumber: 3,
    episodeTitle: "구름 위의 약속",
    // 작가가 팬 리믹스를 허용한 작품 — 피드에 "리믹스 만들기"가 노출된다.
    remixAllowed: true,
    panels: [
      {
        alt: "구름 사이를 헤엄치는 거대한 고래",
        caption: "구름 사이로 거대한 고래가 헤엄쳐 왔다.",
        narration: "[놀람]구름 사이로[/놀람] 거대한 고래가 헤엄쳐 왔다.",
      },
      {
        alt: "고래 등에 올라탄 소녀",
        caption: "\"약속했잖아. 매년 오늘, 여기서 만나기로.\"",
        narration: "소녀가 외쳤다. [강조]약속했잖아. 매년 오늘, 여기서 만나기로.[/강조]",
      },
      {
        alt: "노을빛 하늘을 나는 고래와 소녀",
        caption: "노을빛 하늘 — 둘만의 항해가 시작됐다.",
        narration: "[기쁨]노을빛 하늘.[/기쁨] 둘만의 항해가 시작됐다.",
      },
    ],
  },
  {
    titleId: "detective-bunsik",
    title: "분식집 탐정단",
    author: "이매콤",
    episodeNumber: 7,
    episodeTitle: "사라진 떡볶이 소스",
    remixAllowed: true,
    panels: [
      {
        alt: "텅 빈 소스 통을 든 분식집 사장",
        caption: "아침에 문을 열자, 비법 소스가 감쪽같이 사라졌다!",
        narration: "아침에 문을 열자, 비법 소스가 감쪽같이 사라졌다!",
      },
      {
        alt: "돋보기를 든 탐정단 아이들",
        caption: "탐정단 출동 — 단서는 바닥에 떨어진 고춧가루뿐.",
        narration: "[빠르게]탐정단 출동.[/빠르게] 단서는 바닥에 떨어진 고춧가루뿐.",
      },
      {
        alt: "고양이가 소스 통 옆에서 낮잠 자는 장면",
        caption: "범인은 바로 옆에서 낮잠 중이었다.",
        narration: "범인은 [쉼] 바로 옆에서 낮잠 중이었다.",
      },
      {
        alt: "함께 떡볶이를 먹는 탐정단",
        caption: "사건 해결! 오늘의 간식은 떡볶이 파티.",
        narration: "[기쁨]사건 해결![/기쁨] 오늘의 간식은 떡볶이 파티.",
      },
    ],
  },
];

/**
 * 피드 초기 시드 클립 — 데모 회차를 변환해 만든다.
 * 시드 클립은 약간의 조회수·좋아요를 미리 가진 것처럼 보인다.
 */
export function buildSeedClips(): CutsClip[] {
  const seeds: Array<{ views: number; likes: number }> = [
    { views: 128400, likes: 9200 },
    { views: 86300, likes: 6100 },
    { views: 45100, likes: 3300 },
  ];
  const clips: CutsClip[] = [];
  DEMO_EPISODES.forEach((episode, index) => {
    const clip = buildCutsClip(episode, "seed");
    if (!clip) return;
    const seed = seeds[index % seeds.length];
    clips.push({ ...clip, views: seed.views, likes: seed.likes });
  });
  // 오래된 순으로 — 피드는 publishClip이 최신순으로 쌓는다.
  const ordered = clips.reverse();
  // 팬 리믹스 샘플 — 허용 작품(하늘 고래)에 팬이 만든 리믹스가 이미 하나 있는 상태를 보여준다.
  const whaleEpisode = DEMO_EPISODES.find((episode) => episode.titleId === "sky-whale");
  const whaleOriginal = ordered.find((clip) => clip.titleId === "sky-whale");
  if (whaleEpisode && whaleOriginal) {
    const fanRemix = buildRemixClip(whaleEpisode, "seed-fan", whaleOriginal.id);
    if (fanRemix) {
      ordered.push({ ...fanRemix, views: 23100, likes: 1800 });
    }
  }
  return ordered;
}
