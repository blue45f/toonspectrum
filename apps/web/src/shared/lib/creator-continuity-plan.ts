import type {
  CreatorLaunchGoal,
  CreatorLaunchPace,
  CreatorLaunchRecommendation,
} from "./creator-continuity-model";

const RECOMMENDATIONS: Record<
  CreatorLaunchGoal,
  Record<CreatorLaunchPace, CreatorLaunchRecommendation>
> = {
  draw: {
    quick: { id: "draw-quick", href: "/studio?preset=illustration" },
    project: { id: "draw-project", href: "/studio?preset=webtoon" },
  },
  comic: {
    quick: { id: "comic-quick", href: "/studio?preset=4cut" },
    project: { id: "comic-project", href: "/studio/comic" },
  },
  character: {
    quick: { id: "character-quick", href: "/shaper" },
    project: { id: "character-project", href: "/shaper" },
  },
  materials: {
    quick: { id: "materials-quick", href: "/market" },
    project: { id: "materials-project", href: "/research/assets" },
  },
};

export function getCreatorLaunchRecommendation(
  goal: CreatorLaunchGoal,
  pace: CreatorLaunchPace,
): CreatorLaunchRecommendation {
  return RECOMMENDATIONS[goal][pace];
}
