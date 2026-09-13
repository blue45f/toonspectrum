import { DISCOVER_PURPOSE_PREFIXES, isPublicCreativeRoute } from "./site-public-routes";

export const PUBLIC_JOURNEY = [
  { id: "discover", href: "/discover", ko: "영감 찾기", en: "Discover", koDescription: "작품과 레퍼런스에서 다음 장면의 힌트를 찾아보세요.", enDescription: "Find your next scene in stories and references.", paths: [...DISCOVER_PURPOSE_PREFIXES, "/research", "/now", "/news", "/insights", "/opportunities"] },
  { id: "learn", href: "/learn", ko: "기법 익히기", en: "Learn", koDescription: "작은 레슨과 실전 레시피로 표현의 폭을 넓혀보세요.", enDescription: "Build your skills with small lessons and practical recipes.", paths: ["/learn", "/help", "/guide"] },
  { id: "market", href: "/market", ko: "재료 고르기", en: "Resources", koDescription: "브러시와 배경을 살펴보고 작품에 맞는 재료를 골라보세요.", enDescription: "Explore brushes and backgrounds that fit your work.", paths: ["/market"] },
  { id: "make", href: "/make", ko: "장면 그리기", en: "Create", koDescription: "아이디어를 준비했다면 창작 공간에서 시작하세요.", enDescription: "Turn your idea into a scene in the creative workspace.", paths: ["/make", "/design", "/story-lab"] },
  { id: "share", href: "/showcase", ko: "작품 나누기", en: "Share", koDescription: "다른 창작자의 작품을 만나고 이야기와 피드백을 나눠보세요.", enDescription: "Meet other creators through their work and feedback.", paths: ["/showcase", "/create", "/community", "/reviews", "/pencafe"] },
] as const;

export type PublicJourneyId = (typeof PUBLIC_JOURNEY)[number]["id"];

export function activePublicJourney(pathname: string): PublicJourneyId | undefined {
  const path = pathname.replace(/\/+$/u, "") || "/";
  return PUBLIC_JOURNEY.find((item) => item.paths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)))?.id;
}

/** Contextual onward links, not a second global menu or an unsolicited editor launch. */
export function nextPublicDestinations(pathname: string) {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (path === "/" || !isPublicCreativeRoute(path)) return [];
  const active = activePublicJourney(path);
  const priorities: readonly PublicJourneyId[] = active === "discover"
    ? ["learn", "market", "share"]
    : active === "learn"
      ? ["market", "discover", "share"]
      : active === "market"
        ? ["learn", "share", "discover"]
        : ["discover", "learn", "market"];
  return priorities.flatMap((id) => {
    const destination = PUBLIC_JOURNEY.find((item) => item.id === id);
    return destination && destination.id !== active ? [destination] : [];
  });
}
