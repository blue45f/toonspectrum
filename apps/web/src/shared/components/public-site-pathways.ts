import { activePublicJourney, PUBLIC_JOURNEY as DESTINATION_JOURNEY, type PublicJourneyId } from "./public-site-destinations";

export type PublicJourneyPhase = "discover" | "learn" | "resources" | "create" | "share";
const PHASE: Record<PublicJourneyId, PublicJourneyPhase> = {
  discover: "discover", learn: "learn", market: "resources", make: "create", share: "share",
};
export const PUBLIC_JOURNEY = DESTINATION_JOURNEY.map((step) => ({ ...step, id: PHASE[step.id] }));

/** Compatibility phase names share the canonical segment-boundary/alias policy. */
export function publicJourneyPhase(pathname: string): PublicJourneyPhase | undefined {
  const current = activePublicJourney(pathname);
  return current ? PHASE[current] : undefined;
}

const DESTINATIONS = {
  research: { href: "/research", phase: "discover", tag: "FIND YOUR SPARK", ko: "다음 컷의 자료 찾기", en: "Find your next reference", bodyKo: "배경과 복식, 빛과 구도. 출처를 확인하고 장면의 근거를 모으세요.", bodyEn: "Collect sourced references for settings, costumes, light and composition.", image: "/brand/atelier-world.webp" },
  learn: { href: "/learn", phase: "learn", tag: "GROW YOUR CRAFT", ko: "표현의 다음 단계 배우기", en: "Grow your creative practice", bodyKo: "도구 이름보다 하고 싶은 일부터. 나에게 필요한 기법을 찾아보세요.", bodyEn: "Start with what you want to make and find a technique to help you get there.", image: "/brand/atelier-process.webp" },
  resources: { href: "/market/browse", phase: "resources", tag: "MAKE IT YOUR OWN", ko: "내 장면에 맞는 재료 고르기", en: "Find materials for your scene", bodyKo: "브러시와 소재, 색과 공간. 호환성과 사용 조건을 함께 확인하세요.", bodyEn: "Explore brushes, materials and color with compatibility and usage terms in view.", image: "/brand/atelier-materials.webp" },
  story: { href: "/story-lab", phase: "create", tag: "SHAPE YOUR STORY", ko: "영감을 이야기로 정리하기", en: "Turn an idea into a story", bodyKo: "인물의 욕망과 선택을 정리하고, 다음에 그릴 장면의 중심을 잡으세요.", bodyEn: "Develop your character’s goals and choices, then find the focus of your next scene.", image: "/brand/atelier-process.webp" },
  share: { href: "/showcase", phase: "share", tag: "STORIES MEET HERE", ko: "다른 창작자의 시선 만나기", en: "Meet another artist’s perspective", bodyKo: "다양한 작품을 보고, 인상 깊은 표현을 발견하고, 나의 작업을 소개하세요.", bodyEn: "Discover original work, explore different perspectives and introduce your own.", image: "/brand/atelier-world.webp" },
} as const;

type DestinationKey = keyof typeof DESTINATIONS;
const NEXT: Record<PublicJourneyPhase, readonly DestinationKey[]> = {
  discover: ["research", "learn", "story"],
  learn: ["resources", "story", "share"],
  resources: ["learn", "story", "share"],
  create: ["research", "resources", "share"],
  share: ["research", "learn", "resources"],
};

/** Only real, read-only destinations; never automatically enters the editor. */
export function publicSiteNextSteps(pathname: string) {
  const phase = publicJourneyPhase(pathname);
  const keys: readonly DestinationKey[] = phase ? NEXT[phase] : ["research", "learn", "resources"];
  return keys.map((key) => DESTINATIONS[key]).filter((destination) => {
    const normalized = pathname.replace(/\/+$/u, "");
    return normalized !== destination.href && !normalized.startsWith(`${destination.href}/`);
  });
}
